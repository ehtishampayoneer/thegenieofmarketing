"use client";

// ── AI SEARCH VISIBILITY — story first, data second ──
// When buyers ask AI (ChatGPT, Perplexity, Gemini, Claude) for a recommendation,
// is this business named? The page explains, in plain language: here's what's
// happening (you vs competitors, "N out of 15 times"), here's Genie's plan, here's
// the one question to start with, here are the rest, and where AI learns about your
// category. The old data-first dashboard lives on, collapsed, under "detailed
// metrics." Reads /api/ai-search (+ /api/today, /api/keywords, /api/citations);
// every gap is approvable (Genie writes the answer page into Approvals).

import { useState, useEffect, useMemo } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Provenance } from "@/components/ui/v2/primitives";
import { EmptyState } from "@/components/ui/v2/DataState";
import GenieAperture from "@/components/brand/GenieAperture";
import { useLive } from "@/lib/useLive";
import { fetchLive } from "@/lib/live";

const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const fmt = (n) => { try { return Number(n).toLocaleString(); } catch { return String(n); } };
function estVolume(k) { const real = Number(k.volume); if (real > 0) return real; const p = k.traffic_potential ?? 0; if (p >= 85) return 22000; if (p >= 70) return 8000; if (p >= 55) return 2500; if (p >= 45) return 900; if (p >= 35) return 350; return 120; }
const impactOf = (v) => (v == null ? "Medium" : v >= 1500 ? "High" : v >= 800 ? "Medium" : "Low");

