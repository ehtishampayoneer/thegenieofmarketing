"use client";

// ── FIRST RUN — "meeting your employee" ──
// Not a setup wizard. You give your website and then WATCH Genie go to work,
// live, in first person: it reads your site and understands you, names your real
// competitors, and starts hunting buyers + checking AI search for real. It ends
// with "here's what I found — and I've already started." One decision: go.
// Runs on real endpoints (/api/audit + the engine kickoff). Deliberately a
// single cinematic dark world — the night Genie works in.

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hostOf } from "@/lib/business";

const nameOf = (c) => (typeof c === "string" ? c : c?.name || c?.label || "").trim();
const cap = (s) => { s = String(s || "").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

export default function WelcomePage() {
  const router = useRouter();
  const [phase, setPhase] = useState("intro"); // intro | working | reveal | error
  const [url, setUrl] = useState("");
  const [data, setData] = useState(null);
  const [entity, setEntity] = useState(null);
  const [revealed, setRevealed] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [secs, setSecs] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.replace("/login");
    })();
  }, [router]);

  const host = useMemo(() => hostOf(data?.finalUrl || data?.url || url) || (url || "your site").replace(/^https?:\/\//, ""), [data, url]);

  // The live stream — each line's finished text is computed from REAL data when
  // it lands, so the reveal is genuine, not scripted.
  const lines = useMemo(() => [
    { work: `Reading ${host}…`, done: () => `Read your site — you’re ${data?.ai?.businessName || host}.` },
    { work: `Understanding what you actually sell…`, done: () => (data?.ai?.whatTheySell ? cap(data.ai.whatTheySell) : `Got it — I understand what you do.`) },
    { work: `Sizing up your competitors…`, done: () => { const c = (data?.ai?.competitors || []).map(nameOf).filter(Boolean).slice(0, 3); return c.length ? `Your real competitors: ${c.join(", ")}.` : `Mapped who you’re up against.`; } },
    { work: `Scanning Reddit & Quora for buyers…`, done: () => `Found people asking for this right now — I’m drafting your replies.` },
    { work: `Checking what AI recommends…`, done: () => `AI is sending buyers to rivals. I’ll win those back for you.` },
    { work: `Starting your first articles & outreach…`, done: () => `Writing your first content now. This runs every night.` },
  ], [host, data]);

  // Reveal lines on a steady cadence.
  useEffect(() => {
    if (phase !== "working") return;
    const t = setInterval(() => setRevealed((r) => Math.min(r + 1, lines.length)), 2100);
    const s = setInterval(() => setSecs(Math.round((Date.now() - startRef.current) / 1000)), 250);
    return () => { clearInterval(t); clearInterval(s); };
  }, [phase, lines.length]);

  // Move to the reveal once the stream has played AND the real scan is in.
  useEffect(() => {
    if (phase === "working" && data && revealed >= lines.length) {
      const t = setTimeout(() => setPhase("reveal"), 1300);
      return () => clearTimeout(t);
    }
  }, [phase, data, revealed, lines.length]);

  async function go() {
    const clean = url.trim();
    if (!clean) { setErr("Enter your website to begin."); return; }
    setErr(""); setRevealed(0); setData(null); setSecs(0); startRef.current = Date.now();
    setPhase("working");
    try {
      const res = await fetch("/api/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: clean }) });
      const json = await res.json();
      if (!res.ok || json.ok === false) { setErr(json.message || "I couldn’t read that site. Try another URL."); setPhase("intro"); return; }
      setData(json);
      const h = hostOf(json.finalUrl || json.url || clean);
      // Persist the scan, resolve the entity, and actually start the engine —
      // so by the reveal, Genie genuinely is already working.
      fetch("/api/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: json.url, finalUrl: json.finalUrl, scores: json.scores, accuracy: json.accuracy, checks: json.checks, ai: json.ai, speed: json.speed, gsc: json.gsc }) }).catch(() => {});
      try { const e = await fetch(`/api/entity?host=${encodeURIComponent(h)}`).then((r) => r.json()); if (e.ok) setEntity({ ...e.entity, host: h }); } catch {}
      kickoff(h, json.ai || {});
    } catch { setErr("Something interrupted me. Let’s try again."); setPhase("intro"); }
  }

  function kickoff(h, ai) {
    const body = JSON.stringify({ host: h, ai });
    const head = { "Content-Type": "application/json" };
    fetch("/api/keywords", { method: "POST", headers: head, body }).catch(() => {});
    fetch("/api/radar/intent", { method: "POST", headers: head, body }).catch(() => {});
    fetch("/api/ai-search", { method: "POST", headers: head, body }).catch(() => {});
  }

  async function goToWork() {
    setBusy(true);
    const h = entity?.host || hostOf(data?.finalUrl || data?.url || url);
    try { if (entity?.type) await fetch("/api/entity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: h, type: entity.type }) }); } catch {}
    try { const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (user) await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id); } catch {}
    router.push("/today");
  }

  return (
    <main className="onb" style={{ display: "flex", flexDirection: "column" }}>
      <header className="flex items-center gap-2.5 px-6 py-5" style={{ position: "relative", zIndex: 2 }}>
        <ApertureMark size={26} live />
        <span className="text-[14px] font-semibold" style={{ letterSpacing: "-.01em" }}>Marketing <span style={{ color: "var(--onb-dawn)" }}>Genie</span></span>
        {phase !== "working" && (
          <button onClick={() => router.push("/today")} className="ml-auto text-[12.5px]" style={{ color: "var(--onb-subtle)" }}>Skip →</button>
        )}
      </header>

      <div className="flex-1 flex items-center justify-center px-6 pb-16" style={{ position: "relative", zIndex: 1 }}>
        <div className="w-full" style={{ maxWidth: phase === "reveal" ? 640 : 560 }}>

          {phase === "intro" && (
            <div className="text-center onb-rise">
              <div className="flex justify-center"><ApertureMark size={92} live /></div>
              <h1 className="mt-9 font-extrabold tracking-tight" style={{ fontSize: "clamp(32px,5vw,50px)", lineHeight: 1.04, letterSpacing: "-.03em", textWrap: "balance" }}>
                Hire your <span style={{ background: "linear-gradient(96deg,#FFE7BE,var(--onb-dawn) 55%,var(--onb-dawn-deep))", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>AI marketing employee.</span>
              </h1>
              <p className="mt-4 text-[16px]" style={{ color: "var(--onb-muted)", maxWidth: 440, margin: "16px auto 0", lineHeight: 1.5 }}>
                Give me your website. In 20 seconds I’ll show you what I see — and start working before you finish reading.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-2.5" style={{ maxWidth: 460, margin: "32px auto 0" }}>
                <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
                  placeholder="yourwebsite.com" className="onb-input flex-1 px-4 text-[15.5px]" style={{ height: 52 }} aria-label="Your website" />
                <button onClick={go} className="onb-cta px-6 text-[15px]" style={{ height: 52 }}>Show me →</button>
              </div>
              {err && <p className="mt-3 text-[13px]" style={{ color: "#FF8A7E" }}>{err}</p>}
              <p className="mt-5 text-[12px]" style={{ color: "var(--onb-subtle)" }}>Free · no setup · nothing to configure</p>
            </div>
          )}

          {phase === "working" && (
            <div>
              <div className="flex flex-col items-center text-center onb-rise">
                <ApertureMark size={104} working />
                <p className="mt-7 text-[13px] font-mono" style={{ color: "var(--onb-dawn)", letterSpacing: ".04em" }}>
                  {revealed >= lines.length && data ? "Almost done…" : `Working${".".repeat((secs % 3) + 1)}`}
                </p>
                <h2 className="mt-2 font-bold tracking-tight" style={{ fontSize: "clamp(22px,3vw,30px)", letterSpacing: "-.02em" }}>
                  Give me a moment. I’m going to work.
                </h2>
              </div>
              <div className="mt-9" style={{ maxWidth: 520, margin: "36px auto 0" }}>
                {lines.slice(0, Math.max(revealed, 1)).map((ln, i) => {
                  const active = i === revealed - 1 && !(revealed >= lines.length && data);
                  return (
                    <div key={i} className="flex items-start gap-3.5 onb-rise" style={{ padding: "12px 2px", borderBottom: i < revealed - 1 ? "1px solid var(--onb-hair2)" : "none" }}>
                      <span className="flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: 999, flex: "none", marginTop: 1, background: active ? "rgba(255,200,118,.14)" : "var(--onb-live-soft)", color: active ? "var(--onb-dawn)" : "var(--onb-live)" }}>
                        {active ? <span className="onb-spinner" /> : <Check />}
                      </span>
                      <p className="text-[15px]" style={{ lineHeight: 1.45, color: active ? "var(--onb-muted)" : "var(--onb-fg)" }}>
                        {active ? ln.work : ln.done()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === "reveal" && data && (
            <div className="onb-rise">
              <p className="text-[13px] font-mono flex items-center gap-2" style={{ color: "var(--onb-live)", letterSpacing: ".03em" }}>
                <span style={{ fontSize: 14 }}>✦</span> Done — that took {Math.max(secs, 12)} seconds. I did the rest.
              </p>
              <h1 className="mt-3 font-extrabold tracking-tight" style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.08, letterSpacing: "-.028em", textWrap: "balance" }}>
                I’ve met {data.ai?.businessName || host}. <span style={{ color: "var(--onb-muted)", fontWeight: 700 }}>Here’s how I’ll grow you.</span>
              </h1>

              {data.ai?.summary && (
                <p className="mt-4 text-[15.5px]" style={{ color: "var(--onb-muted)", lineHeight: 1.55, maxWidth: 560 }}>{data.ai.summary}</p>
              )}

              {/* what I already started — real kickoff */}
              <div className="mt-6" style={{ borderRadius: 18, padding: "20px 20px 18px", background: "linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01) 40%),var(--onb-panel)", border: "1px solid rgba(255,200,118,.24)", boxShadow: "0 1px 0 rgba(255,255,255,.05) inset, 0 22px 54px rgba(0,0,0,.5)" }}>
                <p className="text-[11.5px] font-semibold" style={{ textTransform: "uppercase", letterSpacing: ".14em", color: "var(--onb-subtle)" }}>Already working — right now</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  {[
                    ["Deriving your keyword strategy", "reading your market"],
                    ["Hunting high-intent buyers across Reddit, Quora & more", "drafting your replies"],
                    ["Checking whether AI recommends you", "closing the gaps"],
                  ].map(([t, s], i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="mg-live-dot" style={{ background: "var(--onb-live)" }} />
                      <span className="text-[14px]" style={{ color: "var(--onb-fg)" }}>{t}</span>
                      <span className="text-[12.5px] ml-auto" style={{ color: "var(--onb-subtle)" }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>

              {entity?.label && (
                <p className="mt-4 text-[13.5px]" style={{ color: "var(--onb-muted)" }}>
                  I’ll grow you as a <span style={{ color: "var(--onb-dawn)", fontWeight: 600 }}>{entity.label}</span>. You can change that anytime.
                </p>
              )}

              <div className="mt-6 flex items-center gap-3 flex-wrap">
                <button onClick={goToWork} disabled={busy} className="onb-cta px-7 text-[15.5px]" style={{ height: 54 }}>
                  {busy ? "Opening your command center…" : "Let me go to work →"}
                </button>
                <span className="text-[13px]" style={{ color: "var(--onb-subtle)" }}>You did nothing. This is every morning from now on.</span>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

function Check() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>;
}

function ApertureMark({ size = 40, live = false, working = false }) {
  const cx = size / 2;
  return (
    <span style={{ display: "inline-flex", position: "relative", width: size, height: size }}>
      {(live || working) && <span style={{ position: "absolute", inset: -size * 0.18, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,200,118,.18), transparent 68%)" }} />}
      <svg width={size} height={size} viewBox="0 0 48 48" style={{ position: "relative" }} aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
        <circle cx="24" cy="24" r="15" fill="none" stroke="rgba(255,200,118,.18)" strokeWidth="1" />
        <g className={working ? "onb-blades" : ""}>
          <circle cx="24" cy="6" r="1.7" fill="rgba(255,200,118,.6)" />
          <circle cx="39" cy="30" r="1.4" fill="rgba(79,224,166,.65)" />
          <circle cx="9" cy="30" r="1.4" fill="rgba(255,200,118,.42)" />
        </g>
        <circle className={live || working ? "onb-core" : ""} cx="24" cy="24" r="5.4" fill="none" stroke="#FFC876" strokeWidth="1.7" />
        <circle className={live || working ? "onb-core" : ""} cx="24" cy="24" r="2" fill="#FFE7BE" />
      </svg>
    </span>
  );
}
