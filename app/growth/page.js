"use client";

// ── GROWTH — the organic-growth command center ──
// One question, answered with data: "is my organic growth working, and where is
// Genie focused next?" A ranking-progression chart, four glance metrics, the
// keyword performance table, and the strategy phase — with a sticky portfolio
// health rail. Real data throughout: rankings + nightly history from Search
// Console, difficulty/volume from the keyword brain. No storytelling, no queue.
// (Rankings plot with the BEST position at the top, so improvement reads as a
// rising line — the SEO-correct orientation, not worst-at-top.)

import { useState, useEffect, useMemo, Suspense } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { EmptyState } from "@/components/ui/v2/DataState";
import { fetchLive } from "@/lib/live";
import { climbFrom } from "@/lib/keyword-health";
import { campaignStatus, difficultyTier } from "@/lib/keyword-plan";

const RANGE_OPTS = [{ id: 7, label: "Last 7 days" }, { id: 30, label: "Last 30 days" }, { id: 90, label: "Last 90 days" }, { id: 9999, label: "All time" }];
const COMPARE_OPTS = [{ id: "prev", label: "Previous period" }, { id: "start", label: "Start of tracking" }];
const SORT_OPTS = [{ id: "position", label: "Position" }, { id: "change", label: "Change" }, { id: "volume", label: "Volume" }, { id: "difficulty", label: "Difficulty" }];
const PAGE_SIZE = 8;

