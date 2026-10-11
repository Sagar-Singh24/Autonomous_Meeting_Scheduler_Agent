from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import StreamingResponse

from app.google.gmail_api import build_gmail_service, send_email
from app.google.oauth import get_oauth_credentials
from app.pollers.gmail_poller import GmailPoller
from app.google.calendar_api import (
    build_calendar_service,
    get_free_busy,
    find_free_slots,
    draft_negotiation_email,
)
from app.agents.transcription import transcribe
from app.agents.extraction import extract_from_transcript
from app.langgraph.graph import run_graph
from app.core.config import SCHEDULE_MIN_SLOT_MINUTES

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _ensure_poller(request: Request) -> tuple[GmailPoller | None, str | None]:
    poller = getattr(request.app.state, "gmail_poller", None)
    if poller is not None:
        return poller, None
    try:
        creds = await asyncio.to_thread(get_oauth_credentials)
        gmail_service = await asyncio.to_thread(build_gmail_service, creds)
        poller = GmailPoller(gmail_service)
        request.app.state.gmail_poller = poller
        request.app.state.gmail_init_error = None
        return poller, None
    except Exception as exc:
        detail = str(exc) or exc.__class__.__name__
        request.app.state.gmail_init_error = detail
        return None, detail


# ── Existing endpoints ────────────────────────────────────────────────────────

@router.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/api/inbox/unread")
async def unread(request: Request) -> dict:
    poller, detail = await _ensure_poller(request)
    if poller is None:
        return {"error": "gmail_poller_not_initialized", "detail": detail}
    return poller.get_last_state()


@router.post("/api/poll")
async def poll(request: Request) -> dict:
    poller, detail = await _ensure_poller(request)
    if poller is None:
        return {"error": "gmail_poller_not_initialized", "detail": detail}
    try:
        new_messages = await poller.poll_once()
        return {"newMessages": new_messages}
    except Exception as exc:
        return {"error": "poll_failed", "detail": str(exc)}


@router.post("/api/pipeline")
async def run_pipeline(request: Request) -> dict:
    poller, detail = await _ensure_poller(request)
    if poller is None:
        return {"error": "gmail_poller_not_initialized", "detail": detail}
    try:
        messages = await poller.poll_once()
    except Exception as exc:
        return {"error": "poll_failed", "detail": str(exc)}
    try:
        creds = await asyncio.to_thread(get_oauth_credentials)
        calendar_service = await asyncio.to_thread(build_calendar_service, creds)
        busy = await asyncio.to_thread(get_free_busy, calendar_service)
        slots = find_free_slots(busy, duration_minutes=SCHEDULE_MIN_SLOT_MINUTES)
    except Exception as exc:
        return {"error": "calendar_failed", "detail": str(exc)}
    first = messages[0] if messages else {}
    recipient = (first.get("from") or "there").split("<")[0].strip() or "there"
    subject = first.get("subject") or "our meeting"
    email_draft = draft_negotiation_email(slots, recipient_name=recipient, meeting_subject=subject)
    return {"emails": messages, "freeSlots": slots, "draftEmail": email_draft}


@router.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...)) -> dict:
    import tempfile, shutil, pathlib, os
    suffix = pathlib.Path(file.filename or "upload").suffix or ".tmp"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        transcript = await asyncio.to_thread(transcribe, tmp_path)
        return {"transcript": transcript}
    except Exception as exc:
        return {"error": "transcription_failed", "detail": str(exc)}
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


@router.post("/api/extract")
async def extract_action_items(payload: dict) -> dict:
    transcript = payload.get("transcript", "").strip()
    if not transcript:
        return {"error": "transcript_required"}
    try:
        result = await asyncio.to_thread(extract_from_transcript, transcript)
        return result.model_dump()
    except Exception as exc:
        return {"error": "extraction_failed", "detail": str(exc)}


