"""
Tests for slot negotiation logic.
Run with: pytest backend/tests/test_slot_negotiator.py -v
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.google.calendar_api import draft_negotiation_email, find_free_slots


# ── Helpers ──────────────────────────────────────────────────────────────────

def _utc(hour: int, minute: int = 0, days_offset: int = 1) -> datetime:
    """Return a UTC datetime offset from today."""
    base = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return base + timedelta(days=days_offset, hours=hour, minutes=minute)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ── Tests ────────────────────────────────────────────────────────────────────

class TestFindFreeSlots:

    def test_no_busy_returns_slots_within_working_hours(self):
        """With no busy intervals, all slots must fall within working hours."""
        slots = find_free_slots([], duration_minutes=30, days_ahead=2, work_start_hour=9, work_end_hour=18)
        assert len(slots) > 0
        for slot in slots:
            start = datetime.fromisoformat(slot["start"])
            end = datetime.fromisoformat(slot["end"])
            assert start.hour >= 9, f"Slot starts before 9 AM: {slot}"
            assert end.hour <= 18, f"Slot ends after 6 PM: {slot}"

    def test_no_slots_outside_working_hours(self):
        """Slots must never be proposed at 2 AM or any off-hours time."""
        slots = find_free_slots([], duration_minutes=30, days_ahead=3, work_start_hour=9, work_end_hour=18)
        for slot in slots:
            start = datetime.fromisoformat(slot["start"])
            assert not (start.hour < 9 or start.hour >= 18), (
                f"Slot proposed outside working hours: {slot}"
            )

    def test_busy_block_is_not_double_booked(self):
        """A slot that overlaps an existing busy block must not be proposed."""
        # Block 10:00–11:00 tomorrow
        busy = [{"start": _iso(_utc(10)), "end": _iso(_utc(11))}]
        slots = find_free_slots(busy, duration_minutes=30, days_ahead=2, work_start_hour=9, work_end_hour=18)

        for slot in slots:
            slot_start = datetime.fromisoformat(slot["start"])
            slot_end = datetime.fromisoformat(slot["end"])
            busy_start = _utc(10)
            busy_end = _utc(11)
            overlaps = slot_start < busy_end and slot_end > busy_start
            assert not overlaps, f"Slot overlaps busy block: {slot}"

    def test_slot_duration_is_respected(self):
        """Every returned slot must be exactly duration_minutes long."""
        slots = find_free_slots([], duration_minutes=60, days_ahead=2, work_start_hour=9, work_end_hour=18)
        for slot in slots:
            start = datetime.fromisoformat(slot["start"])
            end = datetime.fromisoformat(slot["end"])
            assert (end - start) == timedelta(minutes=60), (
                f"Slot duration mismatch: {slot}"
            )

    def test_fully_blocked_day_returns_no_slots(self):
        """A day blocked 9 AM–6 PM should yield no slots."""
        busy = [{"start": _iso(_utc(9)), "end": _iso(_utc(18))}]
        slots = find_free_slots(busy, duration_minutes=30, days_ahead=1, work_start_hour=9, work_end_hour=18)
        # Filter to only tomorrow's slots
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        tomorrow_slots = [
            s for s in slots
            if datetime.fromisoformat(s["start"]).date() == tomorrow
        ]
        assert len(tomorrow_slots) == 0, f"Expected no slots on fully blocked day, got: {tomorrow_slots}"

    def test_slot_fits_exactly_in_gap(self):
        """A 30-min gap between two busy blocks should yield exactly one slot."""
        # Busy: 9:00–10:00 and 10:30–18:00 → gap is 10:00–10:30
        busy = [
            {"start": _iso(_utc(9)), "end": _iso(_utc(10))},
            {"start": _iso(_utc(10, 30)), "end": _iso(_utc(18))},
        ]
        slots = find_free_slots(busy, duration_minutes=30, days_ahead=1, work_start_hour=9, work_end_hour=18)
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        tomorrow_slots = [
            s for s in slots
            if datetime.fromisoformat(s["start"]).date() == tomorrow
        ]
        assert len(tomorrow_slots) == 1
        start = datetime.fromisoformat(tomorrow_slots[0]["start"])
        assert start.hour == 10 and start.minute == 0

    def test_gap_too_small_yields_no_slot(self):
        """A 20-min gap when minimum is 30 min must not produce a slot."""
        # Busy: 9:00–10:00 and 10:20–18:00 → gap is only 20 min
        busy = [
            {"start": _iso(_utc(9)), "end": _iso(_utc(10))},
            {"start": _iso(_utc(10, 20)), "end": _iso(_utc(18))},
        ]
        slots = find_free_slots(busy, duration_minutes=30, days_ahead=1, work_start_hour=9, work_end_hour=18)
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        tomorrow_slots = [
            s for s in slots
            if datetime.fromisoformat(s["start"]).date() == tomorrow
        ]
        assert len(tomorrow_slots) == 0, f"Expected no slot in 20-min gap, got: {tomorrow_slots}"


class TestDraftNegotiationEmail:

    def test_email_contains_options(self):
        slots = find_free_slots([], duration_minutes=30, days_ahead=2, work_start_hour=9, work_end_hour=18)
        email = draft_negotiation_email(slots, recipient_name="Alice", meeting_subject="Q3 sync")
        assert "Alice" in email
        assert "Q3 sync" in email
        assert "Option 1" in email

    def test_email_with_no_slots(self):
        email = draft_negotiation_email([], recipient_name="Bob")
        assert "don't have any availability" in email
        assert "Bob" in email
