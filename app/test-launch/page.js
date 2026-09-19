"use client";

// app/test-launch/page.js
// ── TEST IT BEFORE YOU LAUNCH ──
// Paste anything you are about to put out (or give a web address) and 1,000
// simulated customers react, argue it out, and the improvers hand back a better
// version, re-tested. Then ask any person in the crowd why. Built on the same
// engine that tests every draft in Approvals (lib/swarm), so it learns from the
// same reality check.

import { useEffect, useMemo, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import { TEAM_COLORS } from "@/components/team/SwarmGlobe";

const KINDS = [
  ["launch", "Launch post"], ["ad", "Ad"], ["offer", "Offer & price"], ["landing", "Landing page"],
  ["product", "Product description"], ["email", "Cold email"], ["social", "Social post"], ["reddit", "Reddit post"], ["pitch", "Pitch to a site"],
];
const QUESTIONS = ["Would they trust this?", "Is the price too high?", "Would they click?", "What would make them buy now?", "Would anyone complain about this?"];
const STEPS = ["Gathering your crowd", "1,000 people reading it", "Arguing it out, round by round", "Improvers writing better versions", "Re-testing the winner"];

export default function TestLaunchPage() {
  const [kind, setKind] = useState("launch");
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [market, setMarket] = useState("");
  const [question, setQuestion] = useState("");
  const [improve, setImprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);
  const [history, setHistory] = useState([]);

  // Arrive with something to test (from Proof Sprint, Markets or elsewhere).
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("kind")) setKind(q.get("kind"));
      if (q.get("text")) setText(q.get("text"));
      if (q.get("market")) setMarket(q.get("market"));
      if (q.get("question")) setQuestion(q.get("question"));
      if (q.get("url")) { setMode("url"); setUrl(q.get("url")); }
    } catch {}
    loadHistory();
  }, []);

  async function loadHistory() {
    try { const j = await fetch("/api/launch-test", { cache: "no-store" }).then((r) => r.json()); if (j?.ok) setHistory(j.tests || []); } catch {}
  }

  async function run(override) {
    setErr(""); setBusy(true); setStep(0); setRes(null);
    const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 7000);
    try {
      const body = { action: "run", kind, question, market, improve, ...(override || (mode === "url" ? { url } : { text })) };
      const j = await fetch("/api/launch-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j?.ok) { setRes(j); loadHistory(); } else setErr(j?.error || "The test didn't finish. Try again.");
    } catch { setErr("The test didn't finish. Try again."); }
    clearInterval(t); setBusy(false);
  }

  async function reopen(id) {
    setErr("");
    try { const j = await fetch(`/api/launch-test?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()); if (j?.ok) { setRes(j); window.scrollTo({ top: 0, behavior: "smooth" }); } } catch {}
  }

  const canRun = !busy && (mode === "url" ? url.trim().length > 4 : text.trim().length >= 15);

  return (
    <OperatorShell active="test-launch">
      <div>
        <h1 className="mg-display" style={{ fontSize: "clamp(28px,3vw,37px)" }}>Test it before you launch</h1>
        <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "var(--measure-wide)" }}>
          Paste an ad, a launch post, a price, a page or an email. <b style={{ color: "var(--fg)" }}>1,000 simulated customers</b> react and argue it out, the improvers hand back a better version tested again, and you can ask anyone in the crowd why.
        </p>
      </div>

      {/* ── What to test ── */}
      <div className="mt-5 rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--hair)" }}>
        <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>What is it?</p>
        <div className="mt-2 flex gap-1.5 flex-wrap">
          {KINDS.map(([id, label]) => (
            <button key={id} onClick={() => setKind(id)} className="mg-btn" style={{ fontSize: 12.5, padding: ".4rem .8rem", background: kind === id ? "var(--accent-quiet)" : "var(--surface-2)", border: `1px solid ${kind === id ? "var(--accent)" : "var(--hair)"}`, color: "var(--fg)" }}>{label}</button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 text-[12.5px]">
          <button onClick={() => setMode("text")} style={tab(mode === "text")}>Paste text</button>
          <button onClick={() => setMode("url")} style={tab(mode === "url")}>Test a web page</button>
        </div>
        {mode === "text" ? (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Paste exactly what people will see…" className="mg-field mg-focus mt-2 w-full" style={{ fontSize: 14, resize: "vertical" }} />
        ) : (
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yoursite.com/pricing" className="mg-field mg-focus mt-2 w-full" style={{ fontSize: 14 }} />
        )}

        <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <label className="text-[12.5px] mg-muted">Your question (optional)
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Would they trust this?" className="mg-field mg-focus mt-1 w-full" style={{ fontSize: 13 }} />
            <span className="mt-1.5 flex gap-1 flex-wrap">
              {QUESTIONS.map((q) => <button key={q} onClick={() => setQuestion(q)} className="text-[11.5px]" style={{ padding: "2px 8px", borderRadius: 99, border: "1px solid var(--hair)", background: "var(--surface-2)", color: "var(--fg-muted)", cursor: "pointer" }}>{q}</button>)}
            </span>
          </label>
          <label className="text-[12.5px] mg-muted">Only people in one country (optional)
            <input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="e.g. Germany, Pakistan, the UK" className="mg-field mg-focus mt-1 w-full" style={{ fontSize: 13 }} />
          </label>
        </div>

        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <button onClick={() => run()} disabled={!canRun} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 14, padding: ".65rem 1.2rem" }}>
            {busy ? "Testing…" : "Run the 1,000-person test"}
          </button>
          <label className="text-[12.5px] mg-muted flex items-center gap-2" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={improve} onChange={(e) => setImprove(e.target.checked)} /> Also write and test a better version
          </label>
          <span className="text-[12px] mg-subtle">Takes about 30 to 90 seconds.</span>
        </div>
        {busy && (
          <div className="mt-4 flex flex-col gap-1.5">
            {STEPS.map((s, i) => (
              <p key={s} className="text-[12.5px] flex items-center gap-2" style={{ color: i <= step ? "var(--fg)" : "var(--fg-subtle)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: i < step ? TEAM_COLORS.testers : i === step ? TEAM_COLORS.improvers : "var(--hair)" }} className={i === step ? "tl-pulse" : ""} />
                {s}{i === step ? "…" : ""}
              </p>
            ))}
          </div>
        )}
        {err && <p className="mt-3 text-[13px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}
      </div>

      {res && <Result res={res} onRetest={(t) => { setMode("text"); setText(t); run({ text: t }); }} />}

      {history.length > 0 && (
        <div className="mt-8">
          <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Your recent tests</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {history.map((h) => (
              <button key={h.id} onClick={() => reopen(h.id)} className="text-left rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--surface)", border: "1px solid var(--hair)", cursor: "pointer" }}>
                <span className="mg-num font-bold text-[15px]" style={{ width: 44, color: scoreColor(h.score) }}>{h.score ?? "–"}</span>
                <span className="text-[12.5px] mg-muted flex-1" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <b style={{ color: "var(--fg)" }}>{(KINDS.find((k) => k[0] === h.kind) || [0, h.kind])[1]}</b>{h.market ? ` · ${h.market}` : ""} · {h.text}
                </span>
                <span className="text-[11.5px] mg-subtle">{new Date(h.at).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <style>{`@keyframes tlPulse{0%,100%{opacity:1}50%{opacity:.35}}.tl-pulse{animation:tlPulse 1.2s infinite}@media (prefers-reduced-motion:reduce){.tl-pulse{animation:none}}`}</style>
    </OperatorShell>
  );
}

// ── The result ───────────────────────────────────────────────────────────────
function Result({ res, onRetest }) {
  const c = res.crowd || {};
  const quick = c.mode === "rules";
  const crowdPeople = (res.people || []).filter((p) => !p.gate);
  const fans = crowdPeople.slice(0, 3);
  // Never the same person in both lists, however small the crowd.
  const critics = crowdPeople.slice(3).slice(-3).reverse();
  const gatesList = (res.people || []).filter((p) => p.gate);

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Headline */}
      <div className="rounded-2xl p-5 flex items-center gap-6 flex-wrap" style={{ background: "var(--surface)", border: "1px solid var(--hair)" }}>
        <ScoreRing score={c.score} />
        <div className="flex-1 min-w-[220px]">
          <p className="text-[20px] font-bold" style={{ color: "var(--fg)" }}>{verdictOf(c)}</p>
          <p className="text-[13px] mg-muted mt-0.5">
            {quick ? "Quick check with Genie's rules (every free AI was busy). Run it again in a few minutes for the full crowd." : `${Number(c.size || 1000).toLocaleString()} people from ${c.kinds} kinds of customer${res.input?.market ? ` in ${res.input.market}` : ""}, 12 rounds of discussion.`}
          </p>
          <div className="mt-3 flex gap-6 flex-wrap">
            <Stat n={pct(c.positive)} l="liked it" color="var(--signal-live-ink)" />
            <Stat n={pct(c.act)} l="would act" color="var(--fg)" />
            <Stat n={pct(c.negative)} l="disliked it" color="var(--signal-danger)" />
            <Stat n={c.backlash > 0.03 ? `+${pct(c.backlash)}` : "none"} l="backlash spread" color={c.backlash > 0.03 ? "var(--signal-danger)" : "var(--fg-muted)"} />
          </div>
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {/* How opinion moved */}
        <Panel title="How the crowd moved as they talked">
          <Sparks series={c.series || []} />
          <p className="mt-1 text-[11.5px] mg-subtle"><span style={{ color: "#2EE6C5" }}>━</span> liked it &nbsp; <span style={{ color: "#FF6B6B" }}>━</span> disliked it · round 0 to 12</p>
          {c.gate && <p className="mt-2 text-[12.5px]" style={{ color: c.gate.blocked ? "var(--signal-danger)" : "var(--fg-muted)" }}>{c.gate.name}: {c.gate.blocked ? "would likely block or ignore this." : "lets it through."}</p>}
        </Panel>

        {/* What they objected to */}
        <Panel title="What they objected to">
          {(c.objections || []).length ? (c.objections || []).map((o) => (
            <div key={o.tag} className="mt-2">
              <div className="flex justify-between text-[12.5px]"><span style={{ color: "var(--fg)" }}>{o.tag}</span><span className="mg-subtle">{o.count} people</span></div>
              <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--surface-2)" }}><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (o.count / Math.max(1, c.size || 1000)) * 300)}%`, background: TEAM_COLORS.improvers }} /></div>
            </div>
          )) : <p className="text-[13px] mg-muted">No objection spread widely. That is rare; nice.</p>}
        </Panel>
      </div>

      {/* Fans and critics */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Panel title="Who liked it most">{fans.map((p) => <Person key={p.id} p={p} />)}</Panel>
        <Panel title="Who liked it least">{critics.map((p) => <Person key={p.id} p={p} />)}{gatesList.map((p) => <Person key={p.id} p={p} gate />)}</Panel>
      </div>

      {/* The improvers' version */}
      {res.improved ? (
        <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: `1px solid ${TEAM_COLORS.improvers}`, boxShadow: `inset 0 3px 0 ${TEAM_COLORS.improvers}` }}>
          <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>A better version <span className="mg-num" style={{ color: TEAM_COLORS.improvers }}>{res.improved.from} → {res.improved.to}</span></p>
          <p className="text-[12.5px] mg-muted mt-0.5">{res.improved.changed}</p>
          <p className="mt-3 text-[14px] p-3 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)", whiteSpace: "pre-wrap", color: "var(--fg)" }}>{res.improved.text}</p>
          <div className="mt-3 flex gap-2 flex-wrap">
            <CopyBtn text={res.improved.text} />
            <button onClick={() => onRetest(res.improved.text)} className="mg-btn mg-btn--ghost" style={{ fontSize: 12.5 }}>Test this version from scratch</button>
          </div>
        </div>
      ) : !quick && (
        <p className="text-[13px] mg-muted">The improvers tried, and none of their versions clearly beat yours. Keep it as it is.</p>
      )}

      <AskCrowd testId={res.id} people={res.people || []} />
      <p className="text-center text-[12px] mg-subtle">A prediction from simulated people, not real ones. Genie checks its crowds against real results every night.</p>
    </div>
  );
}

