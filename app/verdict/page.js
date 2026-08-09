"use client";

// ── /verdict — the public AI-Verdict (Genie's growth hook) ──
// Paste a URL → we ask the real free AI models what they recommend for your
// buyers' questions and show whether they name you or a competitor. No login,
// no stored data. Honest: "asked directly" (each model's trained knowledge),
// clearly labelled, ending in the one true fix — start free.

import { useState, useRef, useEffect } from "react";

const LOADING = [
  "Reading your website…",
  "Working out what you sell…",
  "Asking the AI models what they recommend…",
  "Checking who they name instead of you…",
  "Writing your verdict…",
];

export default function VerdictPage() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [tick, setTick] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (phase !== "loading") return;
    const id = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(id);
  }, [phase]);

  async function run(e) {
    e?.preventDefault();
    const u = url.trim();
    if (!u) { inputRef.current?.focus(); return; }
    setPhase("loading"); setErr(null); setResult(null); setTick(0);
    try {
      const res = await fetch("/api/verdict", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setErr(messageFor(data)); setPhase("error"); return; }
      setResult(data); setPhase("done");
    } catch {
      setErr("Couldn't reach the verdict service. Check your connection and try again."); setPhase("error");
    }
  }

  function reset() { setPhase("idle"); setResult(null); setErr(null); setUrl(""); setTimeout(() => inputRef.current?.focus(), 30); }

  return (
    <div className="onb" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "clamp(24px,6vw,64px) 20px" }}>
      <div style={{ width: "100%", maxWidth: 660, display: "flex", flexDirection: "column", gap: 22 }}>

        <header className="onb-rise" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Gem size={26} />
          <span style={{ fontWeight: 800, letterSpacing: "-.02em", fontSize: 16 }}>
            Marketing <span style={{ color: "var(--onb-dawn)" }}>Genie</span>
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--onb-subtle)" }}>The AI Verdict · free</span>
        </header>

        {phase === "idle" && (
          <section className="onb-rise" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <h1 style={{ fontSize: "clamp(28px,5vw,44px)", lineHeight: 1.05, letterSpacing: "-.03em", fontWeight: 800, textWrap: "balance" }}>
              When your buyers ask AI what to buy,<br />
              <span style={{ background: "linear-gradient(100deg,var(--onb-dawn),#FFE1AE)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                does it name you — or your competitor?
              </span>
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--onb-muted)", maxWidth: "52ch" }}>
              Paste your website. We'll ask the real AI models the questions your buyers actually ask, and show you — honestly — whether you show up, and who they recommend instead.
            </p>
            <form onSubmit={run} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                ref={inputRef} value={url} onChange={(e) => setUrl(e.target.value)}
                className="onb-input" placeholder="yourwebsite.com" inputMode="url" autoFocus
                style={{ flex: "1 1 260px", padding: "15px 16px", fontSize: 16 }}
              />
              <button type="submit" className="onb-cta" style={{ padding: "15px 22px", fontSize: 15.5 }}>
                Get my verdict →
              </button>
            </form>
            <p style={{ fontSize: 12.5, color: "var(--onb-subtle)" }}>Free · no signup · about 15 seconds · we don't store your site</p>
          </section>
        )}

        {phase === "loading" && (
          <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, padding: "40px 0", textAlign: "center" }}>
            <Aperture />
            <p style={{ fontSize: 17, fontWeight: 600 }}>{LOADING[Math.min(tick, LOADING.length - 1)]}</p>
            <p style={{ fontSize: 13, color: "var(--onb-subtle)" }}>Asking real models — this takes a few seconds.</p>
          </section>
        )}

        {phase === "error" && (
          <section className="onb-rise" style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>
            <div style={{ padding: 20, borderRadius: 16, background: "var(--onb-panel)", border: "1px solid var(--onb-hair)" }}>
              <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--onb-fg)" }}>{err}</p>
            </div>
            <button onClick={reset} className="onb-ghost" style={{ alignSelf: "flex-start", padding: "11px 18px" }}>Try again</button>
          </section>
        )}

        {phase === "done" && result && <Reveal result={result} onReset={reset} />}

        <footer style={{ marginTop: 8, fontSize: 11.5, color: "var(--onb-subtle)", lineHeight: 1.5 }}>
          We ask each model directly — this reflects each model's trained knowledge, not a live web search. Marketing Genie is independent and not affiliated with OpenAI, Google, or Meta.
        </footer>
      </div>
    </div>
  );
}

