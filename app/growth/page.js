"use client";

// ── GROWTH — where Genie is growing you ──
// One surface for the whole growth engine: the OPPORTUNITIES Genie found and
// staged (one tap posts them), and the KEYWORD STRATEGY it derived and manages
// (winners rise, dead ones retire). Replaces the V1 /growth command center and
// absorbs Keywords + Campaigns + Growth Map into a single Operator surface.
// Reads /api/today (for the host), then /api/placements + /api/keywords.

import { useState, useEffect, Suspense } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Card, Pill, SectionLabel } from "@/components/ui/v2/primitives";
import { DataStateBadge } from "@/components/ui/v2/DataState";
import { fetchLive } from "@/lib/live";

const HEALTH = {
  strong:  { label: "Strong",  bar: "var(--signal-live)" },
  growing: { label: "Growing", bar: "var(--signal-info)" },
  new:     { label: "New",     bar: "var(--fg-subtle)"   },
  weak:    { label: "Weak",    bar: "var(--signal-warn)"  },
  retired: { label: "Retired", bar: "var(--border-strong)" },
};

export default function GrowthPage() {
  return <Suspense fallback={null}><Growth /></Suspense>;
}

function Growth() {
  const [d, setD] = useState({ blocks: [], totalTaps: 0, totalAuto: 0, results: null, keywords: { graded: [] } });
  const [state, setState] = useState("loading");
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState("");

  async function loadFor(h) {
    const [p, k] = await Promise.all([
      fetch(`/api/placements?host=${encodeURIComponent(h)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/keywords?host=${encodeURIComponent(h)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);
    const next = {
      blocks: p?.ok ? (p.blocks || []) : [],
      totalTaps: p?.ok ? (p.totalTaps || 0) : 0,
      totalAuto: p?.ok ? (p.totalAuto || 0) : 0,
      results: p?.ok ? (p.results || null) : null,
      keywords: k?.ok ? { portfolioScore: k.portfolioScore, graded: k.graded || [], counts: k.counts } : { graded: [] },
    };
    setD(next);
    setState(next.blocks.length || next.keywords.graded.length ? "real" : "empty");
  }

  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/today");
      const h = live && data?.entity?.host;
      if (!h) { setState(live ? "empty" : "disconnected"); return; }
      setHost(h);
      await loadFor(h);
    })();
  }, []);

  async function act(item, action) {
    setD((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => ({ ...b, items: b.items.filter((x) => x.id !== item.id) })).filter((b) => b.items.length),
      totalTaps: (action === "posted" || action === "skipped") ? Math.max(0, prev.totalTaps - (item.owned ? 0 : 1)) : prev.totalTaps,
    }));
    try { await fetch("/api/placements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action }) }); } catch {}
  }

  async function derive() {
    if (!host) return;
    setBusy("derive");
    try {
      const r = await fetch("/api/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }) }).then((x) => x.json());
      if (r.ok) setD((prev) => ({ ...prev, keywords: { portfolioScore: r.portfolioScore, graded: r.graded || [], counts: r.counts } }));
    } catch {}
    setBusy("");
  }

  const kw = d.keywords || { graded: [] };
  const graded = kw.graded || [];
  const active = graded.filter((k) => k.health !== "retired");
  const retired = graded.filter((k) => k.health === "retired");
  const taps = d.totalTaps || 0;
  const allTaps = (d.blocks || []).flatMap((b) => (b.items || []).map((it) => ({ ...it, platform: b.platform, owned: b.owned })));
  const heroTap = allTaps[0] || null;
  const restTaps = allTaps.slice(1);
  const activeShown = active.slice(0, 8);

  return (
    <OperatorShell active="growth">
      <OperatorHeader
        icon={Icon.growth}
        label="Growth"
        provenance={<DataStateBadge state={state} />}
        title="Where Genie is"
        accent="growing you."
      />

      {/* ── OPPORTUNITIES — one to act on now, the rest in a quiet queue ── */}
      <div className="mt-7 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionLabel>Opportunities</SectionLabel>
          {taps > 0 && <Pill tone="dawn">{taps} ready</Pill>}
        </div>
        {restTaps.length > 0 && <a href="/conversations" className="text-[12.5px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>See running →</a>}
      </div>

      {heroTap ? (
        <>
          <HeroTap item={heroTap} onAct={act} />
          {restTaps.length > 0 && (
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {restTaps.map((it) => <CompactTap key={it.id} item={it} onAct={act} />)}
            </div>
          )}
        </>
      ) : (
        <Card className="mt-3 p-8 text-center">
          <span className="mg-tile mx-auto" style={{ width: 42, height: 42, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.spark size={19} /></span>
          <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--fg)" }}>No openings staged right now</p>
          <p className="mt-1 text-[13px] mg-muted max-w-md mx-auto">Genie scans continuously and stages new conversations overnight. Check back tomorrow morning, or see what's already running.</p>
          <a href="/conversations" className="mg-btn mg-btn--quiet mt-4 inline-flex" style={{ fontSize: 12.5 }}>See running conversations →</a>
        </Card>
      )}

      {d.results && d.results.total > 0 && <ResultsStrip results={d.results} />}

      {/* ── KEYWORD STRATEGY ── */}
      <div className="mt-8 flex items-center justify-between flex-wrap gap-2">
        <SectionLabel>Keyword strategy</SectionLabel>
        {graded.length > 0 && <span className="text-[12px] mg-subtle">Genie derived and manages these — winners rise, dead ones retire.</span>}
      </div>

      {graded.length === 0 ? (
        <Card className="mt-3 p-9 text-center" style={{ borderColor: "var(--accent)", boxShadow: "var(--shadow-dawn)" }}>
          <span className="mg-tile mx-auto" style={{ width: 44, height: 44, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.target size={20} /></span>
          <p className="mt-3 text-[16px] font-bold" style={{ color: "var(--fg)" }}>Let Genie build your keyword strategy</p>
          <p className="mt-1 text-[13.5px] mg-muted max-w-md mx-auto">It reads your product and derives the exact searches to rank you for — no input needed. Then it weaves them through everything it writes.</p>
          <button onClick={derive} disabled={!host || busy === "derive"} className="mg-btn mg-btn--dawn mt-4 inline-flex disabled:opacity-50" style={{ fontSize: 13 }}>
            {busy === "derive" ? "Genie is analyzing…" : host ? "Build my keyword strategy →" : "Run your first scan →"}
          </button>
        </Card>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <KeywordStat value={active.length} label="Keywords tracked" />
            <KeywordStat value={kw.portfolioScore ?? "—"} label="Portfolio health" accent />
            <KeywordStat value={active.filter((k) => (k.competition ?? 50) < 40).length} label="Easy wins" accent />
            <KeywordStat value={active.filter((k) => (k.gsc_impressions || 0) > 0).length} label="Bringing real traffic" accent />
          </div>

          <p className="mt-3 text-[12px] mg-subtle">Traffic and difficulty are Genie’s estimates, chosen for a mix of demand, winnability, and buyer value. <a href="/connections" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>Connect Google</a> for your real search volumes and rankings.</p>

          {host && <AddKeyword host={host} onAdded={(j) => setD((prev) => ({ ...prev, keywords: { portfolioScore: j.portfolioScore, graded: j.graded || prev.keywords.graded, counts: j.counts } }))} />}

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {activeShown.map((k) => <KeywordRow key={k.id || k.keyword} k={k} />)}
          </div>
          {active.length > activeShown.length && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12.5px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>Show all {active.length} keywords</summary>
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                {active.slice(8).map((k) => <KeywordRow key={k.id || k.keyword} k={k} />)}
              </div>
            </details>
          )}

          {retired.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-[12.5px] mg-subtle mg-focus">Retired keywords ({retired.length}) — Genie stopped using these</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {retired.map((k) => <span key={k.id || k.keyword} className="text-[11.5px] mg-subtle line-through mg-surface-quiet px-2 py-0.5 rounded-full">{k.keyword}</span>)}
              </div>
            </details>
          )}
        </>
      )}
    </OperatorShell>
  );
}

const brandOf = (p) => (p === "guest" ? "wordpress" : p);

// The one opportunity worth acting on now — featured, with Genie's reasoning.
function HeroTap({ item, onAct }) {
  const [copied, setCopied] = useState(false);
  function primary() {
    if (item.owned) { onAct(item, "posted"); return; }
    try { navigator.clipboard.writeText(item.draft || ""); } catch {}
    setCopied(true); setTimeout(() => setCopied(false), 2500);
    if (item.target_url) window.open(item.target_url, "_blank");
    onAct(item, "posted");
  }
  return (
    <Card className="mg-ambient mt-3 p-6">
      <div className="flex items-center gap-2 flex-wrap">
        <BrandIcon brand={brandOf(item.platform)} size={17} />
        <span className="text-[12.5px] font-semibold capitalize" style={{ color: "var(--fg-muted)" }}>{item.platform}</span>
        <Pill tone="dawn">Start here</Pill>
        {item.keyword && <span className="text-[12px]" style={{ color: "var(--accent-ink)" }}>{item.keyword}</span>}
      </div>
      <h3 className="mt-3 text-[19px] font-bold leading-snug" style={{ color: "var(--fg)" }}>{item.target_title || item.target_url}</h3>
      {item.meta?.reason && <p className="mt-1.5 text-[13.5px] mg-muted max-w-2xl">{item.meta.reason}</p>}
      {item.draft && (
        <div className="mt-3.5 mg-surface-quiet p-3.5 text-[13px] whitespace-pre-wrap max-h-36 overflow-y-auto thin-scroll" style={{ color: "var(--fg-muted)" }}>{item.draft}</div>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button onClick={primary} className="mg-btn mg-btn--dawn" style={{ fontSize: 13 }}>
          {item.owned ? "Approve & publish" : copied ? "Copied — paste & post" : "Copy & open thread"}
        </button>
        <button onClick={() => onAct(item, "snoozed")} className="text-[12.5px] mg-subtle mg-focus px-2">Later</button>
        <button onClick={() => onAct(item, "skipped")} className="text-[12.5px] mg-subtle mg-focus px-2">Skip</button>
      </div>
    </Card>
  );
}

// Everything else — a tight, scannable queue, not a wall of equal cards.
function CompactTap({ item, onAct }) {
  function primary() {
    if (item.owned) { onAct(item, "posted"); return; }
    try { navigator.clipboard.writeText(item.draft || ""); } catch {}
    if (item.target_url) window.open(item.target_url, "_blank");
    onAct(item, "posted");
  }
  return (
    <div className="mg-surface-quiet p-3.5 flex items-center gap-3">
      <BrandIcon brand={brandOf(item.platform)} size={16} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{item.target_title || item.target_url}</p>
        <p className="text-[11px] mg-subtle truncate mt-0.5">{item.keyword ? `${item.keyword} · ` : ""}{item.meta?.reason || item.platform}</p>
      </div>
      <button onClick={primary} className="mg-btn mg-btn--quiet shrink-0" style={{ fontSize: 11.5, padding: ".4rem .7rem" }}>{item.owned ? "Publish" : "Copy"}</button>
    </div>
  );
}

function ResultsStrip({ results }) {
  const { total, winning, flat, dud, pending, top } = results;
  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>What Genie posted — results</h3>
          <p className="text-[12.5px] mg-muted">It tracks every post, doubles down on winners, bins the duds.</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 md:grid-cols-5 gap-3">
        <MiniStat value={total} label="Posted" />
        <MiniStat value={winning} label="Winning" tint="var(--signal-live-ink)" />
        <MiniStat value={flat} label="Flat" />
        <MiniStat value={dud} label="Binned" tint="var(--signal-warn)" />
        <MiniStat value={pending} label="Fresh" tint="var(--accent-ink)" />
      </div>
      {top?.length > 0 && (
        <div className="mt-4">
          <SectionLabel className="mb-2">Top performers</SectionLabel>
          <div className="space-y-2">
            {top.map((t, i) => (
              <a key={i} href={t.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 mg-surface-quiet px-3 py-2.5 mg-focus">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{t.title}</p>
                  {t.keyword && <p className="text-[11px]" style={{ color: "var(--accent-ink)" }}>{t.keyword}</p>}
                </div>
                {t.engagement && (
                  <div className="text-right text-[11px] mg-subtle mg-num shrink-0">
                    {t.engagement.upvotes != null && <span style={{ color: "var(--signal-live-ink)" }}>▲ {t.engagement.upvotes}</span>}
                    {t.engagement.comments != null && <span className="ml-2">{t.engagement.comments} replies</span>}
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function MiniStat({ value, label, tint }) {
  return (
    <div className="mg-surface-quiet p-3 text-center">
      <p className="text-[22px] font-bold leading-none mg-num" style={{ color: tint || "var(--fg)" }}>{value}</p>
      <p className="mt-1 text-[11px] mg-subtle">{label}</p>
    </div>
  );
}

function KeywordStat({ value, label, accent }) {
  return (
    <Card className="p-4">
      <p className="mg-stat-num" style={accent ? { color: "var(--accent-ink)" } : undefined}>{value}</p>
      <p className="mg-stat-label">{label}</p>
    </Card>
  );
}

function KeywordRow({ k }) {
  const m = HEALTH[k.health] || HEALTH.new;
  const comp = k.competition ?? 50;
  const diff = comp < 40 ? { label: "Easy", tone: "live" } : comp < 65 ? { label: "Medium", tone: "warn" } : { label: "Hard", tone: "danger" };
  const pot = k.traffic_potential ?? 0;
  const trafficEst = pot >= 60 ? "High traffic" : pot >= 40 ? "Medium traffic" : "Low traffic";
  const hasVol = Number(k.volume) > 0;
  const hist = Array.isArray(k.volume_history) ? k.volume_history : [];
  const real = (k.gsc_impressions || 0) > 0;
  return (
    <div className="mg-surface-quiet p-3.5">
      <div className="flex items-center gap-2">
        <p className="text-[13.5px] font-semibold flex-1 truncate" style={{ color: "var(--fg)" }}>{k.keyword}</p>
        {hasVol && hist.length > 1 && <VolSpark points={hist} />}
        <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: diffColor(diff.tone), background: diffBg(diff.tone) }}>{diff.label}</span>
        <span className="text-[13.5px] font-bold mg-num" style={{ color: "var(--fg)" }}>{k.score}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, k.score)}%`, background: m.bar, transition: "width .8s var(--ease-out)" }} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] mg-subtle flex-wrap">
        {hasVol ? (
          <span className="font-semibold mg-num" style={{ color: "var(--fg-muted)" }}>~{Number(k.volume).toLocaleString()}/mo <span className="mg-subtle" style={{ fontWeight: 400 }}>· Google</span></span>
        ) : (
          <span className="font-medium" style={{ color: "var(--fg-muted)" }}>{trafficEst} <span style={{ opacity: .6 }}>· est.</span></span>
        )}
        <span>·</span>
        <span>Coverage {k.coverage || 0}×</span>
        {real && <span style={{ color: "var(--signal-live-ink)" }}>· ↑ {k.gsc_clicks || 0} real clicks · rank {k.gsc_position ? Math.round(k.gsc_position) : "—"}</span>}
      </div>
    </div>
  );
}