function AskCrowd({ testId, people }) {
  const [who, setWho] = useState(people[people.length - 1]?.id || "");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  useEffect(() => { setLog([]); setWho(people[people.length - 1]?.id || ""); }, [testId]); // eslint-disable-line react-hooks/exhaustive-deps
  const person = useMemo(() => people.find((p) => p.id === who), [people, who]);

  async function ask() {
    if (!q.trim() || !who || busy) return;
    const question = q.trim(); setQ(""); setBusy(true);
    setLog((l) => [...l, { me: true, text: question }]);
    try {
      const j = await fetch("/api/launch-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ask", testId, personId: who, question }) }).then((r) => r.json());
      setLog((l) => [...l, { me: false, who: person?.name, text: j?.ok ? j.answer : (j?.error || "They didn't answer. Try again.") }]);
    } catch { setLog((l) => [...l, { me: false, who: person?.name, text: "They didn't answer. Try again." }]); }
    setBusy(false);
  }

  if (!testId || !people.length) return null;
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--hair)" }}>
      <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Ask someone in the crowd</p>
      <p className="text-[12.5px] mg-muted mt-0.5">Pick a person and ask why they reacted the way they did, or what would change their mind.</p>
      <div className="mt-3 flex gap-2 flex-wrap">
        <select value={who} onChange={(e) => setWho(e.target.value)} className="mg-field mg-focus" style={{ fontSize: 13, maxWidth: 320 }}>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.mean >= 3.8 ? "liked it" : p.mean >= 2.8 ? "indifferent" : "disliked it"})</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="What would make you buy?" className="mg-field mg-focus flex-1" style={{ fontSize: 13, minWidth: 220 }} />
        <button onClick={ask} disabled={busy || !q.trim()} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 13 }}>{busy ? "Asking…" : "Ask"}</button>
      </div>
      {person && <p className="mt-2 text-[12px] mg-subtle">{person.who}</p>}
      {log.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {log.map((m, i) => (
            <div key={i} className="rounded-xl p-3 text-[13px]" style={{ alignSelf: m.me ? "flex-end" : "flex-start", maxWidth: "85%", background: m.me ? "var(--accent-quiet)" : "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--fg)" }}>
              {!m.me && <b>{m.who}: </b>}{m.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────
function Panel({ title, children }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--hair)" }}>
      <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function Person({ p, gate }) {
  return (
    <div className="mt-3">
      <p className="text-[13px]" style={{ color: "var(--fg)" }}><b>{p.name}</b>{gate ? " · gatekeeper" : ""} <span className="mg-num mg-subtle">{p.mean.toFixed(1)}/5</span></p>
      {p.quote ? <p className="text-[12.5px] mg-muted">“{p.quote}”</p> : p.objection ? <p className="text-[12.5px] mg-muted">Main worry: {p.objection}</p> : null}
    </div>
  );
}
function Stat({ n, l, color }) {
  return <div><p className="mg-num text-[22px] font-bold" style={{ color }}>{n}</p><p className="text-[11.5px] mg-subtle">{l}</p></div>;
}
function ScoreRing({ score = 0 }) {
  const r = 38, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`Score ${v} out of 100`}>
      <circle cx="52" cy="52" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
      <circle cx="52" cy="52" r={r} fill="none" stroke={scoreColor(v)} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 52 52)" />
      <text x="52" y="57" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--fg)">{v}</text>
    </svg>
  );
}
function Sparks({ series }) {
  if (!series.length) return null;
  const w = 300, h = 90, n = series.length - 1 || 1;
  const pts = (k) => series.map((s, i) => `${(i / n) * w},${h - s[k] * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label="Share who liked and disliked it over the rounds">
      <polyline points={pts(0)} fill="none" stroke="#2EE6C5" strokeWidth="2.5" />
      <polyline points={pts(1)} fill="none" stroke="#FF6B6B" strokeWidth="2.5" />
    </svg>
  );
}
function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  return <button onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} }} className="mg-btn mg-btn--dawn" style={{ fontSize: 12.5 }}>{done ? "Copied" : "Copy it"}</button>;
}
function tab(on) { return { background: "none", border: 0, padding: "2px 0", cursor: "pointer", fontWeight: 600, color: on ? "var(--fg)" : "var(--fg-subtle)", borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}` }; }
function pct(x) { return `${Math.round((Number(x) || 0) * 100)}%`; }
function scoreColor(s) { return s == null ? "var(--fg-subtle)" : s >= 65 ? "#1FB889" : s >= 45 ? "#E0A33A" : "#E5484D"; }
function verdictOf(c) {
  if (c.gate?.blocked) return "Likely blocked by the gatekeeper";
  if (c.score >= 75) return "Strong. Ready to go.";
  if (c.score >= 60) return "Promising, with a few fixes.";
  if (c.score >= 45) return "Lukewarm. Worth improving first.";
  return "Risky. Rework it before launch.";
}
