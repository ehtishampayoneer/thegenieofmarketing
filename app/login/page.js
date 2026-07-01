"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center gap-2">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg genie-gradient" aria-hidden />
          <span className="font-bold tracking-tight text-genie-ink">
            Marketing Genie
          </span>
        </a>
      </header>

      <section className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-extrabold text-genie-ink text-center">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-center text-sm text-genie-ink/55">
            {mode === "signin"
              ? "Sign in to save scans and track your score."
              : "Save your reports and watch your score grow."}
          </p>

          <button
            onClick={google}
            disabled={busy}
            className="mt-6 w-full flex items-center justify-center gap-3 border border-genie-ink/15 bg-white rounded-xl py-3 font-medium text-genie-ink hover:bg-genie-mist transition disabled:opacity-60"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-genie-ink/40 text-sm">
            <div className="h-px flex-1 bg-genie-ink/10" />
            or
            <div className="h-px flex-1 bg-genie-ink/10" />
          </div>

          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              className="w-full px-4 py-3 rounded-xl border border-genie-ink/15 bg-white outline-none focus:ring-2 focus:ring-genie-purple/40 transition"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && emailAuth()}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-xl border border-genie-ink/15 bg-white outline-none focus:ring-2 focus:ring-genie-purple/40 transition"
            />
            <button
              onClick={emailAuth}
              disabled={busy}
              className="w-full genie-gradient text-white font-semibold py-3 rounded-xl shadow-sm hover:shadow-md active:scale-[0.99] transition disabled:opacity-60"
            >
              {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </div>

          {msg && (
            <div
              className={`mt-4 text-sm rounded-xl p-3 ${
                msgType === "error"
                  ? "bg-amber-50 border border-amber-200 text-amber-800"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-800"
              }`}
            >
              {msg}
            </div>
          )}

          <p className="mt-5 text-center text-sm text-genie-ink/60">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setMsg("");
              }}
              className="text-genie-purple font-medium hover:underline"
            >
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
