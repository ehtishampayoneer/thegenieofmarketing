"use client";

// ── MARKET EXPANSION ── a visual scoreboard of countries this business can genuinely serve
// where demand is real and competition is thin: flag, difficulty, projected traffic + sales,
// time-to-cover, and a progress bar each. Honest by design — Search Console numbers are
// "Verified", the rest are "Estimated" projections, and local-only businesses are gated.

import { useEffect, useMemo, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";

const DIFF = {
  Easy: { c: "var(--signal-live-ink)", bg: "var(--signal-live-soft)" },
  Medium: { c: "var(--signal-warn)", bg: "var(--signal-warn-soft)" },
  Hard: { c: "var(--signal-danger)", bg: "var(--signal-danger-soft)" },
};
const CONF = {
  verified: { c: "var(--signal-live-ink)", label: "Verified" },
  estimated: { c: "var(--accent-ink)", label: "Estimated" },
  insufficient: { c: "var(--fg-subtle)", label: "No data" },
};
const BUCKETS = [
  { id: "all", label: "All markets" },
  { id: "emerging", label: "Already emerging" },
  { id: "ready", label: "Ready to test" },
];
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n));

export default function MarketsPage() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [tab, setTab] = useState("all");
  const [reach, setReach] = useState("global");
  const [openId, setOpenId] = useState(null);

  async function load(r = reach) {
    setState("loading");
    try {
      const j = await fetch(`/api/markets?reach=${encodeURIComponent(r)}&langs=en`, { cache: "no-store" }).then((x) => x.json());
      if (!j.ok) { setState(j.reason === "not_authenticated" ? "auth" : "error"); return; }
      setData(j); setState("done");
    } catch { setState("error"); }
  }
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const elig = data.rows.filter((r) => r.eligible);
    return tab === "all" ? elig : elig.filter((r) => r.bucket === tab);
  }, [data, tab]);
  const emergingCount = (data?.rows || []).filter((r) => r.bucket === "emerging").length;

  return (
    <OperatorShell active="markets">
      <OperatorHeader icon={Icon.globe} label="Market Expansion" title="Your next" accent="markets."
        kicker="Countries you can actually serve where demand is real and competition is thin — ranked, with projected traffic, sales and how long each takes to win." />

      {/* honesty + reach control */}
      <Card className="p-4 mt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-[12.5px] flex items-start gap-2" style={{ color: "var(--fg-muted)", maxWidth: "62ch" }}>
          <Icon.info size={14} style={{ color: "var(--accent-ink)", marginTop: 2, flexShrink: 0 }} />
          <span><b style={{ color: "var(--fg)" }}>Verified</b> numbers come from your Search Console; the rest are <b style={{ color: "var(--fg)" }}>estimates</b> from market data — direction, not promises.{!data?.hasGsc && " Connect Search Console to verify the countries you already reach."}</span>
        </p>
        <label className="flex items-center gap-2 shrink-0 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
          I can serve
          <select value={reach} onChange={(e) => { setReach(e.target.value); load(e.target.value); }} className="mg-filter" style={{ cursor: "pointer" }}>
            <option value="global">customers anywhere</option>
            <option value="regions">select regions</option>
            <option value="local">only my area</option>
          </select>
        </label>
      </Card>

      {state === "loading" && <div className="mt-5 mg-surface p-10 text-center text-[13px] mg-subtle">Finding your best markets…</div>}
      {state === "auth" && <div className="mt-5 mg-surface p-10 text-center text-[13px] mg-subtle">Sign in to see your market expansion opportunities.</div>}
      {state === "error" && <div className="mt-5 mg-surface p-10 text-center text-[13px] mg-subtle">Couldn't load markets just now. Try again in a moment.</div>}

      {state === "done" && data?.localOnly && (
        <Card className="mt-5 p-6 flex items-start gap-3">
          <span className="mg-tile shrink-0" style={{ width: 40, height: 40, background: "var(--signal-warn-soft)", color: "var(--signal-warn)" }}><Icon.globe size={19} /></span>
          <div>
            <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Your business looks local-only</p>
            <p className="text-[13px] mt-1" style={{ color: "var(--fg-muted)", maxWidth: "60ch" }}>Expanding into other countries only pays off if you can actually serve them. If you can sell remotely or ship, switch “I can serve” to <b>customers anywhere</b> above and Genie will find your best markets.</p>
          </div>
        </Card>
      )}

      {state === "done" && !data?.localOnly && (
        <div className="mt-5">
          {/* bucket tabs */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {BUCKETS.map((b) => (
              <button key={b.id} onClick={() => setTab(b.id)} className="mg-focus" style={{ fontSize: 12.5, fontWeight: 600, padding: ".4rem .8rem", borderRadius: 999, cursor: "pointer", border: `1px solid ${tab === b.id ? "var(--accent)" : "var(--hair)"}`, background: tab === b.id ? "var(--accent-quiet)" : "var(--surface)", color: tab === b.id ? "var(--accent-ink)" : "var(--fg-muted)" }}>
                {b.label}{b.id === "emerging" && emergingCount > 0 ? ` · ${emergingCount}` : ""}
              </button>
            ))}
          </div>

          {/* column header (desktop) */}
          <div className="hidden lg:grid px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ gridTemplateColumns: "2.4fr 1fr 1fr 1fr 1.4fr", gap: 16, color: "var(--fg-subtle)" }}>
            <span>Country</span><span>Difficulty</span><span className="text-right">Traffic / mo</span><span className="text-right">Sales / mo</span><span>Time · progress</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {rows.map((r) => <MarketRow key={r.code} r={r} open={openId === r.code} onToggle={() => setOpenId(openId === r.code ? null : r.code)} />)}
            {rows.length === 0 && <p className="text-[13px] mg-subtle text-center py-8">No markets in this view yet.</p>}
          </div>
        </div>
      )}
    </OperatorShell>
  );
}

function MarketRow({ r, open, onToggle }) {
  const d = DIFF[r.difficulty] || DIFF.Medium;
  const conf = CONF[r.confidence] || CONF.estimated;
  return (
    <Card className="p-0 overflow-hidden mg-lift">
      <button onClick={onToggle} className="w-full text-left mg-focus" style={{ background: "none", border: "none", cursor: "pointer" }}>
        <div className="grid items-center px-4 py-3.5 gap-3 lg:gap-4" style={{ gridTemplateColumns: "1fr", }}>
          <div className="lg:grid lg:items-center" style={{ gridTemplateColumns: "2.4fr 1fr 1fr 1fr 1.4fr", gap: 16 }}>
            {/* country */}
            <div className="flex items-center gap-3 min-w-0">
              <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>{r.flag}</span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-tight flex items-center gap-2" style={{ color: "var(--fg)" }}>
                  {r.name}
                  <span title={conf.label} style={{ width: 7, height: 7, borderRadius: 999, background: conf.c, flexShrink: 0 }} />
                </p>
                <p className="text-[12px] leading-tight mt-0.5 truncate" style={{ color: "var(--fg-subtle)" }}>{r.region}{r.why[0] ? ` · ${r.why[0]}` : ""}</p>
              </div>
            </div>
            {/* difficulty */}
            <div className="mt-2 lg:mt-0">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold" style={{ padding: ".3rem .6rem", borderRadius: 8, background: d.bg, color: d.c }}>{r.difficulty}</span>
            </div>
            {/* traffic */}
            <div className="hidden lg:flex flex-col items-end">
              <span className="mg-num text-[16px] font-bold" style={{ color: "var(--fg)" }}>{fmt(r.expTraffic)}</span>
              <span className="text-[10.5px]" style={{ color: "var(--fg-subtle)" }}>visitors</span>
            </div>
            {/* sales */}
            <div className="hidden lg:flex flex-col items-end">
              <span className="mg-num text-[16px] font-bold" style={{ color: "var(--accent-ink)" }}>{fmt(r.expSales)}</span>
              <span className="text-[10.5px]" style={{ color: "var(--fg-subtle)" }}>sales</span>
            </div>
            {/* time + progress */}
            <div className="mt-2.5 lg:mt-0">
              <div className="flex items-center justify-between text-[11.5px] mb-1">
                <span className="mg-num" style={{ color: "var(--fg-muted)" }}>~{r.days} days</span>
                <span className="mg-num" style={{ color: r.progress > 0 ? "var(--signal-live-ink)" : "var(--fg-subtle)" }}>{r.progress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(3, r.progress)}%`, background: "linear-gradient(90deg, var(--accent), var(--signal-live))", transition: "width .6s" }} />
              </div>
            </div>
          </div>
          {/* mobile stat strip */}
          <div className="lg:hidden flex items-center gap-4 mt-1">
            <MiniStat icon={Icon.growth} v={fmt(r.expTraffic)} l="visitors/mo" />
            <MiniStat icon={Icon.coins} v={fmt(r.expSales)} l="sales/mo" accent />
          </div>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1" style={{ borderTop: "1px solid var(--hair)" }}>
          <div className="flex flex-wrap gap-2 mt-3">
            {r.why.map((w, i) => <span key={i} className="text-[11.5px] font-medium" style={{ padding: ".3rem .6rem", borderRadius: 8, background: "var(--surface-2)", color: "var(--fg-muted)" }}>{w}</span>)}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fact l="Opportunity" v={`${r.opp}/100`} />
            <Fact l="Competition gap" v={`${r.gap}/100`} />
            <Fact l="Business fit" v={`${r.fit}/100`} />
            <Fact l="Confidence" v={CONF[r.confidence].label} />
          </div>
          <p className="text-[13px] mt-4 leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            <b style={{ color: "var(--fg)" }}>The 30-day play:</b> one localized landing page for {r.name}, 3–5 genuinely useful local content pieces{r.lang !== "en" ? ` in ${r.lang.toUpperCase()}` : ""}, a clear local CTA + payment/delivery, and one conversion goal. Validate leads and replies first; organic ranking compounds over 60–90 days.
          </p>
          <a href="/sprint" className="mg-btn mg-btn--dawn mt-3 inline-flex" style={{ fontSize: 13.5 }}>Run this as a 30-day experiment →</a>
        </div>
      )}
    </Card>
  );
}

function MiniStat({ icon: I, v, l, accent }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <I size={14} style={{ color: accent ? "var(--accent-ink)" : "var(--fg-subtle)" }} />
      <span className="mg-num text-[13.5px] font-bold" style={{ color: accent ? "var(--accent-ink)" : "var(--fg)" }}>{v}</span>
      <span className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>{l}</span>
    </span>
  );
}
function Fact({ l, v }) {
  return (<div><p className="text-[11px] mg-subtle">{l}</p><p className="text-[13.5px] font-bold mg-num" style={{ color: "var(--fg)" }}>{v}</p></div>);
}
