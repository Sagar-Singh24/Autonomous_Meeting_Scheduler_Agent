"use client";
import { useState } from "react";
import { motion } from "framer-motion";

type Props = { to: string; subject: string; body: string };

export default function EmailDraft({ to, subject, body }: Props) {
  const backend = process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://localhost:8000";
  const [copied, setCopied] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendErr, setSendErr] = useState<string | null>(null);

  const copy = () => {
    navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const send = async () => {
    setSendStatus("sending"); setSendErr(null);
    try {
      const res = await fetch(`${backend}/api/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.detail ?? data.error);
      setSendStatus("sent");
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Send failed");
      setSendStatus("error");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(59,193,168,0.2)", background: "rgba(0,50,65,0.5)" }}>
        <div className="px-4 py-2.5 flex flex-col gap-1" style={{ borderBottom: "1px solid rgba(59,193,168,0.15)" }}>
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: "rgba(255,255,255,0.45)" }}>To:</span>
            <span className="font-semibold" style={{ color: "#3BC1A8" }}>{to}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Subject:</span>
            <span className="font-semibold text-white">{subject}</span>
          </div>
        </div>
        <pre className="px-4 py-3 text-sm text-white whitespace-pre-wrap font-sans leading-relaxed"
          style={{ color: "rgba(255,255,255,0.85)" }}>{body}</pre>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={copy}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200"
          style={{ background: "rgba(0,60,75,0.6)", border: "1px solid rgba(59,193,168,0.25)", color: "rgba(255,255,255,0.8)" }}>
          {copied ? "✅ Copied!" : "📋 Copy"}
        </button>

        <motion.button onClick={send} disabled={sendStatus === "sending" || sendStatus === "sent"}
          whileTap={{ scale: 0.96 }}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 disabled:opacity-50"
          style={sendStatus === "sent"
            ? { background: "rgba(59,193,168,0.15)", border: "1px solid rgba(59,193,168,0.35)", color: "#3BC1A8" }
            : sendStatus === "error"
            ? { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }
            : { background: "#0C7779", color: "#fff" }}>
          {sendStatus === "sending" ? "⏳ Sending…"
            : sendStatus === "sent" ? "✅ Sent!"
            : sendStatus === "error" ? "❌ Failed"
            : "📨 Send Email"}
        </motion.button>
      </div>

      {sendErr && <p className="text-xs text-red-400">{sendErr}</p>}
    </div>
  );
}
