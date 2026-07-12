"use client";

// ── TODAY — the morning reveal (live) ──
// The emotional core of the product: you wake up, and your employee tells you
// three things — what it handled, the opportunity it's working toward, and the
// one thing that needs you. Outcome-led, one hero, one ask. Everything deeper
// lives on its own screen. Reads /api/today; representative sample for preview.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Provenance } from "@/components/ui/v2/primitives";
import { Card } from "@/components/ui/v2/primitives";
import { EntityConfirm } from "@/components/ui/v2/EntityConfirm";
import { fetchLive, mergeLive } from "@/lib/live";

const ICONS = { write: Icon.write, conversations: Icon.conversations, mail: Icon.mail, reply: Icon.reply, growth: Icon.growth, target: Icon.target, link: Icon.link, spark: Icon.spark, check: Icon.check };
const ic = (k) => ICONS[k] || Icon.spark;

const FALLBACK = {
  greetingName: "Asim",
  summaryLine: "Here’s your night. I handled the busywork — three things below need your eyes.",
  did: [
    { iconKey: "write", label: "articles written & queued", n: 6 },
    { iconKey: "conversations", label: "buying conversations found", n: 14 },
    { iconKey: "mail", label: "outreach emails drafted", n: 25 },
    { iconKey: "growth", label: "keyword rankings improved", n: 18 },
  ],
  opportunity: { value: 14200, currency: "USD" },
  approvalsCount: 7, approvalsMinutes: 2,
  wins: [
    { iconKey: "target", tint: "emerald", title: "“ar try before you buy”", sub: "Ranked up #18 → #11", metric: "▲ 7", metricLabel: "positions" },
    { iconKey: "growth", tint: "emerald", title: "Organic clicks", sub: "Up 28% this week", metric: "+28%" },
    { iconKey: "spark", tint: "dawn", title: "New opportunity", sub: "AR shopping demand rising", metric: "New" },
  ],
  growth: { score: 72, delta: 8 },
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
      if (live && data) {
        // Map the live stats array into achievement lines when present.
        const merged = mergeLive(FALLBACK, data);
        if (Array.isArray(data.stats) && data.stats.length) {
          merged.did = data.stats.map((s) => ({ iconKey: s.iconKey, label: s.label, n: Number(String(s.n).replace(/[^\d.-]/g, "")) || 0 }));
        }
        setD(merged); setLive(true); if (data.entity) setEntity(data.entity);
      }
    })();
  }, []);

  const needsConfirm = entity && (entity.source === "inferred" || (entity.confidence ?? 1) < 0.9);
  const did = (d.did || []).filter((x) => (x.n ?? 0) > 0).slice(0, 5);
  const count = d.approvalsCount || 0;
  const clearTime = count === 0 ? "" : count * 15 < 60 ? `${count * 15}s` : `about ${Math.max(1, Math.round(count * 15 / 60))} min`;

  return (
    <OperatorShell active="today">
      {needsConfirm && <EntityConfirm entity={entity} onConfirmed={(e) => setEntity(e)} />}

      <OperatorHeader
        large
        icon={Sunrise}
        label={`Good morning${d.greetingName ? `, ${cap(d.greetingName)}` : ""}`}
        provenance={!live ? <span className="mg-pill">Sample</span> : null}
        title={<>While you slept,<br /><span className="dawn-text">Genie got to work.</span></>}
        kicker={d.summaryLine}
      />

      {/* HERO — the brief, and the one thing that needs you */}
      <div className="mt-7 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        <Card className="mg-ambient p-6 lg:p-7 flex flex-col">
          <p className="mg-eyebrow">Handled while you were away</p>
          {did.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {did.map((x, i) => {
                const IconC = ic(x.iconKey);
                return (
                  <li key={i} className="flex items-center gap-3 mg-rise" style={{ animationDelay: `${i * 60}ms` }}>
                    <span className="mg-tile shrink-0" style={{ width: 30, height: 30, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><Icon.check size={16} /></span>
                    <span className="text-[15.5px]" style={{ color: "var(--fg-muted)" }}><span className="font-bold mg-num" style={{ color: "var(--fg)" }}>{x.n}</span> {x.label}</span>
                    <span className="ml-auto" style={{ color: "var(--fg-subtle)" }}><IconC size={15} /></span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-[15px] mg-muted">A quiet night — I kept watch and staged what’s ready for you.</p>
          )}

          {d.opportunity?.value > 0 && (
            <div className="mt-auto pt-6">
              <div className="mg-seam mb-5" />
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <p className="mg-eyebrow">Opportunity in motion <Provenance kind="modelled" /></p>
                  <p className="mt-1.5 mg-display-lg dawn-text mg-num">{fmtMoney(d.opportunity.value, d.opportunity.currency)}</p>
                </div>
                <p className="text-[12.5px] mg-subtle" style={{ maxWidth: 200 }}>Estimated pipeline I’m working toward across every channel.</p>
              </div>
            </div>
          )}
        </Card>

        {/* The single ask */}
        <Card className="p-6 flex flex-col">
          <p className="mg-eyebrow">Needs you now</p>
          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="mg-num leading-none" style={{ fontSize: 60, fontWeight: 800, letterSpacing: "-.03em", color: count > 0 ? "var(--accent-ink)" : "var(--fg)" }}>{count}</span>
            <span className="text-[15px] mg-muted pb-1">{count === 1 ? "decision" : "decisions"} waiting</span>
          </div>
          <p className="mt-1.5 text-[13.5px] mg-muted">{count > 0 ? `${clearTime} to clear them all. I published the rest automatically.` : "You’re all caught up. I’ll keep working."}</p>
          <a href="/approvals" className="mg-btn mg-btn--dawn mt-5" style={{ fontSize: 14, padding: ".8rem 1rem" }}>
            {count > 0 ? "Review approvals →" : "See what’s next →"}
          </a>

          <div className="mg-hairline my-5" />

          <div className="flex items-center gap-4">
            <ScoreRing value={d.growth?.score ?? 72} size={72} />
            <div className="min-w-0">
              {d.growth?.delta != null && (
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: d.growth.delta >= 0 ? "var(--signal-live-ink)" : "var(--signal-danger)" }}>
                  <Icon.growth size={13} /> {d.growth.delta >= 0 ? "+" : ""}{d.growth.delta} vs last scan
                </p>
              )}
              <p className="mt-0.5 text-[12.5px] mg-muted leading-snug">Growing faster than <span className="font-semibold" style={{ color: "var(--fg)" }}>76%</span> of similar businesses.</p>
              <a href="/impact" className="mt-1 inline-block text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>See what I earned you →</a>
            </div>
          </div>
        </Card>
      </div>

      {/* Overnight wins — the proof, calm and secondary */}
      {(d.wins || []).length > 0 && (
        <div className="mt-9">
          <div className="flex items-center justify-between">
            <p className="mg-eyebrow">Overnight wins</p>
            <a href="/learning" className="text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>How I’m learning →</a>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {d.wins.slice(0, 3).map((r, i) => {
              const IconC = ic(r.iconKey); const t = tint(r.tint);
              return (
                <Card key={i} className="p-4 flex items-center gap-3">
                  <span className="mg-tile shrink-0" style={{ width: 36, height: 36, background: t.bg, color: t.fg }}><IconC size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{r.title}</p>
                    <p className="text-[11.5px] mg-muted truncate mt-0.5">{r.sub}</p>
                  </div>
                  <span className="text-[13px] font-bold mg-num shrink-0" style={{ color: "var(--signal-live-ink)" }}>{r.metric}</span>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <TodaysPlan />

      <p className="mt-9 mb-1 text-center text-[13px] mg-subtle">That’s your night. I’ll keep working — come back anytime.</p>
    </OperatorShell>
  );
}

function TodaysPlan() {
  return (
    <div className="mt-9">
      <p className="mg-eyebrow">What I’ll focus on next</p>
      <Card className="mt-3 p-6">
        <div className="flex items-start">
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
    </div>
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
function fmtMoney(value, currency = "USD") {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value) || 0); }
  catch { return `$${Math.round(Number(value) || 0).toLocaleString()}`; }
}
function Sunrise() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 18h16M6 18a6 6 0 0 1 12 0M12 3v3M4.5 8.5l1.5 1.5M19.5 8.5L18 10M2 14h2M20 14h2" /></svg>);
}
function ScoreRing({ value, size = 88 }) {
  const stroke = size < 80 ? 7 : 8;
  const r = size / 2 - stroke - 2, c = 2 * Math.PI * r, off = c - (value / 100) * c;
  const cx = size / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--signal-live)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1s var(--ease-out)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none mg-num" style={{ fontSize: size < 80 ? 20 : 26, color: "var(--fg)" }}>{value}</span>
        <span className="font-semibold" style={{ fontSize: size < 80 ? 9 : 10.5, color: "var(--signal-live-ink)" }}>{value >= 75 ? "Healthy" : value >= 50 ? "Good" : "Growing"}</span>
      </div>
    </div>
  );
}
