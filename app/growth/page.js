"use client";

// ── GROWTH — where Genie is growing you ──
// One surface for the whole growth engine: the OPPORTUNITIES Genie found and
// staged (one tap posts them), and the KEYWORD STRATEGY it derived and manages
// (winners rise, dead ones retire). Replaces the V1 /growth command center and
// absorbs Keywords + Campaigns + Growth Map into a single Operator surface.
// Reads /api/today (for the host), then /api/placements + /api/keywords.

import { useState, useEffect, Suspense } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Card, Pill, Provenance, SectionLabel } from "@/components/ui/v2/primitives";
import { fetchLive } from "@/lib/live";

const HEALTH = {
  strong:  { label: "Strong",  bar: "var(--signal-live)" },
  growing: { label: "Growing", bar: "var(--signal-info)" },
  new:     { label: "New",     bar: "var(--fg-subtle)"   },
  weak:    { label: "Weak",    bar: "var(--signal-warn)"  },
  retired: { label: "Retired", bar: "var(--border-strong)" },
};

const FALLBACK = {
  blocks: [
    { platform: "reddit", owned: false, count: 3, items: [
      { id: "d1", target_title: "What AR tools actually reduce returns for apparel?", keyword: "ar try before you buy", kind: "reply", meta: { reason: "High buyer intent — they're comparing tools right now." }, draft: "Returns on apparel are mostly a fit problem, so the tools that move the needle are the ones that nail sizing…" },
      { id: "d2", target_title: "Small Shopify stores — is AR worth it yet?", keyword: "ar shopping tools", kind: "reply", meta: { reason: "Budget-conscious buyer, good fit for your entry tier." }, draft: "For a small store the ROI question is really about return rate…" },
      { id: "d3", target_title: "Best way to show 3D products on a product page?", keyword: "3d product viewer", kind: "reply", meta: { reason: "Technical question you can answer credibly." }, draft: "A few options depending on your stack…" },
    ] },
    { platform: "quora", owned: false, count: 2, items: [
      { id: "d4", target_title: "How does augmented reality shopping work?", keyword: "augmented reality shopping", kind: "answer", meta: { reason: "2.1k views, evergreen — long-tail traffic." }, draft: "AR shopping lets a customer place a product in their real space before buying…" },
      { id: "d5", target_title: "Is AR the future of eCommerce?", keyword: "ar ecommerce trends", kind: "answer", meta: { reason: "Trend question — positions you as the expert." }, draft: "The short answer is yes, and the data is getting hard to ignore…" },
    ] },
    { platform: "wordpress", owned: true, count: 1, items: [
      { id: "d6", target_title: "10 AR trends reshaping eCommerce in 2026", keyword: "ar ecommerce trends", kind: "article", meta: { reason: "Ranks for a rising keyword, links to your trends page." }, draft: "Augmented reality has quietly crossed from novelty to expectation…" },
    ] },
  ],
  totalTaps: 5, totalAuto: 1,
  results: { total: 24, winning: 6, flat: 11, dud: 5, pending: 2, top: [
    { title: "How we cut AR returns by 34%", keyword: "ar try before you buy", url: "#", engagement: { upvotes: 128, comments: 22 } },
    { title: "AR sizing for apparel — a practical guide", keyword: "ar sizing", url: "#", engagement: { upvotes: 74, comments: 9 } },
  ] },
  keywords: {
    portfolioScore: 72,
    graded: [
      { id: "k1", keyword: "ar try before you buy", health: "strong", score: 88, competition: 34, traffic_potential: 72, coverage: 6, gsc_impressions: 1200, gsc_clicks: 84, gsc_position: 11, source: "gsc" },
      { id: "k2", keyword: "augmented reality shopping", health: "growing", score: 74, competition: 52, traffic_potential: 66, coverage: 4, gsc_impressions: 640, gsc_clicks: 31, gsc_position: 18 },
      { id: "k3", keyword: "ar shopping tools", health: "growing", score: 69, competition: 44, traffic_potential: 58, coverage: 3 },
      { id: "k4", keyword: "3d product viewer", health: "new", score: 51, competition: 38, traffic_potential: 47, coverage: 1 },
      { id: "k5", keyword: "virtual try on", health: "strong", score: 82, competition: 61, traffic_potential: 70, coverage: 5, gsc_impressions: 980, gsc_clicks: 47, gsc_position: 14 },
      { id: "k6", keyword: "ar ecommerce trends", health: "growing", score: 64, competition: 41, traffic_potential: 55, coverage: 2 },
      { id: "k7", keyword: "shopify ar app", health: "weak", score: 38, competition: 72, traffic_potential: 40, coverage: 1 },
      { id: "k8", keyword: "product visualization software", health: "retired", score: 12, competition: 80, traffic_potential: 20, coverage: 0 },
    ],
  },
};

