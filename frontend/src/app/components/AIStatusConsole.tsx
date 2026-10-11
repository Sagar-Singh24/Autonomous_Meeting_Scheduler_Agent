"use client";
import { motion, AnimatePresence } from "framer-motion";

export default function AIStatusConsole({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-xl p-4 font-mono text-xs h-full min-h-48 overflow-y-auto"
      style={{ background: "rgba(0,30,40,0.85)", border: "1px solid rgba(59,193,168,0.2)" }}>
      <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: "1px solid rgba(59,193,168,0.15)" }}>
        <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
        <div className="h-2.5 w-2.5 rounded-full" style={{ background: "#3BC1A8" }} />
        <span className="ml-2 text-xs" style={{ color: "rgba(59,193,168,0.6)" }}>meetingos — agent console</span>
      </div>
      {lines.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.3)" }}>Waiting for pipeline to run...</p>
      ) : (
        <AnimatePresence initial={false}>
          {lines.map((line, i) => (
            <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
              className="leading-relaxed text-white">
              {line}
            </motion.p>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
