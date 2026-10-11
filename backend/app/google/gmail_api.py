from __future__ import annotations

import base64
import email as email_lib
from base64 import urlsafe_b64decode
from typing import Any

from googleapiclient.discovery import Resource, build

from app.core.config import GMAIL_MAX_MESSAGES, GMAIL_USER_ID


def build_gmail_service(credentials: Any) -> Resource:
    return build("gmail", "v1", credentials=credentials)


def list_unread_messages(gmail_service: Resource, *, max_results: int = GMAIL_MAX_MESSAGES) -> list[str]:
    resp = (
        gmail_service.users()
        .messages()
        .list(userId=GMAIL_USER_ID, q="is:unread", maxResults=max_results)
        .execute()
    )
    msgs = resp.get("messages", []) or []
    return [m["id"] for m in msgs if "id" in m]


def get_message_metadata(gmail_service: Resource, message_id: str) -> dict[str, Any]:
    meta = (
        gmail_service.users()
        .messages()
        .get(
            userId=GMAIL_USER_ID,
            id=message_id,
            format="metadata",
            metadataHeaders=["From", "To", "Subject", "Date", "Message-ID"],
        )
        .execute()
    )
    payload_headers = meta.get("payload", {}).get("headers", []) or []
    header_map = {h.get("name"): h.get("value") for h in payload_headers if h.get("name")}
    return {
        "id": meta.get("id"),
        "threadId": meta.get("threadId"),
        "subject": header_map.get("Subject"),
        "from": header_map.get("From"),
        "to": header_map.get("To"),
        "date": header_map.get("Date"),
        "messageId": header_map.get("Message-ID"),
        "snippet": meta.get("snippet"),
        "historyId": meta.get("historyId"),
    }


def mark_message_as_read(gmail_service: Resource, message_id: str) -> None:
    gmail_service.users().messages().modify(
        userId=GMAIL_USER_ID,
        id=message_id,
        body={"removeLabelIds": ["UNREAD"]},
    ).execute()


def send_email(gmail_service: Resource, to: str, subject: str, body: str) -> dict[str, Any]:
    """Send a plain-text email via Gmail API."""
    msg = email_lib.message.EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    sent = gmail_service.users().messages().send(
        userId=GMAIL_USER_ID,
        body={"raw": raw},
    ).execute()
    return {"messageId": sent.get("id"), "threadId": sent.get("threadId")}


def safe_decode_body_part(part: dict[str, Any]) -> str | None:
    body = part.get("body") or {}
    data = body.get("data")
    if not data:
        return None
    try:
        return urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")
    except Exception:
        return None

