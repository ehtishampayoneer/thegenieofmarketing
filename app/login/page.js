"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GenieLockup } from "@/components/brand/GenieMark";

const FIELD = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)", borderRadius: 12, height: 46, padding: "0 14px", fontSize: 14, width: "100%", outline: "none" };

export default function LoginPage() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("error"); // error | info

  async function google() {
    setBusy(true);
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMsgType("error");
      setMsg(error.message);
      setBusy(false);
    }
    // On success the browser redirects to Google, so no further code runs.
  }

  async function emailAuth() {
    if (!email || !password) {
      setMsgType("error");
      setMsg("Enter your email and password.");
      return;
    }
    setBusy(true);
    setMsg("");
    const supabase = createClient();

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setMsgType("error");
        setMsg(error.message);
      } else {
        setMsgType("info");
        setMsg("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMsgType("error");
        setMsg(error.message);
      } else {
        window.location.href = "/";
        return;
      }
    }
    setBusy(false);
  }

  return (
    <main className="mg mg-ambient" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="px-6 py-5">
        <a href="/" className="inline-flex"><GenieLockup size={32} live /></a>
      </header>

      <section className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full" style={{ maxWidth: 400 }}>
          <div className="text-center">
            <p className="mg-eyebrow" style={{ justifyContent: "center" }}>{mode === "signin" ? "Welcome back" : "Get started"}</p>
            <h1 className="mg-display mt-2" style={{ fontSize: "clamp(26px,3.4vw,34px)" }}>
              {mode === "signin" ? "Sign in to Genie." : "Create your account."}
            </h1>
            <p className="mg-lede mt-2" style={{ marginInline: "auto" }}>
              {mode === "signin" ? "Your AI marketing employee has been working. Pick up where it left off." : "Hire an AI marketing employee that works while you sleep."}
            </p>
          </div>

          <div className="mg-surface mt-8 p-6">
            <button onClick={google} disabled={busy} className="mg-btn mg-btn--ghost w-full mg-focus" style={{ height: 46, fontSize: 14 }}>
              <GoogleIcon /> Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3" style={{ color: "var(--fg-subtle)", fontSize: 12.5 }}>
              <span className="mg-hairline" style={{ flex: 1 }} /> or <span className="mg-hairline" style={{ flex: 1 }} />
            </div>

            <div className="flex flex-col gap-3">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" className="mg-focus" style={FIELD} />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && emailAuth()} placeholder="Password" className="mg-focus" style={FIELD} />
              <button onClick={emailAuth} disabled={busy} className="mg-btn mg-btn--dawn w-full mg-focus" style={{ height: 46, fontSize: 14.5 }}>
                {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </div>

            {msg && (
              <div className="mt-4 p-3" style={{
                fontSize: 13, borderRadius: 12, lineHeight: 1.45,
                background: msgType === "error" ? "var(--signal-danger-soft)" : "var(--signal-live-soft)",
                color: msgType === "error" ? "var(--signal-danger)" : "var(--signal-live-ink)",
              }}>{msg}</div>
            )}
          </div>

          <p className="mt-5 text-center" style={{ fontSize: 13.5, color: "var(--fg-muted)" }}>
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(""); }}
              className="mg-focus" style={{ color: "var(--accent-ink)", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
