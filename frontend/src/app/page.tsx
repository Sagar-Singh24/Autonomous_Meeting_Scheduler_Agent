"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import ActivityFeed from "./components/ActivityFeed";
import ActionItems from "./components/ActionItems";
import EmailDraft from "./components/EmailDraft";
import AIInsights from "./components/AIInsights";
import AIStatusConsole from "./components/AIStatusConsole";
import { getSession, logout, type User } from "./lib/auth";

const CalendarView = dynamic(() => import("./components/CalendarView"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
type SSEEvent = { step: string; message: string; result?: EmailResult; results?: EmailResult[]; free_slots?: Slot[]; slots?: Slot[] };
type Slot = { start: string; end: string };
type EmailResult = { email: { subject?: string; from?: string; snippet?: string }; label: string; reason: string; status: string; draft_email?: string; free_slots?: Slot[]; brief?: string; status_log?: string[] };
type ActionItem = { description: string; assignee?: string | null; deadline?: string | null };
type KeyDecision = { decision: string; owner?: string | null };
type ExtractionResult = { summary: string; key_decisions: KeyDecision[]; action_items: ActionItem[] };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fade = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass p-5 ${className}`}>{children}</div>;
}

function SectionTitle({ icon, title, badge }: { icon: string; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 pb-3 mb-4" style={{ borderBottom: "1px solid rgba(59,193,168,0.15)" }}>
      <span className="text-base">{icon}</span>
      <h2 className="font-bold text-white text-sm tracking-wide">{title}</h2>
      {badge && <span className="badge ml-auto">{badge}</span>}
    </div>
  );
}

function StatusDot({ status }: { status: "idle" | "running" | "done" | "error" }) {
  const colors = { idle: "rgba(255,255,255,0.3)", running: "#3BC1A8", done: "#22c55e", error: "#ef4444" };
  return <span className={`inline-block h-2 w-2 rounded-full ${status === "running" ? "animate-pulse" : ""}`}
    style={{ background: colors[status] }} />;
}

function fmtSlot(s: Slot) {
  const d = new Date(s.start), e = new Date(s.end);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}–${e.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", icon: "⚡", label: "Dashboard" },
  { id: "calendar", icon: "📅", label: "Calendar" },
  { id: "pipeline", icon: "🤖", label: "AI Pipeline" },
  { id: "briefs", icon: "📄", label: "Meeting Briefs" },
  { id: "actions", icon: "✅", label: "Action Items" },
  { id: "emails", icon: "📧", label: "Follow-up Emails" },
];

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const backend = useMemo(() => process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://localhost:8000", []);
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("dashboard");
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Pipeline state
  const [pipeStatus, setPipeStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [pipeLog, setPipeLog] = useState<string[]>([]);
  const [pipeResults, setPipeResults] = useState<EmailResult[]>([]);
  const [freeSlots, setFreeSlots] = useState<Slot[]>([]);
  const [pipeErr, setPipeErr] = useState<string | null>(null);

  // Transcription
  const [txStatus, setTxStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [transcript, setTranscript] = useState("");
  const [txErr, setTxErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Extraction
  const [exStatus, setExStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [exErr, setExErr] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/login");
    } else {
      setUser(session);
      setAuthed(true);
    }
  }, []);

  // Build feed entries from real pipeline log
  const feedEntries = pipeLog.map((msg, i) => ({
    message: msg,
    time: i === pipeLog.length - 1 ? "just now" : `${(pipeLog.length - 1 - i) * 2}s ago`,
  })).reverse();

  if (!authed) return null;

  // ── Pipeline ──────────────────────────────────────────────────────────────
  async function runPipeline() {
    setPipeStatus("running"); setPipeLog([]); setPipeResults([]); setFreeSlots([]); setPipeErr(null);
    try {
      const res = await fetch(`${backend}/api/langgraph/run`, { method: "POST" });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const evt: SSEEvent = JSON.parse(line.slice(6));
          setPipeLog(p => [...p, evt.message]);
          if (evt.slots) setFreeSlots(evt.slots);
          if (evt.free_slots) setFreeSlots(evt.free_slots);
          if (evt.result) setPipeResults(p => [...p, evt.result!]);
          if (evt.results) setPipeResults(evt.results);
          if (evt.step === "done") setPipeStatus("done");
          if (evt.step === "error") { setPipeErr(evt.message); setPipeStatus("error"); }
        }
      }
      setPipeStatus(s => s === "running" ? "done" : s);
    } catch (e) {
      setPipeErr(e instanceof Error ? e.message : "Pipeline failed");
      setPipeStatus("error");
    }
  }

  async function uploadAudio() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setTxStatus("running"); setTxErr(null); setTranscript("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${backend}/api/transcribe`, { method: "POST", body: form });
      const data = await res.json();
      if (data.error) throw new Error(data.detail ?? data.error);
      setTranscript(data.transcript ?? "");
      setTxStatus("done");
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Transcription failed");
      setTxStatus("error");
    }
  }

  async function runExtraction() {
    if (!transcript.trim()) return;
    setExStatus("running"); setExErr(null); setExtraction(null);
    try {
      const res = await fetch(`${backend}/api/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript }) });
      const data = await res.json();
      if (data.error) throw new Error(data.detail ?? data.error);
      setExtraction(data as ExtractionResult);
      setExStatus("done");
    } catch (e) {
      setExErr(e instanceof Error ? e.message : "Extraction failed");
      setExStatus("error");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-white font-sans" style={{ background: "linear-gradient(180deg, #005461 0%, #005461 40%, #0C7779 65%, #249E94 85%, #3BC1A8 100%)", backgroundAttachment: "fixed" }}>
      {/* Ambient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full blur-3xl" style={{ background: "rgba(59,193,168,0.08)" }} />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full blur-3xl" style={{ background: "rgba(12,119,121,0.12)" }} />
      </div>

      <div className="relative flex h-screen overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="flex w-56 shrink-0 flex-col" style={{ background: "#005461", borderRight: "1px solid rgba(59,193,168,0.2)" }}>
          <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(59,193,168,0.2)" }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, #0C7779, #3BC1A8)" }}>M</div>
              <div>
                <p className="text-sm font-bold text-white">MeetVora</p>
                <p className="text-xs" style={{ color: "rgba(59,193,168,0.7)" }}>AI Assistant</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
            {NAV.map(item => (
              <button key={item.id} onClick={() => setActiveNav(item.id)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-left w-full"
                style={activeNav === item.id
                  ? { background: "rgba(59,193,168,0.15)", color: "#3BC1A8", borderLeft: "3px solid #3BC1A8", paddingLeft: "9px" }
                  : { color: "rgba(255,255,255,0.65)" }}>
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(59,193,168,0.2)" }}>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #0C7779, #3BC1A8)" }}>
                {user?.name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user?.name ?? "User"}</p>
                <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.45)" }}>{user?.email ?? ""}</p>
              </div>
              <button onClick={() => { logout(); router.replace("/login"); }}
                className="text-xs transition-colors hover:text-red-400"
                style={{ color: "rgba(255,255,255,0.4)" }} title="Sign out">⏻</button>
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">
          {/* Top bar */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3.5"
            style={{ background: "#005461", borderBottom: "1px solid rgba(59,193,168,0.2)" }}>
            <div>
              <h1 className="text-base font-bold text-white">{NAV.find(n => n.id === activeNav)?.icon} {NAV.find(n => n.id === activeNav)?.label}</h1>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Autonomous Meeting Scheduler</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ background: "rgba(59,193,168,0.12)", border: "1px solid rgba(59,193,168,0.3)", color: "#3BC1A8" }}>
                <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "#3BC1A8" }} />
                Backend connected
              </div>
            </div>
          </div>

          <div className="p-6">

            {/* ── DASHBOARD ── */}
            {activeNav === "dashboard" && (
              <motion.div variants={fade} initial="hidden" animate="show" className="grid grid-cols-3 gap-5">
                {/* AI Console */}
                <Glass className="col-span-2 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <SectionTitle icon="🧠" title="AI Status Console" badge="Live" />
                    <button onClick={runPipeline} disabled={pipeStatus === "running"}
                      className="btn-primary px-4 py-2 text-xs flex items-center gap-2">
                      <StatusDot status={pipeStatus} />
                      {pipeStatus === "running" ? "Running…" : "▶ Run"}
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <AIStatusConsole lines={pipeLog} />
                  </div>
                </Glass>

                {/* Insights */}
                <Glass>
                  <SectionTitle icon="📊" title="AI Insights" />
                  <AIInsights
                    totalEmails={pipeResults.length}
                    meetingsScheduled={pipeResults.filter(r => r.label === "meeting_request").length}
                    ignored={pipeResults.filter(r => r.label === "not_meeting").length}
                    briefs={pipeResults.filter(r => r.brief).length}
                  />
                </Glass>

                {/* Activity Feed */}
                <Glass className="col-span-2">
                  <SectionTitle icon="⚡" title="Live Activity Feed" badge={pipeLog.length > 0 ? `${pipeLog.length} events` : "Auto-updating"} />
                  <ActivityFeed entries={feedEntries} />
                </Glass>

                {/* Quick stats */}
                <Glass className="flex flex-col gap-3">
                  <SectionTitle icon="🎯" title="Today's Summary" />
                  {[
                    { label: "Emails processed", value: String(pipeResults.length || 0), icon: "📬" },
                    { label: "Meetings scheduled", value: String(pipeResults.filter(r => r.status === "brief_ready").length || 0), icon: "✅" },
                    { label: "Pending negotiations", value: String(pipeResults.filter(r => r.status === "negotiating").length || 0), icon: "🤝" },
                    { label: "Briefs generated", value: String(pipeResults.filter(r => r.brief).length || 0), icon: "📋" },
                  ].map((s, i) => (
                    <div key={i} className="stat-card flex items-center justify-between">
                      <span className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>{s.icon} {s.label}</span>
                      <span className="text-sm font-bold text-white">{s.value}</span>
                    </div>
                  ))}
                </Glass>

                {/* Real pipeline results on dashboard */}
                {pipeResults.length > 0 && (
                  <Glass className="col-span-3">
                    <div className="flex items-center justify-between mb-4">
                      <SectionTitle icon="📨" title="Latest Pipeline Results" badge={`${pipeResults.length} emails processed`} />
                      <button onClick={() => setActiveNav("pipeline")} className="text-xs font-semibold transition-colors" style={{ color: "#3BC1A8" }}>View full pipeline →</button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {pipeResults.map((r, i) => (
                        <div key={i} className="inner-card p-4 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-white truncate">{r.email.subject ?? "(no subject)"}</p>
                            <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
                              style={r.status === "brief_ready"
                                ? { background: "rgba(59,193,168,0.15)", color: "#3BC1A8", border: "1px solid rgba(59,193,168,0.3)" }
                                : r.status === "ignored"
                                ? { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }
                                : { background: "rgba(12,119,121,0.3)", color: "#fff" }}>
                              {r.status}
                            </span>
                          </div>
                          <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.5)" }}>{r.email.from}</p>
                          {r.label === "not_meeting" && <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>🚫 {r.reason}</p>}
                          {r.draft_email && r.label === "meeting_request" && (
                            <details><summary className="cursor-pointer text-xs font-semibold" style={{ color: "#3BC1A8" }}>📨 Draft email</summary>
                              <pre className="mt-2 whitespace-pre-wrap rounded-xl p-3 text-xs text-white" style={{ background: "rgba(0,30,40,0.7)", border: "1px solid rgba(59,193,168,0.15)" }}>{r.draft_email}</pre>
                            </details>
                          )}
                          {r.brief && (
                            <details><summary className="cursor-pointer text-xs font-semibold" style={{ color: "#3BC1A8" }}>📋 Pre-meeting brief</summary>
                              <div className="mt-2 rounded-xl p-3 text-sm text-white whitespace-pre-wrap" style={{ background: "rgba(0,50,65,0.6)", border: "1px solid rgba(59,193,168,0.2)" }}>{r.brief}</div>
                            </details>
                          )}
                          {r.status_log && r.status_log.length > 0 && (
                            <div className="flex flex-col gap-0.5 mt-1">
                              {r.status_log.map((l, j) => <p key={j} className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{l}</p>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Glass>
                )}
              </motion.div>
            )}

            {/* ── CALENDAR ── */}
            {activeNav === "calendar" && (
              <motion.div variants={fade} initial="hidden" animate="show" className="flex flex-col gap-5">
                <Glass>
                  <SectionTitle icon="📅" title="Calendar View" />
                  <div className="flex gap-4 mb-4">
                    {[{ color: "#22c55e", label: "Confirmed" }, { color: "#eab308", label: "Pending" }, { color: "#3BC1A8", label: "AI Suggested" }].map(l => (
                      <div key={l.label} className="flex items-center gap-1.5 text-xs text-white">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                        {l.label}
                      </div>
                    ))}
                  </div>
                  <CalendarView freeSlots={freeSlots} results={pipeResults} />
                </Glass>
              </motion.div>
            )}

            {/* ── AI PIPELINE ── */}
            {activeNav === "pipeline" && (
              <motion.div variants={fade} initial="hidden" animate="show" className="flex flex-col gap-5">
                <Glass>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🤖</span>
                      <div>
                        <h2 className="font-bold text-white text-sm">LangGraph Orchestration Pipeline</h2>
                        <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>Gmail → Classify → Calendar → Negotiate → Brief</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusDot status={pipeStatus} />
                      <span className="text-xs font-semibold capitalize" style={{ color: "rgba(255,255,255,0.6)" }}>{pipeStatus}</span>
                    </div>
                  </div>
                  <button onClick={runPipeline} disabled={pipeStatus === "running"}
                    className="btn-primary px-5 py-2.5 text-sm">
                    {pipeStatus === "running" ? "⏳ Running pipeline…" : "▶ Run "}
                  </button>

                  {pipeErr && <div className="mt-3 rounded-xl px-4 py-3 text-sm text-red-300" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>{pipeErr}</div>}

                  {pipeLog.length > 0 && (
                    <div className="mt-4">
                      <p className="section-label mb-2">Live Log</p>
                      <div className="rounded-xl p-3 flex flex-col gap-1.5 max-h-48 overflow-y-auto" style={{ background: "rgba(0,30,40,0.7)", border: "1px solid rgba(59,193,168,0.15)" }}>
                        {pipeLog.map((l, i) => <p key={i} className="text-sm text-white">{l}</p>)}
                      </div>
                    </div>
                  )}

                  {freeSlots.length > 0 && (
                    <div className="mt-4">
                      <p className="section-label mb-2">Free Slots ({freeSlots.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {freeSlots.slice(0, 6).map((s, i) => (
                          <span key={i} className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: "rgba(12,119,121,0.4)", border: "1px solid rgba(59,193,168,0.3)" }}>{fmtSlot(s)}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {pipeResults.length > 0 && (
                    <div className="mt-4 flex flex-col gap-3">
                      <p className="section-label">Results</p>
                      {pipeResults.map((r, i) => (
                        <div key={i} className="inner-card p-4 flex flex-col gap-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-white">{r.email.subject ?? "(no subject)"}</p>
                              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{r.email.from}</p>
                            </div>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={r.status === "brief_ready"
                                ? { background: "rgba(59,193,168,0.15)", color: "#3BC1A8", border: "1px solid rgba(59,193,168,0.3)" }
                                : r.status === "ignored"
                                ? { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }
                                : { background: "rgba(12,119,121,0.3)", color: "#fff" }}>
                              {r.status}
                            </span>
                          </div>
                          {r.label === "not_meeting" && <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>🚫 {r.reason}</p>}
                          {r.draft_email && r.label === "meeting_request" && (
                            <details><summary className="cursor-pointer text-xs font-semibold" style={{ color: "#3BC1A8" }}>📨 Draft email</summary>
                              <pre className="mt-2 whitespace-pre-wrap rounded-xl p-3 text-xs text-white" style={{ background: "rgba(0,30,40,0.7)", border: "1px solid rgba(59,193,168,0.15)" }}>{r.draft_email}</pre>
                            </details>
                          )}
                          {r.brief && (
                            <details><summary className="cursor-pointer text-xs font-semibold" style={{ color: "#3BC1A8" }}>📋 Pre-meeting brief</summary>
                              <div className="mt-2 rounded-xl p-3 text-sm text-white whitespace-pre-wrap" style={{ background: "rgba(0,50,65,0.6)", border: "1px solid rgba(59,193,168,0.2)" }}>{r.brief}</div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Glass>

                {/* Transcription + Extraction */}
                <div className="grid grid-cols-2 gap-5">
                  <Glass>
                    <SectionTitle icon="🎙️" title="Audio Transcription (Whisper)" />
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <input ref={fileRef} type="file" accept="audio/*,.txt" className="hidden"
                          onChange={e => setFileName(e.target.files?.[0]?.name ?? null)} />
                        <button type="button" onClick={() => fileRef.current?.click()}
                          className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200"
                          style={{ background: "rgba(0,60,75,0.6)", border: "1px solid rgba(59,193,168,0.25)", color: "rgba(255,255,255,0.8)" }}>
                          📁 Choose File
                        </button>
                        <span className="text-xs truncate max-w-[120px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                          {fileName ?? "No file chosen"}
                        </span>
                      </div>
                      <button onClick={uploadAudio} disabled={txStatus === "running"}
                        className="btn-secondary px-4 py-2 text-sm">
                        {txStatus === "running" ? "⏳ Transcribing…" : "▶ Transcribe"}
                      </button>
                      {txErr && <p className="text-xs text-red-300">{txErr}</p>}
                      {transcript && (
                        <textarea className="w-full rounded-xl p-3 text-xs text-white resize-none"
                          style={{ background: "rgba(0,30,40,0.7)", border: "1px solid rgba(59,193,168,0.2)" }}
                          rows={6} value={transcript} onChange={e => setTranscript(e.target.value)} />
                      )}
                    </div>
                  </Glass>

                  <Glass>
                    <SectionTitle icon="🧬" title="Structured Extraction (Groq)" />
                    <div className="flex flex-col gap-3">
                      <button onClick={runExtraction} disabled={exStatus === "running" || !transcript.trim()}
                        className="btn-secondary px-4 py-2 text-sm">
                        {exStatus === "running" ? "⏳ Extracting…" : "▶ Extract Action Items"}
                      </button>
                      {!transcript.trim() && <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>Transcribe audio first.</p>}
                      {exErr && <p className="text-xs text-red-300">{exErr}</p>}
                      {extraction && (
                        <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
                          <p className="text-xs text-white">{extraction.summary}</p>
                          {extraction.action_items.map((a, i) => (
                            <div key={i} className="inner-card p-2.5">
                              <p className="text-xs text-white">{a.description}</p>
                              <div className="flex gap-2 mt-1">
                                {a.assignee && <span className="text-xs font-semibold" style={{ color: "#3BC1A8" }}>👤 {a.assignee}</span>}
                                {a.deadline && <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>📅 {a.deadline}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Glass>
                </div>
              </motion.div>
            )}

            {/* ── MEETING BRIEFS ── */}
            {activeNav === "briefs" && (
              <motion.div variants={fade} initial="hidden" animate="show" className="flex flex-col gap-4">
                {pipeResults.filter(r => r.brief).length === 0 ? (
                  <Glass className="text-center">
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>No briefs generated yet. Run the pipeline first.</p>
                  </Glass>
                ) : (
                  pipeResults.filter(r => r.brief).map((r, i) => (
                    <Glass key={i} className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-white">{r.email.subject ?? "Meeting"}</h3>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>From: {r.email.from ?? "unknown"}</p>
                          {r.free_slots && r.free_slots[0] && (
                            <p className="text-xs mt-0.5" style={{ color: "rgba(59,193,168,0.8)" }}>
                              Slot: {new Date(r.free_slots[0].start).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                        </div>
                        <span className="badge">Brief Ready</span>
                      </div>
                      <div className="rounded-xl p-4 text-sm text-white whitespace-pre-wrap leading-relaxed" style={{ background: "rgba(0,50,65,0.5)", border: "1px solid rgba(59,193,168,0.18)" }}>
                        {r.brief}
                      </div>
                    </Glass>
                  ))
                )}
              </motion.div>
            )}

            {/* ── ACTION ITEMS ── */}
            {activeNav === "actions" && (
              <motion.div variants={fade} initial="hidden" animate="show">
                <Glass>
                  <SectionTitle icon="✅" title="Action Items" badge="5 items" />
                  <ActionItems />
                </Glass>
              </motion.div>
            )}

            {/* ── FOLLOW-UP EMAILS ── */}
            {activeNav === "emails" && (
              <motion.div variants={fade} initial="hidden" animate="show" className="flex flex-col gap-4">

                {/* Draft emails from real pipeline results */}
                {pipeResults.filter(r => r.draft_email && r.label === "meeting_request").length === 0 ? (
                  <Glass className="text-center">
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>No draft emails yet. Run the pipeline first.</p>
                  </Glass>
                ) : (
                  pipeResults.filter(r => r.draft_email && r.label === "meeting_request").map((r, i) => (
                    <Glass key={i} className="p-5">
                      <SectionTitle icon="📧" title={`Draft — ${r.email.subject ?? "Meeting Request"}`} badge="Draft" />
                      <EmailDraft
                        to={r.email.from ?? "recipient@example.com"}
                        subject={`Re: ${r.email.subject ?? "Meeting Request"}`}
                        body={r.draft_email!}
                      />
                    </Glass>
                  ))
                )}

                <Glass>
                  <SectionTitle icon="📨" title="Incoming Requests" badge={`${pipeResults.length} processed`} />
                  {pipeResults.length === 0 ? (
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>Run the pipeline to see incoming requests.</p>
                  ) : (
                    pipeResults.map((r, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-xl px-4 py-3 mb-2 transition-all"
                        style={{ background: "rgba(0,60,75,0.5)", border: "1px solid rgba(59,193,168,0.18)" }}>
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: "linear-gradient(135deg, #0C7779, #3BC1A8)" }}>
                          {(r.email.from ?? "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{r.email.subject ?? "(no subject)"}</p>
                          <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.5)" }}>{r.email.from ?? "unknown"}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                            style={r.label === "meeting_request"
                              ? { background: "rgba(59,193,168,0.15)", color: "#3BC1A8", border: "1px solid rgba(59,193,168,0.3)" }
                              : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
                            {r.label === "meeting_request" ? "Meeting" : "Ignored"}
                          </span>
                          <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{r.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </Glass>

              </motion.div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
