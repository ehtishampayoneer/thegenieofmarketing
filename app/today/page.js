"use client";

// ── TODAY — the morning reveal (live) ──
// "While you slept, Genie got to work." Reads the /api/today aggregation (real
// data when signed in) and falls back to representative data for the public
// preview. Opens with the entity-confirmation moment when Genie has only inferred
// what you are.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Card, Pill } from "@/components/ui/v2/primitives";
import { EntityConfirm } from "@/components/ui/v2/EntityConfirm";
import { fetchLive, mergeLive } from "@/lib/live";

const ICONS = { write: Icon.write, conversations: Icon.conversations, mail: Icon.mail, reply: Icon.reply, growth: Icon.growth, target: Icon.target, link: Icon.link, spark: Icon.spark, check: Icon.check };
const ic = (k) => ICONS[k] || Icon.spark;

const FALLBACK = {
  greetingName: "Asim",
  summaryLine: "Here’s everything I handled while you were away — 7 things need your eyes.",
  stats: [
    { iconKey: "write", tint: "emerald", n: "6", label: "Articles published", delta: "+32% vs yesterday" },
    { iconKey: "conversations", tint: "blue", n: "14", label: "Conversations found", delta: "+47% vs yesterday" },
    { iconKey: "mail", tint: "dawn", n: "25", label: "Emails sent", delta: "+15% vs yesterday" },
    { iconKey: "reply", tint: "emerald", n: "3", label: "Replies received", delta: "+200% vs yesterday" },
    { iconKey: "growth", tint: "dawn", n: "18", label: "Rankings improved", delta: "+9 positions avg" },
  ],
  approvals: [
    { brand: "reddit", title: "Reddit Post in r/Entrepreneur", desc: "How we increased AR product conversions by 250%…", impact: 92, tags: [{ label: "High potential", tone: "dawn" }, { label: "Buyer intent", tone: "info" }] },
    { brand: "blog", title: "Blog: 10 AR trends changing eCommerce in 2025", desc: "Complete article drafted and ready to publish", impact: 88, tags: [{ label: "High value", tone: "dawn" }] },
    { brand: "linkedin", title: "LinkedIn Post", desc: "Just published: Why AR try-before-you-buy is the future…", impact: 74, tags: [{ label: "Engagement", tone: "info" }] },
  ],
  approvalsCount: 7,
  wins: [
    { iconKey: "target", tint: "emerald", title: "Keyword “ar try before you buy”", sub: "Ranked up from #18 to #11", metric: "▲ 7", metricLabel: "positions", spark: true },
    { iconKey: "growth", tint: "emerald", title: "Organic clicks", sub: "Increased by 28%", metric: "+28%", spark: true },
    { iconKey: "spark", tint: "dawn", title: "New opportunity found", sub: "AR shopping demand rising fast", metric: "New" },
    { iconKey: "link", tint: "dawn", title: "Backlink opportunity", sub: "Forbes expert roundup", metric: "High value" },
  ],
  growth: { score: 72, delta: 8 },
  drivers: [["Content velocity", 85], ["Keyword rankings", 72], ["Community engagement", 61], ["Backlinks", 48]],
  learned: ["AR product content performs best on Reddit", "Users love comparison articles", "Email open rate is highest at 8:00 AM"],
};

const PLAN = [
  { n: 1, iconKey: "check", label: "Review approvals", sub: "You are here", state: "current" },
  { n: 2, iconKey: "write", label: "Publish content", sub: "6 items" },
  { n: 3, iconKey: "conversations", label: "Engage communities", sub: "12 conversations" },
  { n: 4, iconKey: "mail", label: "Outreach emails", sub: "25 leads" },
  { n: 5, iconKey: "growth", label: "Track & respond", sub: "Monitor results" },
];