const fmtNum = (n) => { n = Number(n) || 0; if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"; if (n >= 1000) return n.toLocaleString(); return String(Math.round(n)); };
function estVolume(k) { const real = Number(k.volume); if (real > 0) return real; const p = k.traffic_potential ?? 0; if (p >= 85) return 22000; if (p >= 70) return 8000; if (p >= 55) return 2500; if (p >= 45) return 900; if (p >= 35) return 350; return 120; }
const STATUS_TEXT = { achieved: "Ranking", climbing: "Climbing", stalled: "Stalled", indexing: "Indexing", working: "Drafting", not_started: "Queued" };
function statusTone(state) { return state === "achieved" || state === "climbing" ? "var(--signal-live-ink)" : state === "stalled" ? "var(--signal-warn)" : state === "indexing" ? "var(--signal-info)" : "var(--fg-subtle)"; }
const posOf = (k) => (k._status?.current != null ? k._status.current : (Number(k.gsc_position) > 0 ? Number(k.gsc_position) : null));

export default function GrowthPage() { return <Suspense fallback={null}><Growth /></Suspense>; }

function Growth() {
  const [d, setD] = useState({ keywords: { graded: [] }, climb: null, series: {} });
  const [state, setState] = useState("loading");
  const [host, setHost] = useState("");
  const [conns, setConns] = useState(null);
  const [approvals, setApprovals] = useState(0);
  const [busy, setBusy] = useState("");
  const [step, setStep] = useState("");
  const [deriveErr, setDeriveErr] = useState("");
  const [refreshMsg, setRefreshMsg] = useState("");
  const [ranksBusy, setRanksBusy] = useState(false);
  const [hubBusy, setHubBusy] = useState(false);
  const [range, setRange] = useState(30);
  const [compare, setCompare] = useState("prev");

  async function refreshPage() {
    if (busy) return;
    setBusy("refresh"); setRefreshMsg("");
    try {
      const j = await fetch("/api/content/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }) }).then((r) => r.json());
      setRefreshMsg(j?.ok ? "On it. I’m re-optimizing your stalest page. It’ll appear in Approvals in about 30 seconds." : (j?.message || "Nothing to refresh right now."));
    } catch { setRefreshMsg("Couldn’t start that just now. Try again in a moment."); }
    setBusy("");
  }

  async function refreshRankings() {
    if (!host || ranksBusy) return;
    setRanksBusy(true); setRefreshMsg("");
    try { await loadFor(host); setRefreshMsg("Rankings refreshed from your latest Google Search Console data."); }
    catch { setRefreshMsg("Couldn’t refresh rankings just now. Try again in a moment."); }
    setRanksBusy(false);
  }

  async function buildHub() {
    if (!host || hubBusy) return;
    setHubBusy(true); setRefreshMsg("");
    try {
      const j = await fetch("/api/pillars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }) }).then((r) => r.json());
      setRefreshMsg(j?.message || (j?.ok ? "Topic hub built — review it in Approvals." : "Couldn’t build a hub right now."));
    } catch { setRefreshMsg("Couldn’t build a hub just now. Try again in a moment."); }
    setHubBusy(false);
  }

  async function loadFor(h) {
    const [k, s] = await Promise.all([
      fetch(`/api/keywords?host=${encodeURIComponent(h)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/keywords/sync?host=${encodeURIComponent(h)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);
    const next = {
      keywords: k?.ok ? { portfolioScore: k.portfolioScore, graded: k.graded || [], counts: k.counts } : { graded: [] },
      climb: s?.ok ? climbFrom(s.series) : null,
      series: s?.ok ? (s.series || {}) : {},
    };
    setD(next);
    setState(next.keywords.graded.length ? "real" : "empty");
  }

  useEffect(() => {
    (async () => {
      const [today, connsRes] = await Promise.all([fetchLive("/api/today"), fetchLive("/api/connections/status")]);
      if (connsRes.live) setConns(connsRes.data?.integrations || null);
      if (today.live) setApprovals(today.data?.approvalsCount || 0);
      const h = today.live && today.data?.entity?.host;
      if (!h) { setState(today.live ? "empty" : "disconnected"); return; }
      setHost(h);
      await loadFor(h);
    })();
  }, []);

  async function derive({ rebuild = false } = {}) {
    if (!host) return;
    if (rebuild && !confirm("Rebuild the keyword strategy from scratch? Genie replaces the keywords it picked with a fresh set (any you added by hand are kept).")) return;
    setBusy("derive"); setDeriveErr("");
    const steps = ["Reading what you sell…", "Pulling real Google searches…", "Choosing the terms buyers type…", "Scoring demand vs winnability…", "Ordering your plan…"];
    let i = 0; setStep(steps[0]);
    const tick = setInterval(() => { i = Math.min(i + 1, steps.length - 1); setStep(steps[i]); }, 4500);
    try {
      const r = await fetch("/api/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, rebuild }) }).then((x) => x.json());
      if (r.ok) setD((prev) => ({ ...prev, keywords: { portfolioScore: r.portfolioScore, graded: r.graded || [], counts: r.counts } }));
      else setDeriveErr(r.message || r.error || "I couldn’t build the strategy just then. Try again.");
    } catch { setDeriveErr("Something interrupted me. Check your connection and try again."); }
    clearInterval(tick); setStep(""); setBusy("");
  }

  // ── derived, real ──
  const kw = d.keywords || { graded: [] };
  const active = useMemo(
    () => (kw.graded || []).filter((k) => k.health !== "retired").map((k) => ({ ...k, _status: campaignStatus(k, d.series[k.keyword] || []) })),
    [kw.graded, d.series]
  );
  const climb = d.climb;
  const windowPoints = useMemo(() => (climb?.points || []).slice(-Math.max(2, range === 9999 ? 9999 : range)), [climb, range]);
  const tracked = active.length;
  const avgPosition = climb ? climb.last : (() => { const ps = active.map(posOf).filter((x) => x != null); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null; })();
  const improvedBy = windowPoints.length > 1 ? Math.round((windowPoints[0].position - windowPoints[windowPoints.length - 1].position) * 10) / 10 : (climb?.delta || 0);
  const inTop20 = active.filter((k) => { const p = posOf(k); return p != null && p <= 20; }).length;
  const aiCitations = active.filter((k) => k.ai_cited).length;
  const portfolioScore = kw.portfolioScore ?? null;

  return (
    <OperatorShell active="growth">
      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="mg-display" style={{ fontSize: "clamp(24px,2.6vw,30px)" }}>Growth</h1>
          <p className="mt-1.5 text-[14px] mg-muted">Track your keyword rankings and organic growth over time.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={refreshRankings} disabled={ranksBusy || !host} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 12.5 }} title="Pull your latest Google positions from Search Console">
            <Icon.growth size={14} /> {ranksBusy ? "Refreshing…" : "Refresh rankings"}
          </button>
          <button onClick={refreshPage} disabled={busy === "refresh" || !host} className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 12.5 }} title="Re-optimize your stalest published page and republish it in place">
            <Icon.history size={14} /> {busy === "refresh" ? "Refreshing…" : "Refresh a page"}
          </button>
          <button onClick={buildHub} disabled={hubBusy || !host} className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 12.5 }} title="Assemble a pillar hub page that links your related articles together — builds topical authority">
            <Icon.link size={14} /> {hubBusy ? "Building…" : "Build topic hub"}
          </button>
          <button onClick={() => derive({ rebuild: true })} disabled={busy === "derive" || !host} className="mg-btn disabled:opacity-50" style={{ fontSize: 12.5, background: "var(--surface)", border: "1px solid var(--accent)", color: "var(--accent-ink)" }}>
            <Icon.scan size={14} /> {busy === "derive" ? (step ? "Rebuilding…" : "Rebuilding…") : "Rebuild strategy"}
          </button>
        </div>
      </div>
      {refreshMsg && <p className="mt-2 text-[12.5px]" style={{ color: "var(--accent-ink)" }}>{refreshMsg}</p>}

      {state === "disconnected" ? (
        <div className="mt-8"><EmptyState state="disconnected" icon={Icon.growth} title="I can’t reach your growth data" sub="Sign in and I’ll show your rankings and strategy." /></div>
      ) : state === "empty" || (state === "real" && active.length === 0) ? (
        <BuildStrategy host={host} busy={busy} step={step} err={deriveErr} onBuild={() => derive()} />
      ) : state === "loading" ? (
        <div className="mt-8 mg-surface p-10 text-center text-[13px] mg-subtle">Loading your growth data…</div>
      ) : (
        <>
          {/* plain-language Google standing */}
          <p className="mt-4 text-[13.5px]" style={{ color: "var(--fg)", maxWidth: "72ch" }}>
            {avgPosition != null
              ? <>Right now you rank <b style={{ color: "var(--accent-ink)" }}>#{Math.round(avgPosition)}</b> on average across <b>{tracked}</b> tracked {tracked === 1 ? "keyword" : "keywords"}{inTop20 > 0 ? <> · <b>{inTop20}</b> already in the top 20</> : null}{improvedBy > 0 ? <> · <span style={{ color: "var(--signal-live-ink)", fontWeight: 600 }}>up {improvedBy} spots this period</span></> : null}. Your climbers are in the table below (status <b>Climbing</b>/<b>Ranking</b>).</>
              : <>Genie is tracking <b>{tracked}</b> {tracked === 1 ? "keyword" : "keywords"}. Your live Google positions show here once Search Console reports for your site — usually a few days after your first page is indexed. Tap <b>Refresh rankings</b> to pull the latest.</>}
          </p>

          {/* how Genie speeds up indexing — the always-on internal-link acceleration */}
          <p className="mt-2 text-[12px] mg-subtle flex items-start gap-1.5" style={{ maxWidth: "72ch" }}>
            <Icon.link size={13} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>Every time Genie publishes a new page it links <b>2–3 of your older, related pages</b> to it — a whitehat trick that gets fresh pages found in <b>days, not weeks</b>, and passes them ranking strength. Runs automatically after each publish; watch for it in the live activity bar up top.</span>
          </p>

          {/* controls */}
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <LabeledSelect label="Time range" value={range} opts={RANGE_OPTS} onChange={setRange} />
            <LabeledSelect label="Compare to" value={compare} opts={COMPARE_OPTS} onChange={setCompare} />
          </div>

          {deriveErr && <p className="mt-3 text-[12.5px]" style={{ color: "var(--signal-danger)" }}>{deriveErr}</p>}

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
            {/* ── MAIN ── */}
            <div className="min-w-0 flex flex-col gap-5">
              <RankingProgression points={windowPoints} tracked={tracked} improvedBy={improvedBy} climb={climb} compare={compare} conns={conns} />
              <MetricsRow tracked={tracked} avgPosition={avgPosition} improvedBy={improvedBy} inTop20={inTop20} aiCitations={aiCitations} points={windowPoints} />
              <KeywordTable active={active} series={d.series} host={host} onAdded={(j) => setD((prev) => ({ ...prev, keywords: { portfolioScore: j.portfolioScore, graded: j.graded || prev.keywords.graded, counts: j.counts } }))} />
              <PagePerformance host={host} />
              <LocalServices host={host} />
              <StrategyPhase active={active} inTop20={inTop20} />
            </div>

            {/* ── RIGHT RAIL ── */}
            <div className="xl:sticky xl:top-4 flex flex-col gap-4">
              <PortfolioHealth score={portfolioScore} climb={climb} conns={conns} approvals={approvals} />
              <NextMilestone active={active} inTop20={inTop20} />
            </div>
          </div>
        </>
      )}
    </OperatorShell>
  );
}

// ── RANKING PROGRESSION (hero) ──────────────────────────────────────────────
function RankingProgression({ points, tracked, improvedBy, climb, compare, conns }) {
  const [showDetails, setShowDetails] = useState(false);
  const improved = improvedBy > 0;
  const googleOn = conns?.google?.connected === true;
  return (
    <Card className="p-6 mg-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mg-klabel">RANKING PROGRESSION</p>
          <p className="mt-1 text-[13px] mg-muted">Average position across {tracked} tracked {tracked === 1 ? "keyword" : "keywords"}</p>
          {points.length > 1 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: improved ? "var(--signal-live-ink)" : improvedBy < 0 ? "var(--signal-danger)" : "var(--fg-muted)" }}>
              <Tri dir={improved ? "up" : improvedBy < 0 ? "down" : "flat"} /> {improved ? `Improved by ${Math.abs(improvedBy)} positions` : improvedBy < 0 ? `Down ${Math.abs(improvedBy)} positions` : "Holding steady"}
            </p>
          )}
        </div>
        <button onClick={() => setShowDetails((v) => !v)} className="mg-btn mg-btn--ghost shrink-0" style={{ fontSize: 12 }}>Details</button>
      </div>

      {points.length > 1 ? (
        <>
          <RankChart points={points} />
          {showDetails && (
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <Detail v={points[0].position.toFixed(1)} l="Start of period" />
              <Detail v={points[points.length - 1].position.toFixed(1)} l="Now" />
              <Detail v={climb?.clicks ? fmtNum(climb.clicks) : "—"} l="Clicks in window" />
            </div>
          )}
        </>
      ) : (
        <div className="mt-4 rounded-xl px-5 py-10 text-center" style={{ border: "1px dashed var(--border-strong)" }}>
          <p className="text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>Your ranking line starts as soon as positions come in.</p>
          {googleOn ? (
            <p className="mt-1 text-[12.5px] mg-muted max-w-md mx-auto">Google is connected ✓. I record your average position every night — the line fills in once your pages are indexed and Search Console starts reporting for your site (usually a few days after your first article goes live). <a href="/approvals" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>Publish your first page</a> to start the clock.</p>
          ) : (
            <p className="mt-1 text-[12.5px] mg-muted max-w-sm mx-auto">I record your average Google position every night. <a href="/connections" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>Connect Google Search Console</a> for live rankings.</p>
          )}
        </div>
      )}
    </Card>
  );
}
function Detail({ v, l }) { return (<div className="mg-surface-quiet py-2.5"><p className="mg-num text-[18px] font-bold" style={{ color: "var(--fg)" }}>{v}</p><p className="text-[11px] mg-subtle mt-0.5">{l}</p></div>); }

// ── PER-PAGE RESULTS ── The honest "the machine is working" readout: real clicks to
// the business site (via the CTA, counted through /go) and leads captured, per page.
// First-party, so it shows from day one without any analytics connection. Stays quiet
// until there's data, so it never adds an empty-flash to the page.
function PagePerformance({ host }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await fetch(`/api/pages/performance${host ? `?host=${encodeURIComponent(host)}` : ""}`, { cache: "no-store" }).then((r) => r.json());
        if (alive) setD(j?.ok ? j : { pages: [], totals: { clicks: 0, leads: 0 } });
      } catch { if (alive) setD({ pages: [], totals: { clicks: 0, leads: 0 } }); }
    })();
    return () => { alive = false; };
  }, [host]);

  if (!d) return null;
  const pages = d.pages || [];
  if (!pages.length) return null; // nothing published yet — the rest of Growth covers that
  const t = d.totals || { clicks: 0, leads: 0 };
  const engaged = pages.filter((p) => p.clicks || p.leads);
  const rows = (engaged.length ? engaged : pages).slice(0, 8);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>What your pages are earning</h2>
          <p className="mt-0.5 text-[12.5px] mg-muted">Real clicks to your site and leads captured — first-party, no analytics needed.</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right"><p className="mg-num text-[20px] font-bold leading-none" style={{ color: "var(--accent-ink)" }}>{t.clicks}</p><p className="text-[11px] mg-subtle mt-1">clicks to site</p></div>
          <div className="text-right"><p className="mg-num text-[20px] font-bold leading-none" style={{ color: "var(--signal-live-ink)" }}>{t.leads}</p><p className="text-[11px] mg-subtle mt-1">leads</p></div>
        </div>
      </div>
      <div className="px-3 pb-3">
        {rows.map((p, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2.5" style={{ borderTop: "1px solid var(--hair)" }}>
            <div className="flex-1 min-w-0">
              <a href={p.url} target="_blank" rel="noopener" className="text-[13px] font-semibold truncate block mg-focus" style={{ color: "var(--fg)", textDecoration: "none" }}>{p.title}</a>
              {p.keyword && <p className="text-[11px] mg-subtle truncate mt-0.5">{p.keyword}</p>}
            </div>
            <div className="flex items-center gap-4 shrink-0 mg-num text-[12.5px]">
              <span title="Clicks to your site" style={{ color: p.clicks ? "var(--fg)" : "var(--fg-subtle)" }}>{p.clicks} <span className="mg-subtle text-[11px]">clicks</span></span>
              <span title="Leads captured" style={{ color: p.leads ? "var(--signal-live-ink)" : "var(--fg-subtle)" }}>{p.leads} <span className="mg-subtle text-[11px]">leads</span></span>
            </div>
          </div>
        ))}
        {!engaged.length && <p className="px-2 py-3 text-[12px] mg-subtle">No clicks or leads yet — they’ll show here as readers reach your published pages. Keep publishing and sharing.</p>}
      </div>
    </Card>
  );
}

// ── LOCAL SERVICE OPTIMIZER ── Only shows for local businesses. Genie writes
// city-tagged Google Business Profile service names + ~300-char descriptions that win
// "near me" searches; the owner pastes them into their GBP (the service API is gated).
function LocalServices({ host }) {
  const [d, setD] = useState(null);
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await fetch(`/api/local${host ? `?host=${encodeURIComponent(host)}` : ""}`, { cache: "no-store" }).then((r) => r.json());
        if (alive) { setD(j?.ok ? j : { local: false }); if (j?.city) setCity(j.city); }
      } catch { if (alive) setD({ local: false }); }
    })();
    return () => { alive = false; };
  }, [host]);

  if (!d || !d.local) return null; // hidden for online-first businesses

  async function generate() {
    if (busy || !city.trim()) return;
    setBusy(true); setMsg("");
    try {
      const j = await fetch("/api/local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, city }) }).then((r) => r.json());
      if (j?.ok) { setD((prev) => ({ ...prev, services: j.services, city: j.city })); setMsg(j.message || ""); }
      else setMsg(j?.message || "Couldn’t build the list.");
    } catch { setMsg("Couldn’t build the list. Try again."); }
    setBusy(false);
  }
  function copy(text, what) { try { navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1500); } catch {} }

  const services = d.services || [];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Icon.target size={16} />
        <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Local service optimizer</h2>
      </div>
      <p className="mt-1 text-[12.5px] mg-muted" style={{ maxWidth: "64ch" }}>Google ranks local businesses on relevance + proximity. Tagging each service with your city (&ldquo;Roman Shades {city || "Your City"}&rdquo;) wins more &ldquo;near me&rdquo; searches. Genie writes them; you paste into your Google Business Profile.</p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Your city (e.g. Austin)" style={{ fontSize: 13, padding: ".5rem .7rem", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--fg)", minWidth: 180 }} />
        <button onClick={generate} disabled={busy || !city.trim()} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 12.5 }}>{busy ? "Optimizing…" : services.length ? "Regenerate" : "Optimize services"}</button>
      </div>
      {msg && <p className="mt-2 text-[12px]" style={{ color: "var(--accent-ink)" }}>{msg}</p>}
      {services.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          {services.map((s, i) => (
            <div key={i} className="mg-surface-quiet p-3">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold flex-1 min-w-0" style={{ color: "var(--fg)" }}>{s.cityTagged}</span>
                <button onClick={() => copy(s.cityTagged, `n${i}`)} className="mg-btn mg-btn--quiet shrink-0" style={{ fontSize: 11 }}>{copied === `n${i}` ? "Copied" : "Copy name"}</button>
              </div>
              <p className="mt-1 text-[12px] mg-muted">{s.description} <span className="mg-subtle">({s.description.length}/300)</span></p>
              <button onClick={() => copy(s.description, `d${i}`)} className="mt-1.5 text-[11px] mg-focus" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-ink)", fontWeight: 600 }}>{copied === `d${i}` ? "Copied ✓" : "Copy description"}</button>
            </div>
          ))}
          <p className="text-[11px] mg-subtle">Paste each into Google Business Profile → Edit services. Only use cities you actually serve.</p>
        </div>
      )}
    </Card>
  );
}

// The chart. Best position sits at the TOP, so genuine improvement rises.
function RankChart({ points }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 240, padL = 34, padR = 12, padT = 14, padB = 26;
  const vals = points.map((p) => p.position);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span0 = Math.max(1, hi - lo); lo = Math.max(1, lo - span0 * 0.25); hi = hi + span0 * 0.25;
  const span = Math.max(1, hi - lo);
  const x = (i) => padL + (i * (W - padL - padR)) / (points.length - 1);
  const y = (pos) => padT + ((pos - lo) / span) * (H - padT - padB); // smaller pos → higher
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.position).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => Math.round(lo + (span * i) / ticks));
  const xIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const fx = (dt) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dt || ""); return m ? `${+m[2]}/${+m[3]}` : dt; };
  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let idx = Math.round(((px - padL) / (W - padL - padR)) * (points.length - 1));
    idx = Math.max(0, Math.min(points.length - 1, idx));
    setHover(idx);
  }
  return (
    <div className="mt-4 relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mg-draw" style={{ height: 260, overflow: "visible" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Average Google ranking position over time">
        <defs><linearGradient id="rankFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        {yTicks.map((t, i) => { const yy = y(t); return (<g key={i}><line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--hair)" strokeWidth="1" /><text x={padL - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="var(--fg-subtle)">{t}</text></g>); })}
        <path d={area} fill="url(#rankFill)" />
        <path className="mg-draw-line" d={line} fill="none" stroke="var(--accent-ink)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        {xIdx.map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="10" fill="var(--fg-subtle)">{fx(points[i].date)}</text>)}
        {hover != null && (<g><line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" /><circle cx={x(hover)} cy={y(points[hover].position)} r="4" fill="var(--accent-ink)" stroke="var(--surface)" strokeWidth="2" /></g>)}
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].position)} r="3.5" fill="var(--accent-ink)" />
      </svg>
      {hover != null && (
        <div className="absolute pointer-events-none mg-surface px-3 py-2" style={{ left: `${(x(hover) / W) * 100}%`, top: 0, transform: "translateX(-50%)", boxShadow: "var(--shadow-3)", borderColor: "var(--border-strong)", whiteSpace: "nowrap" }}>
          <p className="text-[10.5px] mg-subtle">{points[hover].date}</p>
          <p className="text-[12.5px] font-bold mg-num" style={{ color: "var(--fg)" }}>Avg position {points[hover].position.toFixed(1)}</p>
        </div>
      )}
    </div>
  );
}

// ── FOUR GLANCE METRICS ─────────────────────────────────────────────────────
function MetricsRow({ tracked, avgPosition, improvedBy, inTop20, aiCitations, points }) {
  const posSeries = points.map((p) => p.position);
  const cells = [
    { label: "Keywords tracked", value: tracked, change: null, spark: null },
    { label: "Avg. position", value: avgPosition != null ? Math.round(avgPosition) : "—", change: improvedBy, spark: posSeries, invert: true },
    { label: "In top 20", value: inTop20, change: inTop20 > 0 ? inTop20 : null, spark: null },
    { label: "AI citations", value: aiCitations, change: null, spark: null },
  ];
  return (
    <Card className="p-0 overflow-hidden mg-rise">
      <div className="grid grid-cols-2 md:grid-cols-4">
        {cells.map((c, i) => (
          <div key={i} className="p-5" style={{ borderLeft: i % 4 === 0 ? "none" : "1px solid var(--hair)", borderTop: i >= 2 ? "1px solid var(--hair)" : "none" }}>
            <p className="text-[12px] mg-subtle">{c.label}</p>
            <div className="mt-1.5 flex items-end justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="mg-num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1, color: "var(--fg)" }}>{c.value}</span>
                {c.change != null && c.change !== 0 && (
                  <span className="flex items-center gap-0.5 text-[12px] font-semibold" style={{ color: c.change > 0 ? "var(--signal-live-ink)" : "var(--signal-danger)" }}><Tri dir={c.change > 0 ? "up" : "down"} />{Math.abs(c.change)}</span>
                )}
                {c.change === null && <span className="text-[12px] mg-subtle">—</span>}
              </div>
              <Spark data={c.spark} invert={c.invert} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
function Spark({ data, invert }) {
  const w = 66, h = 22;
  if (!data || data.length < 2) return <svg width={w} height={h} aria-hidden><line x1="0" y1={h - 4} x2={w} y2={h - 4} stroke="var(--border-strong)" strokeWidth="1.5" strokeLinecap="round" /></svg>;
  let lo = Math.min(...data), hi = Math.max(...data); const span = Math.max(0.5, hi - lo);
  const yy = (v) => { const t = (v - lo) / span; return 3 + (invert ? t : 1 - t) * (h - 6); };
  const step = w / (data.length - 1);
  const dPath = data.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${yy(v).toFixed(1)}`).join(" ");
  const rising = invert ? data[data.length - 1] <= data[0] : data[data.length - 1] >= data[0];
  return <svg width={w} height={h} aria-hidden><path d={dPath} fill="none" stroke={rising ? "var(--signal-live)" : "var(--fg-subtle)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// ── KEYWORD TABLE ───────────────────────────────────────────────────────────
function KeywordTable({ active, series, host, onAdded }) {
  const [sort, setSort] = useState("position");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);

  const filterOpts = [{ id: "all", label: "All statuses" }, { id: "ranking", label: "Ranking" }, { id: "indexing", label: "Indexing" }, { id: "queued", label: "Queued" }];
  const filtered = active.filter((k) => {
    if (filter === "all") return true;
    const s = k._status?.state;
    if (filter === "ranking") return s === "achieved" || s === "climbing";
    if (filter === "indexing") return s === "indexing" || s === "working" || s === "stalled";
    return s === "not_started";
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "position") { const pa = posOf(a) ?? 999, pb = posOf(b) ?? 999; return pa - pb; }
    if (sort === "change") return (b._status?.trend || 0) - (a._status?.trend || 0);
    if (sort === "volume") return estVolume(b) - estVolume(a);
    return (b.competition ?? 0) - (a.competition ?? 0);
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  useEffect(() => { setPage((p) => Math.min(p, pages - 1)); }, [pages]);

  return (
    <Card className="p-0 overflow-hidden mg-rise">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 flex-wrap">
        <p className="mg-klabel">KEYWORDS</p>
        <div className="flex items-center gap-2">
          <MiniSelect label="Filter" value={filter} opts={filterOpts} onChange={(v) => { setFilter(v); setPage(0); }} />
          <MiniSelect label="Sort" value={sort} opts={SORT_OPTS} onChange={setSort} prefix="Sort: " />
        </div>
      </div>
      <div className="overflow-x-auto thin-scroll">
        <table className="w-full" style={{ minWidth: 640, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderTop: "1px solid var(--hair)", borderBottom: "1px solid var(--hair)" }}>
              {["Keyword", "Position", "Change", "Volume / mo", "Difficulty", "Status", ""].map((h, i) => (
                <th key={i} className="text-left px-4 py-2 text-[11px] font-semibold mg-subtle" style={{ textAlign: i >= 1 && i <= 4 ? "right" : "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((k) => {
              const p = posOf(k); const trend = k._status?.trend || 0; const st = k._status?.state || "not_started";
              const vol = estVolume(k); const realVol = Number(k.volume) > 0;
              const open = openId === (k.id || k.keyword);
              return (
                <FragmentRow key={k.id || k.keyword} k={k} p={p} trend={trend} st={st} vol={vol} realVol={realVol} open={open} onToggle={() => setOpenId(open ? null : (k.id || k.keyword))} />
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-3 flex-wrap" style={{ borderTop: "1px solid var(--hair)" }}>
        {adding ? (
          <AddKeyword host={host} onAdded={(j) => { setAdding(false); onAdded(j); }} onCancel={() => setAdding(false)} />
        ) : (
          <button onClick={() => setAdding(true)} className="mg-btn" style={{ fontSize: 12.5, background: "var(--surface)", border: "1px solid var(--accent)", color: "var(--accent-ink)" }}><Icon.plus size={14} /> Add keyword</button>
        )}
        <div className="flex items-center gap-3">
          <span className="text-[12px] mg-subtle mg-num">Showing {sorted.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min(sorted.length, (page + 1) * PAGE_SIZE)} of {sorted.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="mg-focus disabled:opacity-30" style={{ background: "none", border: "none", cursor: "pointer", padding: 3, color: "var(--fg-subtle)" }}><Icon.chevronRight size={15} style={{ transform: "rotate(180deg)" }} /></button>
            <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className="mg-focus disabled:opacity-30" style={{ background: "none", border: "none", cursor: "pointer", padding: 3, color: "var(--fg-subtle)" }}><Icon.chevronRight size={15} /></button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function FragmentRow({ k, p, trend, st, vol, realVol, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className="mg-krow" style={{ borderBottom: "1px solid var(--hair)", cursor: "pointer" }}>
        <td className="px-4 py-3 text-[13.5px] font-semibold" style={{ color: "var(--fg)", maxWidth: 260 }}>{k.keyword}{k.source === "aeo" && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full align-middle" style={{ color: "var(--accent-ink)", background: "var(--accent-quiet)" }}>AI</span>}</td>
        <td className="px-4 py-3 text-right mg-num text-[13.5px]" style={{ color: p != null ? "var(--fg)" : "var(--fg-subtle)" }}>{p != null ? Math.round(p) : "—"}</td>
        <td className="px-4 py-3 text-right text-[13px]">{trend > 0 ? <span style={{ color: "var(--signal-live-ink)", fontWeight: 600 }}>▲ {Math.abs(trend)}</span> : trend < 0 ? <span style={{ color: "var(--signal-danger)", fontWeight: 600 }}>▼ {Math.abs(trend)}</span> : <span className="mg-subtle">—</span>}</td>
        <td className="px-4 py-3 text-right mg-num text-[13px]" style={{ color: "var(--fg-muted)" }} title={realVol ? "Real Google volume" : "Genie estimate"}>{fmtNum(vol)}{!realVol && <span className="mg-subtle" style={{ fontSize: 10 }}> *</span>}</td>
        <td className="px-4 py-3 text-right mg-num text-[13px]" style={{ color: "var(--fg-muted)" }}>{k.competition != null ? Math.round(k.competition) : "—"}</td>
        <td className="px-4 py-3 text-[12.5px] font-semibold" style={{ color: statusTone(st) }}>{STATUS_TEXT[st] || "Queued"}</td>
        <td className="px-3 py-3 text-right"><Icon.chevronRight size={14} style={{ color: "var(--fg-subtle)", transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }} /></td>
      </tr>
      {open && (
        <tr style={{ borderBottom: "1px solid var(--hair)", background: "var(--surface-2)" }}>
          <td colSpan={7} className="px-4 py-3.5">
            <KeywordDetail k={k} />
          </td>
        </tr>
      )}
    </>
  );
}

function KeywordDetail({ k }) {
  const s = k._status || {}; const tier = s.tier || difficultyTier(k);
  const facts = [
    ["Difficulty tier", tier ? tier[0].toUpperCase() + tier.slice(1) : "—"],
    ["Coverage", `${k.coverage || 0} ${k.coverage === 1 ? "piece" : "pieces"}`],
    ["Target", s.target ? `Top ${s.target.position} in ~${s.target.days}d` : "—"],
    ["AI citation", k.ai_cited ? "Cited ✓" : "Not yet"],
  ];
  const move = moveFor(s.state);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {facts.map(([l, v], i) => (<div key={i}><p className="text-[11px] mg-subtle">{l}</p><p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{v}</p></div>))}
      </div>
      <div className="flex items-start gap-2 pt-1">
        <Icon.spark size={14} style={{ color: "var(--accent-ink)", marginTop: 2, flexShrink: 0 }} />
        <p className="text-[12.5px] mg-muted"><span className="font-semibold" style={{ color: "var(--fg)" }}>Genie’s next move:</span> {move}</p>
      </div>
    </div>
  );
}
function moveFor(state) {
  return {
    achieved: "Won. Refresh it periodically and defend the position.",
    climbing: "Climbing. Keep internal links flowing and don’t touch what’s working.",
    stalled: "Stuck despite content. Building authority: a supporting cluster and getting listed on the pages Google already trusts.",
    indexing: "Published. Waiting for Google to index and place it, usually days to weeks.",
    working: "Early. Adding a supporting piece and internal links to build topical strength.",
    not_started: "Queued. Writing the answer page that targets this next.",
  }[state] || "Feeding it content and links.";
}

function AddKeyword({ host, onAdded, onCancel }) {
  const [val, setVal] = useState(""); const [busy, setBusy] = useState(false);
  async function add() {
    if (!val.trim()) return; setBusy(true);
    try { const j = await fetch("/api/keywords", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, keyword: val.trim() }) }).then((r) => r.json()); if (j.ok) { setVal(""); onAdded?.(j); } } catch {}
    setBusy(false);
  }
  return (
    <div className="flex items-center gap-2 flex-1" style={{ minWidth: 260 }}>
      <input value={val} autoFocus onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") onCancel?.(); }} placeholder="Enter a keyword you want Genie to track…" className="flex-1 px-3 py-2 rounded-lg text-[13px] mg-focus" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" }} />
      <button onClick={add} disabled={busy || !val.trim()} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 12.5 }}>{busy ? "Adding…" : "Add"}</button>
      <button onClick={onCancel} className="mg-btn mg-btn--quiet" style={{ fontSize: 12.5 }}>Cancel</button>
    </div>
  );
}

// ── STRATEGY PHASE ──────────────────────────────────────────────────────────
function StrategyPhase({ active, inTop20 }) {
  const climbing = active.filter((k) => ["climbing", "achieved"].includes(k._status?.state)).length;
  const covered = active.filter((k) => (k.coverage || 0) > 0 || k._status?.state !== "not_started").length;
  const pct = Math.max(8, Math.min(96, Math.round((100 * (covered * 0.5 + climbing * 0.3 + inTop20 * 0.2)) / Math.max(1, active.length))));
  const phases = [
    { key: "Foundation", sub: "Complete", done: true },
    { key: "Build", sub: "Weeks 5–12", current: true },
    { key: "Dominate", sub: "Month 3+" },
  ];
  const estDays = active.map((k) => k._status?.target?.days || 30).sort((a, b) => a - b)[0] || 12;
  return (
    <Card className="p-6 mg-rise">
      <p className="mg-klabel">STRATEGY PHASE</p>
      <div className="mt-4 relative">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
          <div className="h-full rounded-full dawn-fill" style={{ width: `${pct}%`, transition: "width .8s var(--ease-out)" }} />
        </div>
        <span className="absolute -top-5 text-[12px] font-bold mg-num" style={{ left: `${pct}%`, transform: "translateX(-50%)", color: "var(--accent-ink)" }}>{pct}%</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {phases.map((ph, i) => (
          <div key={i} className="flex flex-col" style={{ alignItems: i === 0 ? "flex-start" : i === 1 ? "center" : "flex-end" }}>
            <p className="text-[13px] font-bold" style={{ color: ph.current ? "var(--accent-ink)" : ph.done ? "var(--fg)" : "var(--fg-subtle)" }}>{ph.key}{ph.current ? " (current)" : ""}</p>
            <p className="text-[11.5px] mg-subtle">{ph.sub}</p>
          </div>
        ))}
      </div>
      <div className="mg-seam my-4" />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[13px] mg-muted">You’re <span className="font-bold" style={{ color: "var(--accent-ink)" }}>{pct}%</span> through the Build phase.</p>
        <p className="text-[13px] mg-muted">Next milestone: First keyword in top 20 <span className="font-semibold" style={{ color: "var(--accent-ink)" }}>(est. {estDays} days)</span></p>
      </div>
    </Card>
  );
}

// ── RIGHT RAIL ──────────────────────────────────────────────────────────────
function PortfolioHealth({ score, climb, conns, approvals }) {
  const val = score == null ? 0 : Math.round(score);
  const climbing = climb && climb.delta > 0;
  const actions = [
    { label: "Connect Google Search Console", pts: 10, done: conns?.google?.connected === true, href: "/connections" },
    { label: `Approve ${approvals || ""} pending drafts`.replace("  ", " "), pts: 6, done: approvals === 0 && conns != null, href: "/approvals" },
    { label: "Connect blog", pts: 3, done: conns?.wordpress?.connected === true, href: "/connections" },
  ].filter((a) => !a.done);
  const primary = actions[0];
  return (
    <Card className="p-5 mg-rise">
      <div className="flex items-start justify-between">
        <p className="mg-klabel">PORTFOLIO HEALTH</p>
        {climbing && <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--signal-live-ink)" }} title={`Rankings up ${Math.abs(climb.delta)} spots this period`}><Tri dir="up" /> climbing</span>}
      </div>
      <div className="mt-3 flex justify-center"><HealthRing value={score == null ? null : val} /></div>
      {actions.length > 0 && (
        <>
          <div className="mg-seam my-4" />
          <p className="mg-klabel mb-2">IMPROVE YOUR SCORE</p>
          <div>
            {actions.map((a, i) => (
              <a key={i} href={a.href} className="mg-checkrow mg-focus">
                <span className="flex-1 text-[13px]" style={{ color: "var(--fg)" }}>{a.label}</span>
                <span className="text-[12px] font-bold mg-num" style={{ color: "var(--accent-ink)" }}>+{a.pts}</span>
                <Icon.chevronRight size={14} style={{ color: "var(--fg-subtle)" }} />
              </a>
            ))}
          </div>
          {primary && <a href={primary.href} className="mg-btn mg-btn--dawn w-full mt-3" style={{ fontSize: 13 }}>Take action →</a>}
        </>
      )}
    </Card>
  );
}
function HealthRing({ value, size = 156 }) {
  const stroke = 12, r = size / 2 - stroke - 6, c = 2 * Math.PI * r, cx = size / 2;
  const [off, setOff] = useState(c);
  useEffect(() => { const t = setTimeout(() => setOff(c - ((value ?? 0) / 100) * c), 120); return () => clearTimeout(t); }, [value, c]);
  const markers = [30, 50, 70, 90];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="url(#healthGrad)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.1s var(--ease-out)" }} />
        <defs><linearGradient id="healthGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="var(--mg-dawn-500)" /><stop offset="100%" stopColor="var(--mg-dawn-600)" /></linearGradient></defs>
      </svg>
      {markers.map((m) => { const ang = (m / 100) * 2 * Math.PI - Math.PI / 2; const rr = r + stroke / 2 + 8; const mx = cx + rr * Math.cos(ang), my = cx + rr * Math.sin(ang); return (<span key={m} className="absolute mg-num" style={{ left: mx, top: my, transform: "translate(-50%,-50%)", fontSize: 9, color: "var(--fg-subtle)" }}>{m}</span>); })}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mg-num" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, color: "var(--fg)" }}>{value == null ? "—" : value}</span>
        <span className="text-[12px] mg-subtle mg-num">/100</span>
      </div>
    </div>
  );
}

function NextMilestone({ active, inTop20 }) {
  const estDays = active.map((k) => k._status?.target?.days || 30).sort((a, b) => a - b)[0] || 12;
  const title = inTop20 > 0 ? "First page-one ranking" : "First top 20 ranking";
  return (
    <Card className="p-5 mg-rise">
      <p className="mg-klabel">NEXT MILESTONE</p>
      <p className="mt-3 text-[16px] font-bold" style={{ color: "var(--fg)" }}>{title}</p>
      <p className="mt-1.5 text-[13px] mg-muted">Est. <span className="font-bold" style={{ color: "var(--accent-ink)" }}>{estDays} days</span></p>
    </Card>
  );
}

// ── EMPTY / FIRST RUN ───────────────────────────────────────────────────────
function BuildStrategy({ host, busy, step, err, onBuild }) {
  return (
    <div className="mt-8">
      <Card className="mg-ambient p-10 lg:p-12 text-center mg-rise">
        <span className="mg-tile mx-auto" style={{ width: 48, height: 48, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.target size={22} /></span>
        <h2 className="mt-4 mg-display" style={{ fontSize: 22 }}>Let Genie build your keyword strategy</h2>
        <p className="mt-2 mg-lede" style={{ marginLeft: "auto", marginRight: "auto" }}>It reads your product and derives the exact searches to rank you for, from real Google data. Then it tracks every position here, night after night.</p>
        <button onClick={onBuild} disabled={!host || busy === "derive"} className="mg-btn mg-btn--dawn mt-5 inline-flex disabled:opacity-50" style={{ fontSize: 14, padding: ".8rem 1.3rem" }}>
          {busy === "derive" ? (step || "Genie is analyzing…") : host ? "Build my keyword strategy →" : "Run your first scan →"}
        </button>
        {busy === "derive" && <p className="mt-2 text-[12px] mg-subtle">This takes up to a minute. I’m using real Google data, not guessing.</p>}
        {err && <p className="mt-2 text-[12.5px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}
      </Card>
    </div>
  );
}

// ── SMALL PARTS ─────────────────────────────────────────────────────────────
function Tri({ dir }) {
  if (dir === "down") return <span style={{ fontSize: 9 }}>▼</span>;
  if (dir === "flat") return <span style={{ fontSize: 9 }}>—</span>;
  return <span style={{ fontSize: 9 }}>▲</span>;
}
function LabeledSelect({ label, value, opts, onChange }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <span className="mg-subtle">{label}:</span>
      <span className="relative inline-flex">
        <select value={value} onChange={(e) => onChange(RANGE_OPTS.some((o) => String(o.id) === e.target.value) ? Number(e.target.value) : e.target.value)} className="mg-filter appearance-none pr-7" style={{ cursor: "pointer" }}>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <Icon.chevronRight size={13} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: "var(--fg-subtle)", pointerEvents: "none" }} />
      </span>
    </label>
  );
}
function MiniSelect({ label, value, opts, onChange, prefix = "" }) {
  return (
    <span className="relative inline-flex">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="mg-filter appearance-none pr-7" style={{ cursor: "pointer" }}>
        {opts.map((o) => <option key={o.id} value={o.id}>{prefix}{o.label}</option>)}
      </select>
      <Icon.chevronRight size={13} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%) rotate(90deg)", color: "var(--fg-subtle)", pointerEvents: "none" }} />
    </span>
  );
}