// 12-month search-volume sparkline (real Google data).
function VolSpark({ points }) {
  const vals = points.map((p) => Number(p.v) || 0);
  if (vals.length < 2) return null;
  const w = 54, h = 16, max = Math.max(...vals, 1), step = w / (vals.length - 1);
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(" ");
  const rising = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={rising ? "var(--signal-live)" : "var(--fg-subtle)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AddKeyword({ host, onAdded }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!val.trim()) return;
    setBusy(true);
    try {
      const j = await fetch("/api/keywords", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, keyword: val.trim() }) }).then((r) => r.json());
      if (j.ok) { setVal(""); onAdded?.(j); }
    } catch {}
    setBusy(false);
  }
  return (
    <div className="mt-4 flex items-center gap-2">
      <input
        value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="Add your own keyword — Genie weaves it into the rotation"
        className="flex-1 px-3 py-2 rounded-lg text-[13px] mg-focus"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" }}
      />
      <button onClick={add} disabled={busy || !val.trim()} className="mg-btn mg-btn--quiet disabled:opacity-50" style={{ fontSize: 12.5 }}>
        {busy ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

function diffColor(tone) {
  return tone === "live" ? "var(--signal-live-ink)" : tone === "warn" ? "var(--signal-warn)" : "var(--signal-danger)";
}
function diffBg(tone) {
  return tone === "live" ? "var(--signal-live-soft)" : tone === "warn" ? "var(--signal-warn-soft)" : "var(--signal-danger-soft)";
}
