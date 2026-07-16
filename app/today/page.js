"use client";

// ── TODAY — the morning briefing (real data only) ──
// Genie tells you what it handled, and the one thing that needs you. Everything
// here is real: overnight activity, the approval queue, and your growth score,
// all from /api/today. No sample data — a brand-new account shows honest empty
// states until the first scan fills them.

import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { DataStateBadge, EmptyState } from "@/components/ui/v2/DataState";
import { EntityConfirm } from "@/components/ui/v2/EntityConfirm";
import { useLive } from "@/lib/useLive";
import { useEffect, useState } from "react";

const ICONS = { write: Icon.write, conversations: Icon.conversations, mail: Icon.mail, reply: Icon.reply, growth: Icon.growth, target: Icon.target, link: Icon.link, spark: Icon.spark, check: Icon.check };
const ic = (k) => ICONS[k] || Icon.spark;
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

export default function TodayPage() {
  // A signed-in account with a scan is "real"; signed-in with no scan yet is "empty".
  const { data: d, state } = useLive("/api/today", (j) => j.needsOnboarding || !j.entity);
  const [entity, setEntity] = useState(null);
  useEffect(() => { if (d?.entity) setEntity(d.entity); }, [d]);

  const greeting = `Good morning${d?.greetingName ? `, ${cap(d.greetingName)}` : ""}`;
  const needsConfirm = entity && (entity.source === "inferred" || (entity.confidence ?? 1) < 0.9);
  const did = (d?.stats || []).map((s) => ({ ...s, n: Number(String(s.n).replace(/[^\d.-]/g, "")) || 0 })).filter((s) => s.n > 0).slice(0, 5);
  const count = d?.approvalsCount || 0;
  const clearTime = count === 0 ? "" : count * 15 < 60 ? `${count * 15}s` : `about ${Math.max(1, Math.round(count * 15 / 60))} min`;

  return (
    <OperatorShell active="today">
      <OperatorHeader
        large
        icon={Sunrise}
        label={greeting}
        provenance={<DataStateBadge state={state} />}
        title={<>While you slept,<br /><span className="dawn-text">Genie got to work.</span></>}
        kicker={state === "real" ? (d?.summaryLine || "Here’s where things stand. I’ll keep working in the background.") : undefined}
      />

      {state !== "real" ? (
        <EmptyState
          state={state === "disconnected" ? "disconnected" : "empty"}
          icon={Icon.spark}
          title={state === "disconnected" ? "I can’t reach your account" : "I haven’t met your business yet"}
          sub={state === "disconnected" ? "Sign in and I’ll pick right back up." : "Point me at your website and I’ll research you, find your buyers, and start working — everything on this screen fills itself in from that first scan."}
          action={state === "disconnected" ? undefined : <a href="/welcome" className="mg-btn mg-btn--dawn" style={{ fontSize: 13.5 }}>Run my first scan →</a>}
        />
      ) : (
        <>
          <div className="mt-7 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
            {/* what I handled */}
            <Card className="mg-ambient p-6 lg:p-7 flex flex-col">
              <p className="mg-eyebrow">Handled while you were away</p>
              {did.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {did.map((x, i) => {
                    const IconC = ic(x.iconKey);
                    return (
                      <li key={i} className="flex items-center gap-3 mg-rise" style={{ animationDelay: `${i * 60}ms` }}>
                        <span className="mg-tile shrink-0" style={{ width: 30, height: 30, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><Icon.check size={16} /></span>
                        <span className="text-[15.5px]" style={{ color: "var(--fg-muted)" }}><span className="font-bold mg-num" style={{ color: "var(--fg)" }}>{x.n}</span> {x.label.toLowerCase()}</span>
                        <span className="ml-auto" style={{ color: "var(--fg-subtle)" }}><IconC size={15} /></span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-4 text-[15px] mg-muted">A quiet night so far — I’ve set up your engine and I’m hunting your first buyers now. Your first work will appear here soon.</p>
              )}
              <div className="mt-auto pt-6">
                <div className="mg-seam mb-4" />
                <div className="flex items-center gap-4 flex-wrap">
                  <a href="/growth" className="text-[13px] font-semibold" style={{ color: "var(--accent-ink)" }}>See what I’m growing →</a>
                  <a href="/conversations" className="text-[13px] font-semibold mg-muted">Conversations</a>
                  <a href="/impact" className="text-[13px] font-semibold mg-muted">Impact</a>
                </div>
              </div>
            </Card>

            {/* the one ask */}
            <Card className="p-6 flex flex-col">
              <p className="mg-eyebrow">Needs you now</p>
              <div className="mt-3 flex items-baseline gap-2.5">
                <span className="mg-num leading-none" style={{ fontSize: 60, fontWeight: 800, letterSpacing: "-.03em", color: count > 0 ? "var(--accent-ink)" : "var(--fg)" }}>{count}</span>
                <span className="text-[15px] mg-muted pb-1">{count === 1 ? "decision" : "decisions"} waiting</span>
              </div>
              <p className="mt-1.5 text-[13.5px] mg-muted">{count > 0 ? `${clearTime} to clear them. I handle the rest myself.` : "Nothing needs you yet. I’ll bring you decisions as I find them."}</p>
              <a href="/approvals" className="mg-btn mg-btn--dawn mt-5" style={{ fontSize: 14, padding: ".8rem 1rem" }}>
                {count > 0 ? "Review approvals →" : "See the queue →"}
              </a>

              {d?.growth?.score != null && (
                <>
                  <div className="mg-hairline my-5" />
                  <div className="flex items-center gap-4">
                    <ScoreRing value={d.growth.score} size={72} />
                    <div className="min-w-0">
                      {d.growth.delta != null && (
                        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: d.growth.delta >= 0 ? "var(--signal-live-ink)" : "var(--signal-danger)" }}>
                          <Icon.growth size={13} /> {d.growth.delta >= 0 ? "+" : ""}{d.growth.delta} vs last scan
                        </p>
                      )}
                      <p className="mt-0.5 text-[12.5px] mg-muted leading-snug">Your growth score, from your latest scan.</p>
                      <a href="/impact" className="mt-1 inline-block text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>See what I earned you →</a>
                    </div>
                  </div>
                </>
              )}
            </Card>
          </div>

          {needsConfirm && <div className="mt-5"><EntityConfirm entity={entity} onConfirmed={(e) => setEntity(e)} /></div>}

          {(d?.learned || []).length > 0 && (
            <div className="mt-8">
              <p className="mg-eyebrow">What I’ve learned about you</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {d.learned.slice(0, 3).map((l, i) => (
                  <Card key={i} className="p-4 flex gap-3">
                    <span style={{ color: "var(--accent-ink)", marginTop: 1 }}><Icon.spark size={15} /></span>
                    <span className="text-[13px]" style={{ color: "var(--fg-muted)", lineHeight: 1.45 }}>{l}</span>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <p className="mt-9 mb-1 text-center text-[13px] mg-subtle">That’s your night. I’ll keep working — come back anytime.</p>
        </>
      )}
    </OperatorShell>
  );
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