function Reveal({ result, onReset }) {
  const { business, score, visible, total, engines = [], topCompetitors = [], questions = [] } = result;
  const eng = engines.length ? joinNames(engines) : "AI";
  const headline =
    score === 0 ? <>Right now, {eng} <span style={{ color: "#FF8A7A" }}>never</span> names {business}.</>
    : score < 40 ? <>{eng} <span style={{ color: "var(--onb-dawn)" }}>barely</span> mentions {business}.</>
    : score < 70 ? <>{eng} mentions {business} <span style={{ color: "var(--onb-dawn)" }}>sometimes</span>.</>
    : <>{eng} already <span style={{ color: "var(--onb-live)" }}>recommends</span> {business}.</>;

  return (
    <section className="onb-rise" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--onb-subtle)", marginBottom: 8 }}>
          Your AI Verdict · we asked {joinNames(engines)}
        </p>
        <h2 style={{ fontSize: "clamp(24px,4.4vw,36px)", lineHeight: 1.08, letterSpacing: "-.025em", fontWeight: 800, textWrap: "balance" }}>{headline}</h2>
        <p style={{ marginTop: 12, fontSize: 15.5, color: "var(--onb-muted)", lineHeight: 1.55 }}>
          Of <b style={{ color: "var(--onb-fg)" }}>{total}</b> question{total === 1 ? "" : "s"} your buyers ask AI, you were named in <b style={{ color: visible ? "var(--onb-live)" : "#FF8A7A" }}>{visible}</b>.
        </p>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, color: "var(--onb-subtle)", marginBottom: 8 }}>
          <span>Share of AI answers that name you</span>
          <span style={{ color: score ? "var(--onb-live)" : "#FF8A7A", fontVariantNumeric: "tabular-nums" }}>{score}%</span>
        </div>
        <WarBar score={score} />
      </div>

      {topCompetitors.length > 0 && (
        <div>
          <p style={{ fontSize: 13.5, color: "var(--onb-muted)", marginBottom: 8 }}>Instead, AI sends your buyers to:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {topCompetitors.map((c, i) => (
              <span key={i} style={{ fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 999, background: "var(--onb-panel-2)", border: "1px solid var(--onb-hair)" }}>{c}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {questions.map((q, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 12, background: "var(--onb-panel)", border: "1px solid var(--onb-hair)" }}>
            <span style={{ flex: "none", marginTop: 1, color: q.named ? "var(--onb-live)" : "#FF8A7A", fontWeight: 800 }}>{q.named ? "✓" : "✗"}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 14, color: "var(--onb-fg)", lineHeight: 1.35 }}>“{q.question}”</p>
              <p style={{ marginTop: 3, fontSize: 12.5, color: "var(--onb-subtle)" }}>
                {q.named
                  ? <>Named by {joinNames(q.namedBy)}</>
                  : q.recommendsInstead?.length
                    ? <>AI names {joinNames(q.recommendsInstead)} — not you</>
                    : <>You're not named</>}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: "22px", borderRadius: 18, background: "linear-gradient(135deg, rgba(255,200,118,.12), rgba(255,200,118,.04))", border: "1px solid rgba(255,200,118,.22)" }}>
        <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.35 }}>This is the gap Marketing Genie closes.</p>
        <p style={{ marginTop: 8, fontSize: 14.5, color: "var(--onb-muted)", lineHeight: 1.55 }}>
          Genie writes the answer pages and gets you into the lists these AI models read — automatically, organically, with no ad spend — then tracks every buyer question it wins back for you.
        </p>
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/welcome" className="onb-cta" style={{ padding: "13px 22px", fontSize: 15, textDecoration: "none" }}>Get Genie working on this — free →</a>
          <button onClick={onReset} className="onb-ghost" style={{ padding: "13px 18px" }}>Check another site</button>
        </div>
      </div>
    </section>
  );
}

function WarBar({ score }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(Math.max(0, Math.min(100, score))), 90); return () => clearTimeout(t); }, [score]);
  return (
    <div style={{ position: "relative", height: 14, borderRadius: 999, background: "var(--onb-ink)", overflow: "hidden", border: "1px solid var(--onb-hair)" }}>
      <div style={{ height: "100%", width: `${w}%`, borderRadius: 999, background: "linear-gradient(90deg, var(--onb-dawn-deep), var(--onb-live))", transition: "width 1.1s cubic-bezier(.2,.8,.2,1)", boxShadow: "0 0 20px rgba(255,200,118,.4)" }} />
    </div>
  );
}

function Aperture() {
  return (
    <svg width="60" height="60" viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--onb-hair)" strokeWidth="2" />
      <g className="onb-blades">
        <circle cx="50" cy="50" r="30" fill="none" stroke="var(--onb-dawn)" strokeWidth="3" strokeDasharray="10 8" opacity=".8" />
      </g>
      <circle className="onb-core" cx="50" cy="50" r="11" fill="var(--onb-dawn)" opacity=".9" />
    </svg>
  );
}
function Gem({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--onb-dawn)" strokeWidth="5" opacity=".4" />
      <circle cx="50" cy="50" r="26" fill="none" stroke="var(--onb-dawn)" strokeWidth="5" opacity=".7" />
      <circle cx="50" cy="50" r="8" fill="var(--onb-dawn)" />
    </svg>
  );
}

function joinNames(list = []) {
  const a = list.filter(Boolean);
  if (a.length <= 1) return a[0] || "";
  if (a.length === 2) return `${a[0]} & ${a[1]}`;
  return `${a.slice(0, -1).join(", ")} & ${a[a.length - 1]}`;
}
function messageFor(data) {
  switch (data?.reason) {
    case "rate_limited": return data.message || "You've run a few verdicts already — give it a couple of minutes.";
    case "no_ai_engine": return "Our AI engines are momentarily unavailable — please try again in a minute.";
    case "no_questions": return "We couldn't read enough from that page to build buyer questions. Try your homepage URL.";
    case "bad_url": case "blocked_url": return "That doesn't look like a public website address. Try something like yourbrand.com.";
    case "scan_failed": case "bad_status": return "We couldn't load that site. Check the address and try again.";
    default: return data?.message || data?.error || "Something went wrong. Please try again.";
  }
}