export default function AiSearchPage() {
  const { data: d, state } = useLive("/api/ai-search", (j) => !(j.opportunities?.length) && !j.total);
  const [today, setToday] = useState(null);
  const [volMap, setVolMap] = useState({});
  const [infoOpen, setInfoOpen] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkStep, setCheckStep] = useState("");
  const [writing, setWriting] = useState("");
  const [msg, setMsg] = useState("");
  const [showAllQ, setShowAllQ] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);

  useEffect(() => { try { setInfoOpen(localStorage.getItem("mg-aisearch-info") !== "0"); } catch {} }, []);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 6000); return () => clearTimeout(t); }, [msg]);
  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/today");
      if (live) {
        setToday(data);
        const h = data?.entity?.host;
        if (h) {
          const k = await fetch(`/api/keywords?host=${encodeURIComponent(h)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
          if (k?.ok) { const m = {}; for (const g of k.graded || []) m[String(g.keyword).toLowerCase()] = estVolume(g); setVolMap(m); }
        }
      }
    })();
  }, []);

  function dismissInfo() { setInfoOpen(false); try { localStorage.setItem("mg-aisearch-info", "0"); } catch {} }

  async function recheck() {
    if (checking) return;
    setChecking(true);
    const engines = ["ChatGPT", "Perplexity", "Gemini", "Claude"];
    let i = 0; setCheckStep(`Checking ${engines[0]}…`);
    const tick = setInterval(() => { i = Math.min(i + 1, engines.length - 1); setCheckStep(`Checking ${engines[i]}…`); }, 1400);
    try {
      const h = today?.entity?.host;
      if (h) await fetch("/api/ai-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: h }) });
    } catch {}
    clearInterval(tick);
    window.location.reload();
  }

  async function writeGap(o, key) {
    if (writing) return;
    setWriting(String(key));
    setMsg("Genie is writing this…");
    try {
      const r = await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: o.recommendation || o.question || o.discovered }) }).then((x) => x.json());
      // Trust the saved count, not just ok — a draft only "exists" if it was queued.
      if (r?.ok && (r.saved > 0 || (r.actionIds || []).length > 0)) {
        setMsg("Done — opening your Approvals so you can review it…");
        setTimeout(() => { window.location.href = "/approvals"; }, 1100);
      } else if (r?.ok) {
        setMsg("I wrote it but couldn’t queue it for approval. Run your first scan on Today if you just reset, then try again.");
        setWriting("");
      } else {
        setMsg(r?.message || "Couldn’t start that one. Try again in a moment.");
        setWriting("");
      }
    } catch { setMsg("Couldn’t start that one. Try again in a moment."); setWriting(""); }
  }

  // ── derived ──
  const opps = useMemo(() => {
    const list = (d?.opportunities || []).map((o) => { const q = o.question || ""; const vol = volMap[q.toLowerCase()] ?? null; return { ...o, question: q, vol, impact: impactOf(vol) }; });
    return list.sort((a, b) => (b.vol || 0) - (a.vol || 0));
  }, [d, volMap]);
  const total = d?.total || (opps.length + (d?.visible || 0)) || 0;
  const visible = d?.visible ?? 0;
  const comps = (d?.topCompetitors && d.topCompetitors.length ? d.topCompetitors : (d?.competitors || []).map((name) => ({ name, count: 0 })));
  const featured = opps[0] || null;
  const rest = opps.slice(1);
  const health = today?.growth?.score ?? null;
  const healthDelta = today?.growth?.delta ?? null;
  const approvals = today?.approvalsCount ?? 0;

  return (
    <OperatorShell active="aisearch">
      {infoOpen && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-4 rounded-xl" style={{ background: "var(--accent-quiet)", border: "1px solid var(--border)" }}>
          <span style={{ color: "var(--accent-ink)", flexShrink: 0 }}><InfoIcon /></span>
          <p className="text-[12.5px] leading-snug" style={{ color: "var(--fg-muted)" }}><b style={{ color: "var(--fg)" }}>What is AI Search Visibility?</b> When buyers ask AI (ChatGPT, Perplexity, Gemini, Claude) for recommendations, is your brand named? This page tracks that, and shows you how to win those citations.</p>
          <button onClick={dismissInfo} className="ml-auto shrink-0 mg-focus" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-subtle)", fontSize: 18, lineHeight: 1, padding: "0 4px" }} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="mg-display" style={{ fontSize: "clamp(28px,3vw,37px)" }}>AI Search Visibility</h1>
          <p className="mt-1.5 text-[14px] mg-muted">Track your brand mentions across ChatGPT, Perplexity, Gemini, and Claude.</p>
        </div>
        {state === "real" && (
          <button onClick={recheck} disabled={checking || !today?.entity?.host} className="mg-btn disabled:opacity-50" style={{ fontSize: 12.5, background: "var(--surface)", border: "1px solid var(--accent)", color: "var(--accent-ink)" }}>
            {checking ? (checkStep || "Re-checking…") : "Re-check all →"}
          </button>
        )}
      </div>

      {state === "disconnected" ? (
        <div className="mt-8"><EmptyState state="disconnected" icon={Icon.spark} title="I can’t reach AI search" sub="Sign in and I’ll show whether AI recommends you." /></div>
      ) : state === "loading" ? (
        <div className="mt-6 mg-surface p-6" style={{ minHeight: 300 }}><div className="mg-skel" style={{ height: 18, width: "45%" }} /><div className="mg-skel mt-4" style={{ height: 120 }} /><div className="mg-skel mt-4" style={{ height: 90 }} /></div>
      ) : state !== "real" ? (
        <FirstCheck checking={checking} step={checkStep} onCheck={recheck} host={today?.entity?.host} />
      ) : (
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
          {/* ── MAIN STORY ── */}
          <div className="min-w-0 flex flex-col gap-5">
            <HappeningHero total={total} visible={visible} comps={comps} engines={d?.engines} />
            <GeniePlan count={total || opps.length} featured={featured} onStart={() => document.getElementById("start-here")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
            {featured && <StartHere o={featured} onApprove={() => writeGap(featured, "featured")} writing={writing === "featured"} />}
            {rest.length > 0 && <MoreQuestions rest={rest} showAll={showAllQ} setShowAll={setShowAllQ} onFix={(o, i) => writeGap(o, `q${i}`)} writing={writing} />}
            <WhereAILearns host={today?.entity?.host} />
            <AdvancedMetrics open={advOpen} setOpen={setAdvOpen} d={d} />
          </div>

          {/* ── RIGHT RAIL ── */}
          <div className="xl:sticky xl:top-4 flex flex-col gap-4">
            <ProgressCard health={health} delta={healthDelta} />
            <MilestoneCard estDays={25} />
            <SpeedUpCard approvals={approvals} />
          </div>
        </div>
      )}

      {msg && (
        <div className="fixed left-1/2 z-50" style={{ bottom: 24, transform: "translateX(-50%)" }}>
          <div className="mg-surface px-4 py-2.5 text-[13px] mg-rise" style={{ boxShadow: "var(--shadow-3)", color: "var(--fg)", borderColor: "var(--border-strong)", maxWidth: "90vw" }}>{msg}</div>
        </div>
      )}
    </OperatorShell>
  );
}

// ── HERO: "Here's what's happening" ─────────────────────────────────────────
function HappeningHero({ total, visible, comps, engines }) {
  const scaleTo = Math.max(1, total, ...comps.map((c) => c.count || 0));
  const rows = [{ name: "Your brand", count: visible, you: true }, ...comps.slice(0, 4)];
  return (
    <Card className="p-6 mg-rise relative overflow-hidden" style={{ borderLeft: "3px solid var(--accent)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[19px] font-bold" style={{ color: "var(--fg)" }}>Here’s what’s happening:</h2>
          <p className="mt-1.5 text-[13.5px] mg-muted" style={{ maxWidth: 460 }}>When your customers ask AI (ChatGPT, Perplexity, Gemini, Claude) for recommendations in your category, this is what they hear:</p>
        </div>
        {engines?.length ? <Provenance kind="verified">Asked {engines.slice(0, 3).map((e) => e.label || e).join(" · ")}</Provenance> : <Provenance kind="modelled">AI-modelled</Provenance>}
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 items-center">
        <div className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[13px] shrink-0" style={{ width: 130, color: r.you ? "var(--fg)" : "var(--fg-muted)", fontWeight: r.you ? 700 : 500 }}>{r.you ? "Your brand" : cap(r.name)} is mentioned</span>
              <div className="flex-1 h-3.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                <div className="h-full rounded-full" style={{ width: `${((r.count || 0) / scaleTo) * 100}%`, background: r.you ? "var(--accent)" : "var(--fg-subtle)", opacity: r.you ? 1 : 0.55, transition: "width 1s var(--ease-out)" }} />
              </div>
              <span className="text-[12.5px] mg-num shrink-0" style={{ width: 92, textAlign: "right", color: r.you ? "var(--accent-ink)" : "var(--fg-muted)", fontWeight: r.you ? 700 : 500 }}>{r.count || 0} out of {total}</span>
            </div>
          ))}
        </div>
        <div className="lg:pl-6" style={{ borderLeft: "1px solid var(--hair)" }}>
          <p className="text-[13.5px] mg-muted lg:pl-0 pl-0" style={{ paddingLeft: 0 }}>Every time AI recommends a competitor instead of <b style={{ color: "var(--fg)" }}>you</b>, you’re losing a potential customer.</p>
          <div className="mg-seam my-3.5" />
          <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>Genie’s job is to fix this.</p>
        </div>
      </div>
    </Card>
  );
}

// ── GENIE'S PLAN ────────────────────────────────────────────────────────────
function GeniePlan({ count, featured, onStart }) {
  const steps = [
    "Genie writes an answer page for each question",
    "Publishes it on your blog",
    "AI models read it over the next few weeks",
    "AI starts mentioning your brand in answers",
  ];
  return (
    <Card className="p-6 mg-rise">
      <p className="mg-klabel">GENIE’S PLAN</p>
      <p className="mt-2 text-[13.5px] mg-muted" style={{ maxWidth: 640 }}>Genie found {count} question{count === 1 ? "" : "s"} your buyers ask AI. For each one, Genie will write content that gets your brand named in the answer.</p>
      <p className="mt-4 text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Here’s what happens next:</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3 lg:flex-col lg:items-start">
            <span className="mg-num shrink-0 flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 999, border: "1.5px solid var(--accent)", color: "var(--accent-ink)", fontWeight: 700, fontSize: 13 }}>{i + 1}</span>
            <p className="text-[12.5px] mg-muted leading-snug" style={{ maxWidth: 170 }}>{s}</p>
          </div>
        ))}
      </div>
      <div className="mg-seam my-4" />
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex gap-6 flex-wrap">
          <div><p className="text-[11.5px] mg-subtle flex items-center gap-1"><Icon.clock size={12} /> Estimated time to first citation</p><p className="mt-0.5 text-[15px] font-bold mg-num" style={{ color: "var(--fg)" }}>25 days</p></div>
          <div><p className="text-[11.5px] mg-subtle">Estimated time to match your top competitor</p><p className="mt-0.5 text-[15px] font-bold mg-num" style={{ color: "var(--fg)" }}>4 months</p></div>
        </div>
        <button onClick={onStart} className="mg-btn mg-btn--dawn" style={{ fontSize: 13 }}>Start with the highest-impact question →</button>
      </div>
    </Card>
  );
}

// ── START HERE ──────────────────────────────────────────────────────────────
function StartHere({ o, onApprove, writing }) {
  const says = (o.competitorsCited || []).slice(0, 2).join(" or ");
  return (
    <Card id="start-here" className="p-6 mg-rise">
      <p className="mg-klabel">START HERE</p>
      <p className="mt-1 text-[13px] mg-muted">The question with the biggest impact.</p>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1fr_1fr] gap-5">
        <div className="rounded-2xl p-4 self-start" style={{ background: "var(--accent-quiet)", border: "1px solid var(--border)" }}>
          <p className="text-[11.5px] mg-subtle">When buyers ask AI:</p>
          <p className="mt-1.5 text-[18px] font-bold leading-snug" style={{ color: "var(--fg)" }}>“{o.question}”</p>
          {o.vol != null && <p className="mt-3 flex items-center gap-1.5 text-[12.5px] mg-muted"><Icon.conversations size={13} /> {fmt(o.vol)} people ask this every month</p>}
        </div>
        <Col label="Right now, AI says:">
          {says ? <p className="text-[13px] mg-muted italic">“Try {says}, they offer similar features…”</p> : <p className="text-[13px] mg-muted italic">AI recommends other brands here.</p>}
          <p className="mt-2 text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>Your brand isn’t mentioned.</p>
        </Col>
        <Col label="What Genie will do:">
          <p className="text-[13px] mg-muted">Write a comparison guide that AI will read and cite when someone asks this question.</p>
        </Col>
        <Col label="Expected result:">
          <p className="text-[13px] mg-muted">Your brand starts getting mentioned when buyers ask this question.</p>
          <p className="mt-2 text-[12px] mg-subtle">Estimated: <span className="font-bold" style={{ color: "var(--accent-ink)" }}>25 days</span></p>
        </Col>
      </div>

      <div className="mt-5 flex items-center gap-2.5 flex-wrap">
        <button onClick={onApprove} disabled={writing} className="mg-btn mg-btn--dawn disabled:opacity-60" style={{ fontSize: 13 }}>{writing ? "Writing…" : "Approve this plan →"}</button>
        <a href="/approvals" className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}>See the draft</a>
      </div>
    </Card>
  );
}
function Col({ label, children }) { return (<div><p className="text-[11.5px] font-semibold mg-subtle mb-1.5">{label}</p>{children}</div>); }

// ── MORE QUESTIONS ──────────────────────────────────────────────────────────
function MoreQuestions({ rest, showAll, setShowAll, onFix, writing }) {
  const shown = showAll ? rest : rest.slice(0, 4);
  return (
    <Card className="p-6 mg-rise">
      <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{rest.length} more question{rest.length === 1 ? "" : "s"} Genie can fix:</p>
      <div className="mt-3">
        {shown.map((o, i) => (
          <div key={i} className="flex items-center gap-4 py-3 mg-qrow px-2 rounded-lg" style={{ borderTop: i === 0 ? "none" : "1px solid var(--hair)", cursor: "pointer" }} onClick={() => onFix(o, i)}>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold truncate" style={{ color: "var(--fg)" }}>Q: {o.question}</p>
              <p className="text-[12px] mg-subtle mt-0.5">{o.vol != null ? `${fmt(o.vol)} people ask this monthly` : "Buyers ask this in your category"} <span className="mx-1">·</span> <span style={{ color: o.impact === "High" ? "var(--signal-live-ink)" : "var(--fg-muted)" }}>{o.impact} impact</span></p>
            </div>
            <span className="text-[12.5px] font-semibold shrink-0 flex items-center gap-1" style={{ color: "var(--accent-ink)" }}>{writing === `q${i}` ? "Writing…" : "Fix this"} <Icon.arrowRight size={13} /></span>
          </div>
        ))}
      </div>
      {rest.length > 4 && (
        <div className="mt-3 text-center">
          <button onClick={() => setShowAll((v) => !v)} className="text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)", background: "none", border: "none", cursor: "pointer" }}>{showAll ? "Show fewer" : `See all ${rest.length} questions →`}</button>
        </div>
      )}
    </Card>
  );
}

// ── WHERE AI LEARNS ABOUT YOUR CATEGORY ─────────────────────────────────────
const KIND_LABEL = { listicle: "Buying guide", review: "Review site", community: "Community", directory: "Directory", news: "Press", unknown: "Discovery" };
function WhereAILearns({ host }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/citations", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j?.ok) setD(j); }).catch(() => {}); }, []);
  async function run() { if (busy) return; setBusy(true); try { const j = await fetch("/api/citations", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()); if (j?.ok) setD(j); } catch {} setBusy(false); }
  const targets = d?.targets || [];
  const shown = [...targets].sort((a, b) => Number(a.mentioned) - Number(b.mentioned)).slice(0, 5);
  return (
    <Card className="p-6 mg-rise">
      <p className="mg-klabel">WHERE AI LEARNS ABOUT YOUR CATEGORY</p>
      <p className="mt-2 text-[13.5px] mg-muted" style={{ maxWidth: 640 }}>When AI recommends products like yours, it reads these websites to decide what to suggest. Being listed on them helps you get mentioned.</p>
      {shown.length > 0 ? (
        <div className="mt-4 flex flex-col">
          {shown.map((t, i) => (
            <a key={i} href={t.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2.5 mg-qrow px-2 rounded-lg" style={{ borderTop: i === 0 ? "none" : "1px solid var(--hair)" }}>
              <span className="shrink-0" style={{ color: t.mentioned ? "var(--signal-live-ink)" : "var(--fg-subtle)" }}>{t.mentioned ? <Icon.check size={16} /> : <Icon.x size={15} />}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold truncate" style={{ color: "var(--fg)" }}>{t.title || t.domain}</p>
                <p className="text-[11.5px] mg-subtle">{KIND_LABEL[t.kind] || "Discovery"}</p>
              </div>
              <span className="text-[12px] shrink-0" style={{ color: t.mentioned ? "var(--signal-live-ink)" : "var(--fg-muted)" }}>{t.mentioned ? "You’re listed" : "You’re missing"}</span>
            </a>
          ))}
          {targets.length > 5 && <a href="#" onClick={(e) => e.preventDefault()} className="mt-3 text-center text-[13px] font-semibold" style={{ color: "var(--accent-ink)" }}>See all {targets.length} places →</a>}
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-[13px] mg-muted">I map the sites AI reads for your category, then find the ones you’re missing from.</p>
          <button onClick={run} disabled={busy} className="mg-btn mg-btn--ghost mt-3 disabled:opacity-60" style={{ fontSize: 12.5 }}>{busy ? "Checking the lists…" : "Find where AI learns about you →"}</button>
        </div>
      )}
    </Card>
  );
}

// ── ADVANCED (progressive disclosure) ───────────────────────────────────────
function AdvancedMetrics({ open, setOpen, d }) {
  return (
    <Card className="p-0 overflow-hidden mg-rise">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-6 py-4 mg-focus" style={{ background: "none", border: "none", cursor: "pointer" }}>
        <Icon.chevronRight size={16} style={{ color: "var(--fg-subtle)", transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
        <span className="text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>See detailed metrics and progress charts</span>
      </button>
      {open && (
        <div className="px-6 pb-6 flex flex-col gap-5" style={{ borderTop: "1px solid var(--hair)", paddingTop: 20 }}>
          {d?.history?.length > 0 ? <VisibilityProof history={d.history} newlyCited={d.newlyCited} engines={d.engines} /> : <p className="text-[13px] mg-subtle">Your visibility timeline builds as Genie re-checks over the coming weeks.</p>}
          <CitationGap />
        </div>
      )}
    </Card>
  );
}

// ── RIGHT RAIL ──────────────────────────────────────────────────────────────
function ProgressCard({ health, delta }) {
  return (
    <Card className="p-5 mg-rise">
      <p className="mg-klabel">YOUR PROGRESS</p>
      <p className="mt-3 text-[12.5px] mg-muted">Health score</p>
      <div className="mt-2 flex justify-center"><Ring value={health == null ? null : Math.round(health)} /></div>
      {delta != null && (
        <p className="mt-3 text-center flex items-center justify-center gap-1.5 text-[13px] font-semibold" style={{ color: delta >= 0 ? "var(--signal-live-ink)" : "var(--signal-danger)" }}>
          <span style={{ fontSize: 9 }}>{delta >= 0 ? "▲" : "▼"}</span> {delta >= 0 ? "+" : ""}{delta} this week
        </p>
      )}
    </Card>
  );
}
function Ring({ value, size = 132 }) {
  const stroke = 11, r = size / 2 - stroke - 4, c = 2 * Math.PI * r, cx = size / 2;
  const [off, setOff] = useState(c);
  useEffect(() => { const t = setTimeout(() => setOff(c - ((value ?? 0) / 100) * c), 120); return () => clearTimeout(t); }, [value, c]);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="url(#aiRing)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.1s var(--ease-out)" }} />
        <defs><linearGradient id="aiRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="var(--mg-dawn-500)" /><stop offset="100%" stopColor="var(--mg-dawn-600)" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mg-num" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, color: "var(--fg)" }}>{value == null ? "—" : value}</span>
        <span className="text-[12px] mg-subtle mg-num">/100</span>
      </div>
    </div>
  );
}
function MilestoneCard({ estDays }) {
  return (
    <Card className="p-5 mg-rise">
      <p className="mg-klabel">NEXT MILESTONE</p>
      <p className="mt-3 text-[16px] font-bold" style={{ color: "var(--fg)" }}>First AI citation</p>
      <p className="mt-1.5 text-[13px] mg-muted">Est. <span className="font-bold" style={{ color: "var(--accent-ink)" }}>{estDays} days</span></p>
    </Card>
  );
}
function SpeedUpCard({ approvals }) {
  return (
    <Card className="p-5 mg-rise">
      <p className="mg-klabel">HOW TO SPEED THIS UP</p>
      <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--fg)" }}>Approve pending drafts ({approvals})</p>
      <p className="mt-1 text-[12.5px] mg-muted">This helps Genie publish faster.</p>
      <a href="/approvals" className="mg-btn mg-btn--dawn w-full mt-3" style={{ fontSize: 13 }}>See pending drafts →</a>
    </Card>
  );
}

// ── FIRST CHECK (empty) ─────────────────────────────────────────────────────
function FirstCheck({ checking, step, onCheck, host }) {
  return (
    <div className="mt-8">
      <Card className="mg-aura-field p-10 lg:p-12 text-center mg-rise">
        <div style={{ display: "grid", placeItems: "center" }}><GenieAperture size={96} state={checking ? "thinking" : "idle"} /></div>
        <h2 className="mt-4 mg-display" style={{ fontSize: 27 }}>{checking ? "Asking the AI models…" : "Let’s see if AI recommends you"}</h2>
        <p className="mt-2 mg-lede" style={{ marginLeft: "auto", marginRight: "auto" }}>
          {checking
            ? "Genie is putting your buyers' questions to ChatGPT, Perplexity, Gemini and Claude, and reading who they name in the answer."
            : "I ask ChatGPT, Perplexity, Gemini, and Claude the questions your buyers ask, then show you exactly where they name a competitor instead of you, and how to win those mentions."}
        </p>
        {checking
          ? <p className="mt-4 text-[13px] font-semibold flex items-center justify-center gap-2" style={{ color: "var(--accent-ink)" }}>{step || "Checking AI search"} <span className="mg-thinking"><i /><i /><i /></span></p>
          : <button onClick={onCheck} disabled={!host} className="mg-btn mg-btn--dawn mt-5 inline-flex disabled:opacity-60" style={{ fontSize: 14, padding: ".8rem 1.3rem" }}>{host ? "Check AI search now →" : "Run your first scan →"}</button>}
      </Card>
    </div>
  );
}

// ── DETAILED METRICS PARTS (reused, progressively disclosed) ─────────────────
function VisibilityProof({ history = [], newlyCited = [], engines = [] }) {
  const scores = history.map((h) => h.score);
  const cur = scores[scores.length - 1] ?? 0;
  const first = scores[0] ?? 0;
  const delta = cur - first;
  const single = history.length < 2;
  return (
    <Card className="p-5 mg-ambient">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="mg-eyebrow"><Icon.growth size={14} /> Your AI visibility over time</p>
        {engines?.length ? <Provenance kind="verified">Asked {engines.slice(0, 3).map((e) => e.label || e).join(" · ")}</Provenance> : null}
      </div>
      <div className="mt-3 flex items-end gap-5 flex-wrap">
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="mg-num" style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-.03em", color: cur > 0 ? "var(--signal-live-ink)" : "var(--fg)" }}>{cur}%</span>
            {!single && <span className="text-[13px] font-semibold" style={{ color: delta >= 0 ? "var(--signal-live-ink)" : "var(--signal-danger)" }}>{delta >= 0 ? "+" : ""}{delta} since first check</span>}
          </div>
          <p className="mt-0.5 text-[12.5px] mg-muted">of buyer questions where AI now names you</p>
        </div>
        <div className="flex-1 min-w-[200px]"><Sparkline points={scores} /></div>
      </div>
      {single ? (
        <p className="mt-3 text-[12.5px] mg-subtle">First check recorded. As Genie publishes answer pages, come back to watch this line climb.</p>
      ) : newlyCited.length > 0 ? (
        <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--hair)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--signal-live-ink)" }}>Newly won since last check</p>
          <ul className="mt-2 space-y-1.5">
            {newlyCited.map((q, i) => (<li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: "var(--fg-muted)" }}><Icon.check size={14} style={{ color: "var(--signal-live-ink)", marginTop: 1, flexShrink: 0 }} /><span>AI now names you when buyers ask <span style={{ color: "var(--fg)", fontWeight: 600 }}>“{q}”</span></span></li>))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
function Sparkline({ points = [], width = 320, height = 56 }) {
  if (!points.length) return null;
  const n = points.length;
  const xAt = (i) => (n === 1 ? width : (i / (n - 1)) * width);
  const yAt = (v) => height - (Math.max(0, Math.min(100, v)) / 100) * (height - 6) - 3;
  const line = points.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }} aria-hidden>
      <defs><linearGradient id="mg-spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--signal-live)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--signal-live)" stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#mg-spark)" />
      <path d={line} fill="none" stroke="var(--signal-live)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function CitationGap() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/citations", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j?.ok) setD(j); }).catch(() => {}); }, []);
  async function run() { if (busy) return; setBusy(true); try { const j = await fetch("/api/citations", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()); if (j?.ok) setD(j); } catch {} setBusy(false); }
  const s = d?.summary;
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>The lists AI reads</h3>
        <button onClick={run} disabled={busy} className="ml-auto text-[12.5px] font-semibold mg-focus disabled:opacity-50" style={{ color: "var(--accent-ink)", background: "none", border: "none", cursor: "pointer" }}>{busy ? "Checking…" : d ? "Re-check" : "Check now →"}</button>
      </div>
      {s && (
        <div className="mg-statstrip mt-3">
          <StatBox value={s.checked} label="Pages AI cites" />
          <StatBox value={s.gaps} label="You’re missing from" accent />
          <StatBox value={s.alreadyIn} label="Already listed in" />
          <StatBox value={s.actionable} label="Worth pitching" accent />
        </div>
      )}
    </div>
  );
}
function StatBox({ value, label, accent }) { return (<div className="mg-statcell"><p className="mg-stat-num" style={accent ? { color: "var(--accent-ink)" } : undefined}>{value}</p><p className="mg-stat-label">{label}</p></div>); }

function InfoIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" strokeLinecap="round" /><circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none" /></svg>); }
