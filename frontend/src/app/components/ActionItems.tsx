"use client";
import { useState } from "react";
import { motion } from "framer-motion";

const INITIAL_ITEMS = [
  { id: 1, text: "Riya: Fix token refresh race condition", assignee: "Riya", deadline: "Friday", done: false },
  { id: 2, text: "Marcus: Review onboarding designs from Dani", assignee: "Marcus", deadline: "Today", done: false },
  { id: 3, text: "Marcus: Follow up with Chen re: staging env", assignee: "Marcus", deadline: "Today", done: true },
  { id: 4, text: "Tom: Remove IE11 test cases from regression suite", assignee: "Tom", deadline: "This week", done: false },
  { id: 5, text: "Priya: Update board — analytics dashboard → next sprint", assignee: "Priya", deadline: "Today", done: true },
];

export default function ActionItems() {
  const [items, setItems] = useState(INITIAL_ITEMS);
  const toggle = (id: number) => setItems(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const done = items.filter(i => i.done).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-xs font-semibold text-white">{done}/{items.length} completed</span>
        <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
          <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #0C7779, #3BC1A8)" }}
            animate={{ width: `${(done / items.length) * 100}%` }} transition={{ duration: 0.4 }} />
        </div>
      </div>
      {items.map(item => (
        <motion.div key={item.id} layout onClick={() => toggle(item.id)}
          className="flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-200"
          style={item.done
            ? { background: "rgba(0,50,65,0.3)", border: "1px solid rgba(59,193,168,0.1)", opacity: 0.55 }
            : { background: "rgba(0,60,75,0.5)", border: "1px solid rgba(59,193,168,0.2)" }}>
          <div className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-all"
            style={item.done ? { background: "#3BC1A8", borderColor: "#3BC1A8" } : { borderColor: "rgba(59,193,168,0.5)" }}>
            {item.done && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${item.done ? "line-through" : "text-white"}`}
              style={item.done ? { color: "rgba(255,255,255,0.4)" } : {}}>
              {item.text}
            </p>
            <div className="flex gap-3 mt-1">
              <span className="text-xs font-medium" style={{ color: "#3BC1A8" }}>👤 {item.assignee}</span>
              <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>📅 {item.deadline}</span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
