from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from googleapiclient.discovery import build, Resource

from app.core.config import (
    SCHEDULE_LOOKAHEAD_DAYS,
    SCHEDULE_MIN_SLOT_MINUTES,
    SCHEDULE_WORK_END_HOUR,
    SCHEDULE_WORK_START_HOUR,
)


def build_calendar_service(credentials: Any) -> Resource:
    return build("calendar", "v3", credentials=credentials)


def get_free_busy(
    service: Resource,
    calendar_id: str = "primary",
    days_ahead: int = SCHEDULE_LOOKAHEAD_DAYS,
) -> list[dict[str, str]]:
    """Return list of busy intervals {start, end} in ISO format (UTC)."""
    now = datetime.now(timezone.utc)
    time_max = now + timedelta(days=days_ahead)

    body = {
        "timeMin": now.isoformat(),
        "timeMax": time_max.isoformat(),
        "items": [{"id": calendar_id}],
    }
    result = service.freebusy().query(body=body).execute()
    busy: list[dict[str, str]] = result.get("calendars", {}).get(calendar_id, {}).get("busy", [])
    return busy


def find_free_slots(
    busy_intervals: list[dict[str, str]],
    duration_minutes: int = SCHEDULE_MIN_SLOT_MINUTES,
    days_ahead: int = SCHEDULE_LOOKAHEAD_DAYS,
    work_start_hour: int = SCHEDULE_WORK_START_HOUR,
    work_end_hour: int = SCHEDULE_WORK_END_HOUR,
) -> list[dict[str, str]]:
    """
    Return free slots within working hours that are not blocked by busy_intervals
    and are at least duration_minutes long.

    Respects:
    - Working hours only (work_start_hour to work_end_hour)
    - No double-booking (skips any overlap with busy_intervals)
    - No slots outside the lookahead window
    """
    now = datetime.now(timezone.utc)
    end_of_search = now + timedelta(days=days_ahead)
    duration = timedelta(minutes=duration_minutes)

    # Parse busy intervals once
    busy: list[tuple[datetime, datetime]] = []
    for b in busy_intervals:
        b_start = datetime.fromisoformat(b["start"].replace("Z", "+00:00"))
        b_end = datetime.fromisoformat(b["end"].replace("Z", "+00:00"))
        busy.append((b_start, b_end))
    busy.sort(key=lambda x: x[0])

    free_slots: list[dict[str, str]] = []

    # Walk day by day
    current_day = now.date()
    while current_day <= end_of_search.date():
        # Working window for this day (UTC — adjust if you want local tz)
        window_start = datetime(
            current_day.year, current_day.month, current_day.day,
            work_start_hour, 0, tzinfo=timezone.utc,
        )
        window_end = datetime(
            current_day.year, current_day.month, current_day.day,
            work_end_hour, 0, tzinfo=timezone.utc,
        )

        # Don't look in the past
        if window_end <= now:
            current_day += timedelta(days=1)
            continue
        window_start = max(window_start, now)

        # Collect busy blocks that overlap this day's window
        day_busy = [
            (max(bs, window_start), min(be, window_end))
            for bs, be in busy
            if bs < window_end and be > window_start
        ]
        day_busy.sort(key=lambda x: x[0])

        # Find gaps
        cursor = window_start
        for bs, be in day_busy:
            if cursor + duration <= bs:
                free_slots.append({
                    "start": cursor.isoformat(),
                    "end": (cursor + duration).isoformat(),
                })
            cursor = max(cursor, be)

        # Gap after last busy block
        if cursor + duration <= window_end:
            free_slots.append({
                "start": cursor.isoformat(),
                "end": (cursor + duration).isoformat(),
            })

        current_day += timedelta(days=1)

    return free_slots


def draft_negotiation_email(
    free_slots: list[dict[str, str]],
    recipient_name: str = "there",
    meeting_subject: str = "our meeting",
    max_options: int = 3,
) -> str:
    """Draft a plain-text negotiation email proposing up to max_options free slots."""
    if not free_slots:
        return (
            f"Hi {recipient_name},\n\n"
            f"I'd love to schedule {meeting_subject}, but I don't have any availability "
            f"in the next {SCHEDULE_LOOKAHEAD_DAYS} days during working hours. "
            "Could you suggest a time that works for you?\n\nBest regards"
        )

    options = free_slots[:max_options]
    lines = [f"Hi {recipient_name},\n\nI'd like to schedule {meeting_subject}. Here are a few times that work for me:\n"]
    for i, slot in enumerate(options, 1):
        start = datetime.fromisoformat(slot["start"])
        end = datetime.fromisoformat(slot["end"])
        lines.append(
            f"  Option {i}: {start.strftime('%A, %B %d at %I:%M %p')} – {end.strftime('%I:%M %p')} UTC"
        )

    lines.append("\nPlease let me know which option works best, or suggest an alternative.\n\nBest regards")
    return "\n".join(lines)