export default function GrowthPage() {
  return <Suspense fallback={null}><Growth /></Suspense>;
}

function Growth() {
  const [d, setD] = useState(FALLBACK);
  const [live, setLive] = useState(false);
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState("");

  async function loadFor(h) {
    const [p, k] = await Promise.all([
      fetch(`/api/placements?host=${encodeURIComponent(h)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/keywords?host=${encodeURIComponent(h)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);
    setD({
      blocks: p?.ok ? (p.blocks || []) : [],
      totalTaps: p?.ok ? (p.totalTaps || 0) : 0,
      totalAuto: p?.ok ? (p.totalAuto || 0) : 0,
      results: p?.ok ? (p.results || null) : null,
      keywords: k?.ok ? { portfolioScore: k.portfolioScore, graded: k.graded || [], counts: k.counts } : { graded: [] },
    });
    setLive(true);
  }

  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/today");
      const h = live && data?.entity?.host;
      if (!h) return; // public preview → keep the representative sample
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

  return (
    <OperatorShell active="growth">
      <div className="mg-rise flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-medium mg-muted">
            <Icon.growth size={15} /> Growth {live ? <Provenance kind="verified">Your engine</Provenance> : <Provenance kind="sample" />}
          </p>
          <h1 className="mt-2 text-[32px] leading-[1.08] font-extrabold tracking-tight" style={{ color: "var(--fg)" }}>
            Where Genie is <span className="dawn-text">growing you.</span>
          </h1>
          <p className="mt-2.5 text-[15px] mg-muted max-w-xl">The openings it found and staged for you, and the keyword strategy it derived and manages on its own. This is the engine — you just steer.</p>
        </div>
      </div>

      {/* ── OPPORTUNITIES ── */}
      <div className="mt-6 flex items-center gap-2">
        <SectionLabel>Opportunities</SectionLabel>
        {taps > 0 && <Pill tone="dawn">{taps} ready</Pill>}
      </div>

      {d.blocks && d.blocks.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {d.blocks.map((b) => <OpportunityBlock key={b.platform} block={b} onAct={act} />)}
        </div>
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
          <button onClick={derive} disabled={!live || busy === "derive"} className="mg-btn mg-btn--dawn mt-4 inline-flex disabled:opacity-50" style={{ fontSize: 13 }}>
            {busy === "derive" ? "Genie is analyzing…" : live ? "Build my keyword strategy →" : "Sign in to build strategy"}
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

          {host && <AddKeyword host={host} onAdded={(j) => setD((prev) => ({ ...prev, keywords: { portfolioScore: j.portfolioScore, graded: j.graded || prev.keywords.graded, counts: j.counts } }))} />}

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {active.map((k) => <KeywordRow key={k.id || k.keyword} k={k} />)}
          </div>

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

function OpportunityBlock({ block, onAct }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-center gap-3">
        <BrandIcon brand={block.platform === "guest" ? "wordpress" : block.platform} size={18} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold capitalize" style={{ color: "var(--fg)" }}>{block.platform}</p>
          <p className="text-[11.5px] mg-muted">{block.owned ? "Genie publishes automatically" : `${block.count} tap${block.count > 1 ? "s" : ""} — you post from your account`}</p>
        </div>
        <span className="text-[17px] font-bold mg-num" style={{ color: "var(--accent-ink)" }}>{block.count}</span>
      </div>
      <div className="px-3 pb-3">
        {block.items.map((item) => <PlacementItem key={item.id} item={item} owned={block.owned} onAct={onAct} />)}
      </div>
    </Card>
  );
}

function PlacementItem({ item, owned, onAct }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function tapPost() {
    try { await navigator.clipboard.writeText(item.draft || ""); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
    if (item.target_url) window.open(item.target_url, "_blank");
    onAct(item, "posted");
  }

  return (
    <div className="mg-surface-quiet p-3 mt-2 first:mt-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{item.target_title || item.target_url}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {item.keyword && <Pill tone="dawn">{item.keyword}</Pill>}
            <span className="text-[10.5px] mg-subtle capitalize">{String(item.kind || "reply").replace("_", " ")}</span>
          </div>
        </div>
        {item.draft && <button onClick={() => setOpen((v) => !v)} className="text-[11.5px] font-medium shrink-0 mg-focus" style={{ color: "var(--accent-ink)" }}>{open ? "Hide" : "Preview"}</button>}
      </div>

      {open && item.draft && (
        <div className="mt-2 text-[12.5px] whitespace-pre-wrap max-h-52 overflow-y-auto p-3 rounded-lg" style={{ background: "var(--surface-sunken)", color: "var(--fg-muted)" }}>{item.draft}</div>
      )}
      {item.meta?.reason && <p className="mt-1.5 text-[11px] mg-subtle italic">{item.meta.reason}</p>}

      <div className="mt-2.5 flex items-center gap-2">
        {owned ? (
          <button onClick={() => onAct(item, "posted")} className="mg-btn mg-btn--dawn" style={{ fontSize: 11.5, padding: ".4rem .7rem" }}>Approve & publish</button>
        ) : (
          <button onClick={tapPost} className="mg-btn mg-btn--dawn" style={{ fontSize: 11.5, padding: ".4rem .7rem" }}>{copied ? "Copied — paste & post" : "Copy & open thread"}</button>
        )}
        <button onClick={() => onAct(item, "snoozed")} className="text-[11.5px] mg-subtle mg-focus px-1">Later</button>
        <button onClick={() => onAct(item, "skipped")} className="text-[11.5px] mg-subtle mg-focus px-1">Skip</button>
      </div>
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
      <p className="text-[26px] font-bold leading-none mg-num" style={{ color: accent ? "var(--accent-ink)" : "var(--fg)" }}>{value}</p>
      <p className="mt-1.5 text-[12px] mg-muted">{label}</p>
    </Card>
  );
}

function KeywordRow({ k }) {
  const m = HEALTH[k.health] || HEALTH.new;
  const comp = k.competition ?? 50;
  const diff = comp < 40 ? { label: "Easy", tone: "live" } : comp < 65 ? { label: "Medium", tone: "warn" } : { label: "Hard", tone: "danger" };
  const pot = k.traffic_potential ?? 0;
  const traffic = pot >= 60 ? "High traffic" : pot >= 40 ? "Medium traffic" : "Low traffic";
  const real = (k.gsc_impressions || 0) > 0;
  return (
    <div className="mg-surface-quiet p-3.5">
      <div className="flex items-center gap-2">
        <p className="text-[13.5px] font-semibold flex-1 truncate" style={{ color: "var(--fg)" }}>{k.keyword}</p>
        <span className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: diffColor(diff.tone), background: diffBg(diff.tone) }}>{diff.label}</span>
        <span className="text-[13.5px] font-bold mg-num" style={{ color: "var(--fg)" }}>{k.score}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, k.score)}%`, background: m.bar, transition: "width .8s var(--ease-out)" }} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] mg-subtle flex-wrap">
        <span className="font-medium" style={{ color: "var(--fg-muted)" }}>{traffic}</span>
        <span>·</span>
        <span>Coverage {k.coverage || 0}×</span>
        {real && <span style={{ color: "var(--signal-live-ink)" }}>· ↑ {k.gsc_clicks || 0} real clicks · rank {k.gsc_position ? Math.round(k.gsc_position) : "—"}</span>}
        {!real && k.source === "gsc" && <span style={{ color: "var(--signal-live-ink)" }}>· real Google keyword</span>}
      </div>
    </div>
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
