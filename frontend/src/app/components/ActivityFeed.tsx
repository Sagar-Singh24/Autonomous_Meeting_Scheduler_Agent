"use client";
import { motion, AnimatePresence } from "framer-motion";

type FeedEntry = { message: string; time: string };

export default function ActivityFeed({ entries }: { entries: FeedEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm"
        style={{ borderColor: "rgba(59,193,168,0.2)", color: "rgba(255,255,255,0.4)" }}>
        Run the pipeline to see live activity here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {entries.map((entry, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}
            className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all"
            style={{ background: "rgba(0,60,75,0.5)", border: "1px solid rgba(59,193,168,0.15)" }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white">{entry.message}</p>
            </div>
            <span className="text-xs shrink-0" style={{ color: "rgba(59,193,168,0.7)" }}>{entry.time}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
