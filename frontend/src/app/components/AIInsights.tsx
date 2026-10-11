"use client";
import { motion } from "framer-motion";

type Props = { totalEmails: number; meetingsScheduled: number; ignored: number; briefs: number };

export default function AIInsights({ totalEmails, meetingsScheduled, ignored, briefs }: Props) {
  const accuracy = totalEmails > 0 ? Math.round((meetingsScheduled / totalEmails) * 100) : 0;

  const stats = [
    { icon: "📅", label: "Meetings Scheduled", value: String(meetingsScheduled), sub: "from pipeline" },
    { icon: "📧", label: "Emails Processed", value: String(totalEmails), sub: "this run" },
    { icon: "🚫", label: "Ignored", value: String(ignored), sub: "not meeting" },
    { icon: "📋", label: "Briefs Generated", value: String(briefs), sub: "ready to use" },
  ];

  if (totalEmails === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "rgba(59,193,168,0.2)", color: "rgba(255,255,255,0.4)" }}>
        Run the pipeline to see real insights.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="stat-card">
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-xl font-bold text-white">{s.value}</div>
            <div className="text-xs font-semibold text-white mt-0.5">{s.label}</div>
            <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{s.sub}</div>
          </motion.div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <p className="section-label">Summary</p>
        <div className="inner-card px-3 py-2.5 text-sm text-white">
          🎯 Accuracy: <span className="font-bold" style={{ color: "#3BC1A8" }}>{accuracy}%</span>
          <span style={{ color: "rgba(255,255,255,0.6)" }}> ({meetingsScheduled} meeting{meetingsScheduled !== 1 ? "s" : ""} / {totalEmails} emails)</span>
        </div>
        {ignored > 0 && (
          <div className="inner-card px-3 py-2.5 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            🚫 {ignored} email{ignored !== 1 ? "s" : ""} ignored (not a meeting).
          </div>
        )}
        {briefs > 0 && (
          <div className="inner-card px-3 py-2.5 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            📋 {briefs} brief{briefs !== 1 ? "s" : ""} generated and ready.
          </div>
        )}
      </div>
    </div>
  );
}
