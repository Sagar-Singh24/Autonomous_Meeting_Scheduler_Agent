"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { saveUser, loginUser } from "../lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); setStatus("error"); return; }
    if (password !== confirm) { setError("Passwords do not match."); setStatus("error"); return; }
    setStatus("loading");
    await new Promise(r => setTimeout(r, 600));
    const result = saveUser({ name, email, password });
    if (!result.ok) { setError(result.error!); setStatus("error"); return; }
    const loginResult = loginUser(email, password);
    if (!loginResult.ok) { setError("Account created but login failed. Please sign in."); setStatus("error"); return; }
    router.replace("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-80 w-80 rounded-full blur-3xl" style={{ background: "rgba(59,193,168,0.12)" }} />
        <div className="absolute bottom-0 -left-20 h-72 w-72 rounded-full blur-3xl" style={{ background: "rgba(12,119,121,0.2)" }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative w-full max-w-md">

        <div className="glass rounded-2xl p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-white mb-4"
              style={{ background: "linear-gradient(135deg, #005461, #249E94)", boxShadow: "0 0 28px rgba(59,193,168,0.4)" }}>M</div>
            <h1 className="text-2xl font-bold text-white">Create Account</h1>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>Join MeetingOS — your AI meeting assistant</p>
          </div>

          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            {[
              { label: "Full Name", icon: "👤", type: "text", val: name, set: setName, ph: "John Doe" },
              { label: "Email", icon: "📧", type: "email", val: email, set: setEmail, ph: "you@example.com" },
            ].map(f => (
              <div key={f.label} className="flex flex-col gap-1.5">
                <label className="section-label">{f.label}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#3BC1A8" }}>{f.icon}</span>
                  <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} required
                    className="input-theme w-full pl-9 pr-4 py-3 text-sm" />
                </div>
              </div>
            ))}

            {[
              { label: "Password", val: password, set: setPassword, ph: "Min. 6 characters", toggle: true },
              { label: "Confirm Password", val: confirm, set: setConfirm, ph: "Repeat password", toggle: false },
            ].map(f => (
              <div key={f.label} className="flex flex-col gap-1.5">
                <label className="section-label">{f.label}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#3BC1A8" }}>🔒</span>
                  <input type={showPass ? "text" : "password"} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} required
                    className="input-theme w-full pl-9 pr-10 py-3 text-sm" />
                  {f.toggle && (
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: "#3BC1A8" }}>
                      {showPass ? "Hide" : "Show"}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {status === "error" && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-400/30 px-4 py-3 text-sm text-red-300"
                style={{ background: "rgba(239,68,68,0.1)" }}>
                {error}
              </motion.div>
            )}

            <motion.button type="submit" disabled={status === "loading"} whileTap={{ scale: 0.98 }}
              className="btn-primary mt-2 w-full py-3 text-sm">
              {status === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
                  Creating account…
                </span>
              ) : "Create Account →"}
            </motion.button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: "rgba(255,255,255,0.5)" }}>
            Already have an account?{" "}
            <button onClick={() => router.push("/login")} className="font-semibold hover:opacity-80 transition-colors" style={{ color: "#3BC1A8" }}>
              Sign in
            </button>
          </p>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: "rgba(59,193,168,0.6)" }}>Autonomous Meeting Scheduler · AI-Powered</p>
      </motion.div>
    </div>
  );
}
