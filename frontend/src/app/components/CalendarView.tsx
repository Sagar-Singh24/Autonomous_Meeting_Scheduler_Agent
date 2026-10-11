"use client";
import { useMemo } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { "en-US": enUS },
});

type Slot = { start: string; end: string };
type EmailResult = { email: { subject?: string; from?: string }; label: string; status: string; free_slots?: Slot[] };

type CalEvent = { title: string; start: Date; end: Date; type: "confirmed" | "pending" | "suggested" };

const TYPE_COLORS: Record<CalEvent["type"], string> = {
  confirmed: "#22c55e",
  pending:   "#eab308",
  suggested: "#3b82f6",
};

export default function CalendarView({ freeSlots, results }: { freeSlots: Slot[]; results: EmailResult[] }) {
  const events: CalEvent[] = useMemo(() => {
    const evts: CalEvent[] = [];

    // Confirmed meetings — from pipeline results that are meeting_request + brief_ready
    results.forEach(r => {
      if (r.label === "meeting_request" && r.free_slots && r.free_slots.length > 0) {
        const slot = r.free_slots[0];
        evts.push({
          title: r.email.subject ?? "Meeting",
          start: new Date(slot.start),
          end: new Date(slot.end),
          type: r.status === "brief_ready" ? "confirmed" : "pending",
        });
      }
    });

    // AI suggested — remaining free slots not already used
    const usedStarts = new Set(evts.map(e => e.start.toISOString()));
    freeSlots.slice(0, 5).forEach(slot => {
      if (!usedStarts.has(new Date(slot.start).toISOString())) {
        evts.push({
          title: "AI Suggested Slot",
          start: new Date(slot.start),
          end: new Date(slot.end),
          type: "suggested",
        });
      }
    });

    return evts;
  }, [freeSlots, results]);

  const eventPropGetter = (event: CalEvent) => ({
    style: {
      backgroundColor: TYPE_COLORS[event.type],
      borderRadius: "6px",
      border: "none",
      color: event.type === "pending" ? "#1a1a1a" : "#fff",
      fontSize: "12px",
      padding: "2px 6px",
    },
  });

  return (
    <div className="h-[560px] text-sm">
      <style>{`
        .rbc-calendar { background: transparent !important; }
        .rbc-header { background: rgba(0,60,75,0.6) !important; color: rgba(255,255,255,0.8) !important; border-color: rgba(59,193,168,0.15) !important; font-size: 12px; padding: 6px 0; font-weight: 600; }
        .rbc-month-view, .rbc-time-view { border-color: rgba(59,193,168,0.15) !important; border-radius: 12px; overflow: hidden; }
        .rbc-day-bg { background: transparent !important; }
        .rbc-off-range-bg { background: rgba(0,30,40,0.3) !important; }
        .rbc-today { background: rgba(59,193,168,0.1) !important; }
        .rbc-date-cell { color: rgba(255,255,255,0.7) !important; font-size: 12px; }
        .rbc-toolbar button { color: rgba(255,255,255,0.75) !important; border-color: rgba(59,193,168,0.25) !important; background: rgba(0,60,75,0.5) !important; border-radius: 8px !important; font-size: 12px; }
        .rbc-toolbar button:hover { background: rgba(12,119,121,0.5) !important; color: #fff !important; }
        .rbc-toolbar button.rbc-active { background: #0C7779 !important; color: #fff !important; border-color: #3BC1A8 !important; }
        .rbc-toolbar-label { color: #fff !important; font-weight: 700; font-size: 14px; }
        .rbc-time-slot { color: rgba(255,255,255,0.45) !important; font-size: 11px; }
        .rbc-timeslot-group { border-color: rgba(59,193,168,0.08) !important; }
        .rbc-time-content { border-color: rgba(59,193,168,0.12) !important; }
        .rbc-current-time-indicator { background: #3BC1A8 !important; }
        .rbc-month-row { border-color: rgba(59,193,168,0.1) !important; }
        .rbc-day-slot .rbc-time-slot { border-color: rgba(59,193,168,0.06) !important; }
        .rbc-show-more { color: #3BC1A8 !important; font-size: 11px; font-weight: 600; }
        .rbc-event:focus { outline: none !important; }
        .rbc-agenda-view table { color: rgba(255,255,255,0.8) !important; }
        .rbc-agenda-date-cell, .rbc-agenda-time-cell { color: rgba(59,193,168,0.8) !important; font-size: 12px; }
        .rbc-agenda-event-cell { color: #fff !important; }
        .rbc-label { color: rgba(255,255,255,0.5) !important; }
      `}</style>
      <Calendar
          localizer={localizer}
          events={events}
          defaultView={Views.WEEK}
          views={[Views.WEEK, Views.DAY, Views.MONTH]}
          eventPropGetter={eventPropGetter as any}
          scrollToTime={new Date()}
          style={{ height: "100%" }}
        />
    </div>
  );
}