@router.post("/api/send")
async def send_email_endpoint(payload: dict) -> dict:
    """Send an email via Gmail API. Body: {to, subject, body}"""
    to = payload.get("to", "").strip()
    subject = payload.get("subject", "").strip()
    body = payload.get("body", "").strip()
    if not to or not body:
        return {"error": "to and body are required"}
    try:
        creds = await asyncio.to_thread(get_oauth_credentials)
        gmail_service = await asyncio.to_thread(build_gmail_service, creds)
        result = await asyncio.to_thread(send_email, gmail_service, to, subject, body)
        return {"success": True, **result}
    except Exception as exc:
        return {"error": "send_failed", "detail": str(exc)}


# ── LangGraph endpoints ───────────────────────────────────────────────────────

@router.get("/api/langgraph/status")
async def langgraph_status(request: Request) -> dict:
    """Return the last LangGraph run result stored in app state."""
    result = getattr(request.app.state, "langgraph_last_result", None)
    if result is None:
        return {"status": "idle", "message": "No run yet. POST /api/langgraph/run to start."}
    return result


@router.post("/api/langgraph/run")
async def langgraph_run(request: Request) -> StreamingResponse:
    """
    Run the full LangGraph pipeline on all unread emails.
    Streams real-time SSE status updates to the frontend.
    """
    async def event_stream():
        def sse(data: dict) -> str:
            return f"data: {json.dumps(data)}\n\n"

        # Step 1 — Poll Gmail
        yield sse({"step": "polling", "message": "📬 Polling Gmail for unread emails…"})
        poller, detail = await _ensure_poller(request)
        if poller is None:
            yield sse({"step": "error", "message": f"Gmail not initialized: {detail}"})
            return

        try:
            messages = await poller.poll_once()
        except Exception as exc:
            yield sse({"step": "error", "message": f"Poll failed: {exc}"})
            return

        yield sse({"step": "polled", "message": f"📧 Found {len(messages)} unread email(s).", "count": len(messages)})

        # Step 2 — Calendar
        yield sse({"step": "calendar", "message": "📅 Checking Google Calendar for free slots…"})
        try:
            creds = await asyncio.to_thread(get_oauth_credentials)
            calendar_service = await asyncio.to_thread(build_calendar_service, creds)
            busy = await asyncio.to_thread(get_free_busy, calendar_service)
            free_slots = find_free_slots(busy, duration_minutes=SCHEDULE_MIN_SLOT_MINUTES)
        except Exception as exc:
            yield sse({"step": "error", "message": f"Calendar failed: {exc}"})
            return

        yield sse({"step": "slots_ready", "message": f"✅ Found {len(free_slots)} free slot(s).", "slots": free_slots[:3]})

        # Step 3 — Run LangGraph on each email
        results = []
        if not messages:
            yield sse({"step": "no_emails", "message": "📭 No unread emails to process."})
        else:
            for i, email in enumerate(messages):
                yield sse({"step": "classifying", "message": f"🔍 Classifying email {i+1}/{len(messages)}: {email.get('subject', '(no subject)')}"})
                try:
                    final_state = await asyncio.to_thread(run_graph, email, free_slots)
                    results.append({
                        "email": email,
                        "label": final_state.get("label"),
                        "reason": final_state.get("classification_reason"),
                        "status": final_state.get("status"),
                        "draft_email": final_state.get("draft_email"),
                        "free_slots": final_state.get("free_slots", [])[:3],
                        "brief": final_state.get("brief"),
                        "status_log": final_state.get("status_log", []),
                    })
                    yield sse({
                        "step": "email_processed",
                        "message": f"✅ Email {i+1} → {final_state.get('status')}",
                        "result": results[-1],
                    })
                except Exception as exc:
                    logger.exception("LangGraph run failed for email %s", email.get("subject"))
                    yield sse({"step": "error", "message": f"Graph error: {exc}"})

        # Store final result in app state
        final_payload = {"status": "done", "results": results, "free_slots": free_slots}
        request.app.state.langgraph_last_result = final_payload
        yield sse({"step": "done", "message": "🎉 Pipeline complete.", **final_payload})

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