export default function TodayPage() {
  const [d, setD] = useState(FALLBACK);
  const [live, setLive] = useState(false);
  const [entity, setEntity] = useState(null);

  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/today");
      if (live && data?.needsOnboarding) { window.location.href = "/welcome"; return; }
      if (live && data) { setD(mergeLive(FALLBACK, data)); setLive(true); if (data.entity) setEntity(data.entity); }
    })();
  }, []);

  const needsConfirm = entity && (entity.source === "inferred" || (entity.confidence ?? 1) < 0.9);

  return (
    <OperatorShell active="today">
      {needsConfirm && <EntityConfirm entity={entity} onConfirmed={(e) => setEntity(e)} />}

      <div className="mg-rise">
        <p className="flex items-center gap-2 text-[13px] font-medium mg-muted">
          <Sunrise /> Good morning{d.greetingName ? `, ${cap(d.greetingName)}` : ""}
          {!live && <span className="mg-pill" style={{ marginLeft: 6 }}>Sample</span>}
        </p>
        <h1 className="mt-2 text-[40px] leading-[1.04] font-extrabold tracking-tight" style={{ color: "var(--fg)" }}>
          While you slept,<br /><span className="dawn-text">Genie got to work.</span>
        </h1>
        <p className="mt-2.5 text-[15px] mg-muted">{d.summaryLine}</p>
      </div>

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mg-stagger">
        {d.stats.map((s, i) => {
          const IconC = ic(s.iconKey); const t = tint(s.tint);
          return (
            <Card key={i} className="p-4">
              <span className="mg-tile" style={{ width: 34, height: 34, background: t.bg, color: t.fg }}><IconC size={17} /></span>
              <div className="mt-3 text-[27px] font-bold leading-none mg-num" style={{ color: "var(--fg)" }}>{s.n}</div>
              <div className="mt-1.5 text-[12.5px] mg-muted">{s.label}</div>
              <div className="mt-1 text-[11.5px] font-semibold" style={{ color: s.delta ? "var(--signal-live-ink)" : "var(--fg-subtle)" }}>{s.delta || "last 24h"}</div>
            </Card>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-5">
        <TopApprovals approvals={d.approvals} count={d.approvalsCount} />
        <OvernightWins wins={d.wins} />
      </div>

      <TodaysPlan />
      <GrowthIntel growth={d.growth} drivers={d.drivers} learned={d.learned} />

      <p className="mt-8 mb-2 text-center text-[13px] mg-subtle">That’s your night. Genie keeps working — come back anytime.</p>
    </OperatorShell>
  );
}

function TopApprovals({ approvals, count }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="px-5 pt-5 pb-3 flex items-start">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Top Approvals</h2>
            <span className="mg-pill mg-pill--dawn">{count}</span>
          </div>
          <p className="mt-0.5 text-[12.5px] mg-muted">These need your review.</p>
        </div>
        <a href="/approvals" className="mg-btn mg-btn--dawn ml-auto" style={{ fontSize: 12.5, padding: ".5rem .85rem" }}>Review all</a>
      </div>
      <div className="px-3">
        {approvals.map((a, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-3" style={{ borderTop: "1px solid var(--hair)" }}>
            <BrandIcon brand={a.brand} size={18} />
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold truncate" style={{ color: "var(--fg)" }}>{a.title}</p>
              <p className="text-[12px] mg-muted truncate mt-0.5">{a.desc}</p>
              <div className="flex gap-1.5 mt-1.5">{(a.tags || []).map((tg, k) => <Pill key={k} tone={tg.tone}>{tg.label}</Pill>)}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[17px] font-bold leading-none mg-num" style={{ color: a.impact >= 85 ? "var(--accent-ink)" : "var(--fg)" }}>{a.impact}</div>
              <div className="text-[10px] mg-subtle">Impact</div>
            </div>
            <a href="/approvals" className="mg-btn mg-btn--ghost" style={{ fontSize: 12.5, padding: ".45rem .9rem" }}>Review</a>
          </div>
        ))}
      </div>
      {count > approvals.length && (
        <a href="/approvals" className="mt-auto flex items-center justify-center gap-1.5 py-3 text-[12.5px] font-medium mg-muted mg-focus" style={{ borderTop: "1px solid var(--hair)" }}>
          {count - approvals.length} more items <Icon.chevronRight size={14} className="rotate-90" />
        </a>
      )}
    </Card>
  );
}

function OvernightWins({ wins }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Overnight Wins</h2>
        <p className="mt-0.5 text-[12.5px] mg-muted">The highlights you care about.</p>
      </div>
      <div className="px-3 pb-2">
        {wins.map((r, i) => {
          const IconC = ic(r.iconKey); const t = tint(r.tint);
          return (
            <div key={i} className="flex items-center gap-3 px-2 py-3" style={{ borderTop: "1px solid var(--hair)" }}>
              <span className="mg-tile" style={{ width: 34, height: 34, background: t.bg, color: t.fg }}><IconC size={16} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{r.title}</p>
                <p className="text-[12px] mg-muted mt-0.5">{r.sub}</p>
              </div>
              {r.spark && <Spark />}
              <div className="text-right shrink-0" style={{ minWidth: 56 }}>
                <div className="text-[13.5px] font-bold mg-num" style={{ color: "var(--signal-live-ink)" }}>{r.metric}</div>
                {r.metricLabel && <div className="text-[10px] mg-subtle">{r.metricLabel}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TodaysPlan() {
  return (
    <Card className="mt-5 p-5">
      <div className="flex items-center">
        <div>
          <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Today’s Plan</h2>
          <p className="mt-0.5 text-[12.5px] mg-muted">What I’ll focus on after your approvals.</p>
        </div>
        <a href="#" className="ml-auto text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>View full plan</a>
      </div>
      <div className="mt-5 flex items-start">
        {PLAN.map((p, i) => {
          const current = p.state === "current"; const IconC = ic(p.iconKey);
          return (
            <div key={p.n} className="flex-1 flex items-start">
              <div className="flex flex-col items-center text-center px-1" style={{ width: "100%" }}>
                <span className="mg-tile" style={{ width: 42, height: 42, borderRadius: 999, background: current ? "var(--accent-quiet)" : "var(--surface-2)", color: current ? "var(--accent-ink)" : "var(--fg-subtle)", border: current ? "1.5px solid var(--accent)" : "1px solid var(--border)" }}>
                  <IconC size={18} />
                </span>
                <p className="mt-2 text-[12.5px] font-semibold" style={{ color: current ? "var(--fg)" : "var(--fg-muted)" }}>{p.label}</p>
                <p className="text-[11px] mg-subtle mt-0.5">{p.sub}</p>
              </div>
              {i < PLAN.length - 1 && <div className="mt-[21px] h-px flex-1" style={{ background: "var(--border)", minWidth: 16 }} />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function GrowthIntel({ growth, drivers, learned }) {
  return (
    <Card className="mt-5 p-5 grid grid-cols-1 lg:grid-cols-[auto_1fr_1fr] gap-6">
      <div className="flex items-center gap-4">
        <ScoreRing value={growth?.score ?? 72} />
        <div>
          {growth?.delta != null && (
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: growth.delta >= 0 ? "var(--signal-live-ink)" : "var(--signal-danger)" }}>
              <Icon.growth size={14} /> {growth.delta >= 0 ? "+" : ""}{growth.delta} vs last scan
            </div>
          )}
          <p className="mt-1 text-[12.5px] mg-muted leading-snug" style={{ maxWidth: 180 }}>You’re growing faster than <span className="font-semibold" style={{ color: "var(--fg)" }}>76%</span> of similar businesses.</p>
          <a href="/impact" className="mt-2 inline-block text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>See what Genie earned you →</a>
        </div>
      </div>
      <div className="lg:border-l lg:pl-6" style={{ borderColor: "var(--hair)" }}>
        <h3 className="text-[13.5px] font-bold mb-3" style={{ color: "var(--fg)" }}>Top Growth Drivers</h3>
        <div className="space-y-2.5">
          {(drivers || []).map(([label, v]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-[12px] mg-muted w-[150px] shrink-0">{label}</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 70 ? "var(--signal-live)" : "var(--accent)" }} />
              </div>
              <span className="text-[12px] font-semibold mg-num w-6 text-right" style={{ color: "var(--fg)" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="lg:border-l lg:pl-6" style={{ borderColor: "var(--hair)" }}>
        <h3 className="text-[13.5px] font-bold mb-3" style={{ color: "var(--fg)" }}>What Genie learned</h3>
        <ul className="space-y-2">
          {(learned || []).map((l) => (
            <li key={l} className="flex gap-2 text-[12.5px]" style={{ color: "var(--fg-muted)" }}>
              <span style={{ color: "var(--accent-ink)", marginTop: 1 }}><Icon.spark size={14} /></span><span>{l}</span>
            </li>
          ))}
        </ul>
        <a href="/learning" className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--accent-ink)" }}><Icon.brain size={13} /> See how Genie is learning</a>
      </div>
    </Card>
  );
}

/* bits */
function tint(name) {
  switch (name) {
    case "emerald": return { bg: "var(--signal-live-soft)", fg: "var(--signal-live-ink)" };
    case "blue": return { bg: "var(--signal-info-soft)", fg: "var(--signal-info)" };
    case "dawn": return { bg: "var(--accent-quiet)", fg: "var(--accent-ink)" };
    default: return { bg: "var(--surface-sunken)", fg: "var(--fg-muted)" };
  }
}
function cap(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
function Sunrise() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 3v3M4.5 8.5l1.5 1.5M19.5 8.5L18 10M2 14h2M20 14h2" /></svg>);
}
function Spark() {
  return (<svg width="60" height="22" viewBox="0 0 60 22" className="shrink-0" aria-hidden><path d="M2,18 C12,16 18,9 28,7 S46,4 58,2" fill="none" stroke="var(--signal-live)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="58" cy="2" r="2" fill="var(--signal-live)" /></svg>);
}
function ScoreRing({ value }) {
  const r = 34, c = 2 * Math.PI * r, off = c - (value / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--signal-live)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1s var(--ease-out)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-bold leading-none mg-num" style={{ color: "var(--fg)" }}>{value}</span>
        <span className="text-[10.5px] font-semibold" style={{ color: "var(--signal-live-ink)" }}>{value >= 75 ? "Healthy" : value >= 50 ? "Good" : "Growing"}</span>
      </div>
    </div>
  );
}
