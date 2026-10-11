from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

from app.core.config import GMAIL_MAX_MESSAGES
from app.google.gmail_api import get_message_metadata, list_unread_messages


@dataclass
class PolledMessage:
    id: str
    subject: str | None
    from_: str | None
    date: str | None
    snippet: str | None
    threadId: str | None
    messageId: str | None
    historyId: str | None


class GmailPoller:
    def __init__(self, gmail_service: Any):
        self._gmail = gmail_service
        self._lock = asyncio.Lock()
        self._last_unread: list[dict[str, Any]] = []
        self._last_poll_epoch: float | None = None

    async def poll_once(self) -> list[dict[str, Any]]:
        """
        Polls Gmail for unread messages and returns newly observed metadata.
        """
        async with self._lock:
            msg_ids: list[str] = await asyncio.to_thread(
                list_unread_messages,
                self._gmail,
                max_results=GMAIL_MAX_MESSAGES,
            )
            now = time.time()
            self._last_poll_epoch = now

            messages: list[dict[str, Any]] = []
            for mid in msg_ids:
                metadata: dict[str, Any] = await asyncio.to_thread(get_message_metadata, self._gmail, mid)
                messages.append(metadata)

            self._last_unread = messages
            return messages

    def get_last_state(self) -> dict[str, Any]:
        return {
            "lastPollEpoch": self._last_poll_epoch,
            "unreadMessages": self._last_unread,
        }

