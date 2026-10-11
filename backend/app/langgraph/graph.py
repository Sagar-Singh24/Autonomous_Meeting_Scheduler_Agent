from __future__ import annotations

import logging
from typing import Any, Literal
from typing_extensions import TypedDict

from langgraph.graph import StateGraph, END

from app.agents.classifier import classify_email
from app.agents.brief_generator import generate_brief
from app.google.calendar_api import find_free_slots, draft_negotiation_email

logger = logging.getLogger(__name__)

MAX_NEGOTIATION_ROUNDS = 3  # Safety cap — prevents infinite loop


# ── State ────────────────────────────────────────────────────────────────────

class MeetingState(TypedDict):
    # Input
    email_subject: str
    email_sender: str
    email_snippet: str

    # Classification
    label: str                          # "meeting_request" | "not_meeting"
    classification_reason: str
    time_hint: str | None               # e.g. "sometime next week"

    # Negotiation
    free_slots: list[dict]
    draft_email: str
    negotiation_round: int              # tracks loop iterations
    negotiation_status: str             # "pending" | "proposed" | "accepted" | "gave_up"

    # Brief
    brief: str

    # Pipeline status (shown in UI)
    status: str
    status_log: list[str]


# ── Nodes ────────────────────────────────────────────────────────────────────

def node_classify(state: MeetingState) -> dict:
    logger.info("[Graph] node_classify")
    result = classify_email(
        subject=state["email_subject"],
        sender=state["email_sender"],
        snippet=state["email_snippet"],
    )
    return {
        "label": result.label,
        "classification_reason": result.reason,
        "time_hint": result.extracted_time_hint,
        "status": "classified",
        "status_log": [f"📧 Classified as '{result.label}' — {result.reason}"],
    }


def node_negotiate(state: MeetingState, free_slots: list[dict]) -> dict:
    """Propose available slots. Caps at MAX_NEGOTIATION_ROUNDS to avoid infinite loops."""
    round_num = state.get("negotiation_round", 0) + 1
    logger.info("[Graph] node_negotiate round=%d", round_num)

    if not free_slots:
        return {
            "negotiation_round": round_num,
            "negotiation_status": "gave_up",
            "draft_email": "No available slots found in the next 7 days.",
            "status": "negotiation_failed",
            "status_log": ["⚠️ No free slots available — negotiation ended."],
        }

    sender = state["email_sender"].split("<")[0].strip() or "there"
    subject = state["email_subject"] or "our meeting"
    draft = draft_negotiation_email(free_slots, recipient_name=sender, meeting_subject=subject)

    # If time_hint is ambiguous (e.g. "sometime next week"), log it and still propose slots
    time_hint = state.get("time_hint")
    log_msg = f"📅 Round {round_num}: Proposed {min(3, len(free_slots))} slots."
    if time_hint:
        log_msg += f" (Ambiguous hint detected: '{time_hint}' — proposing best available slots)"
        logger.info("[Graph] Ambiguous time hint=%r — proposing slots anyway", time_hint)

    return {
        "free_slots": free_slots,
        "draft_email": draft,
        "negotiation_round": round_num,
        "negotiation_status": "proposed",
        "status": "negotiating",
        "status_log": [log_msg],
    }


def node_generate_brief(state: MeetingState) -> dict:
    logger.info("[Graph] node_generate_brief")
    slot = state["free_slots"][0]["start"] if state.get("free_slots") else "TBD"
    brief = generate_brief(
        subject=state["email_subject"],
        sender=state["email_sender"],
        slot=slot,
    )
    return {
        "brief": brief,
        "negotiation_status": "accepted",
        "status": "brief_ready",
        "status_log": ["📋 Pre-meeting brief generated."],
    }


def node_ignore(state: MeetingState) -> dict:
    logger.info("[Graph] node_ignore — not a meeting request")
    return {
        "status": "ignored",
        "status_log": [f"🚫 Email ignored — {state['classification_reason']}"],
    }


# ── Routing ──────────────────────────────────────────────────────────────────

def route_after_classify(state: MeetingState) -> Literal["negotiate", "ignore"]:
    if state["label"] == "meeting_request":
        return "negotiate"
    return "ignore"


def route_after_negotiate(state: MeetingState) -> Literal["brief", "end"]:
    """
    After proposing slots, move to brief generation.
    Safety: if we've hit MAX_NEGOTIATION_ROUNDS or gave_up, go to end.
    """
    if state["negotiation_status"] == "gave_up":
        return "end"
    if state["negotiation_round"] >= MAX_NEGOTIATION_ROUNDS:
        logger.warning("[Graph] Max negotiation rounds reached — stopping loop")
        return "end"
    return "brief"


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_graph(free_slots: list[dict]):
    """Build and compile the LangGraph state machine."""

    def _negotiate(state: MeetingState) -> dict:
        return node_negotiate(state, free_slots)

    builder = StateGraph(MeetingState)
    builder.add_node("classify", node_classify)
    builder.add_node("negotiate", _negotiate)
    builder.add_node("brief", node_generate_brief)
    builder.add_node("ignore", node_ignore)

    builder.set_entry_point("classify")
    builder.add_conditional_edges("classify", route_after_classify, {"negotiate": "negotiate", "ignore": "ignore"})
    builder.add_conditional_edges("negotiate", route_after_negotiate, {"brief": "brief", "end": END})
    builder.add_edge("brief", END)
    builder.add_edge("ignore", END)

    return builder.compile()


def run_graph(email: dict[str, Any], free_slots: list[dict]) -> MeetingState:
    """Run the full LangGraph pipeline for a single email."""
    graph = build_graph(free_slots)
    initial_state: MeetingState = {
        "email_subject": email.get("subject") or "",
        "email_sender": email.get("from") or "",
        "email_snippet": email.get("snippet") or "",
        "label": "",
        "classification_reason": "",
        "time_hint": None,
        "free_slots": [],
        "draft_email": "",
        "negotiation_round": 0,
        "negotiation_status": "pending",
        "brief": "",
        "status": "started",
        "status_log": ["🚀 Pipeline started."],
    }
    final_state = graph.invoke(initial_state)
    return final_state
