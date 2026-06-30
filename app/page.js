"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [provider, setProvider] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  function normalizeUrl(raw) {
    let u = raw.trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }

  async function analyze() {
    const clean = normalizeUrl(url);
    if (!clean) {
      setStatus("error");
      setErrorMsg("Enter your website address to begin.");
      return;
    }

    setStatus("loading");
    setResult(null);
    setProvider(null);
    setErrorMsg("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system:
            "You are Genie, a sharp business growth advisor. Reply in plain English at a 7th-grade reading level. No jargon.",
          prompt:
            "In exactly 2 short sentences, give a confident first impression of what this business likely does and its single biggest growth opportunity, based only on the domain name: " +
            clean,
          temperature: 0.7,
          maxTokens: 200,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.ok === false) {
        setStatus("error");
        setErrorMsg(
          data.message ||
            "The Genie is busy right now. Give it a moment and try again."
        );
        return;
      }

      setResult(data.text);
      setProvider(data.meta?.provider || null);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setErrorMsg("Something interrupted the connection. Try again.");
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") analyze();
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="px-6 py-5 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg genie-gradient" aria-hidden />
        <span className="font-bold tracking-tight text-genie-ink">
          Marketing Genie
        </span>
      </header>

      {/* Hero */}
      <section className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-genie-purple/70">
            Your AI growth operator
          </p>

          <h1 className="mt-4 text-4xl sm:text-6xl font-extrabold tracking-tight text-genie-ink leading-[1.05]">
            Paste your URL.
            <br />
            <span className="bg-gradient-to-r from-genie-purple to-genie-emerald bg-clip-text text-transparent">
              Watch your business grow.
            </span>
          </h1>

          <p className="mt-5 text-lg text-genie-ink/70 max-w-xl mx-auto">
            Drop your website in below for an instant first read from the Genie.
            No signup. No credit card.
          </p>

          {/* Input */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
            <input
              type="text"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="yourbusiness.com"
              className="flex-1 px-5 py-4 rounded-xl border border-genie-ink/15 bg-white text-genie-ink placeholder:text-genie-ink/40 outline-none focus:ring-2 focus:ring-genie-purple/40 focus:border-genie-purple/40 transition"
              aria-label="Your website address"
            />
            <button
              onClick={analyze}
              disabled={status === "loading"}
              className="genie-gradient text-white font-semibold px-6 py-4 rounded-xl shadow-sm hover:shadow-md active:scale-[0.99] transition disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "Reading…" : "Ask the Genie →"}
            </button>
          </div>

          <p className="mt-4 text-sm text-genie-ink/50">
            🔒 Private · Nothing saved · Powered by a multi-AI brain
          </p>

          {/* Result */}
          {status === "done" && result && (
            <div className="mt-8 text-left bg-white border border-genie-ink/10 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-genie-purple">
                  Genie’s first impression
                </span>
                {provider && (
                  <span className="text-xs font-medium text-genie-ink/40 bg-genie-mist border border-genie-ink/10 rounded-full px-2.5 py-1">
                    served by {provider}
                  </span>
                )}
              </div>
              <p className="text-genie-ink leading-relaxed">{result}</p>
              <p className="mt-4 text-sm text-genie-ink/50">
                This is a 10-second taste. The full 60-point growth report is
                next.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="mt-8 text-left bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <p className="text-amber-800">{errorMsg}</p>
            </div>
          )}
        </div>
      </section>

      <footer className="px-6 py-6 text-center text-sm text-genie-ink/40">
        Marketing Genie · built to make growth obvious
      </footer>
    </main>
  );
}
