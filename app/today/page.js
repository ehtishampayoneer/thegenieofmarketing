"use client";

// ── TODAY — the War Room (real data only) ──
// Not a briefing you read; a room you walk into. The first thing you see is the
// war Genie is fighting for you — whether buyers who ask AI hear your name or a
// competitor's — and the proof that matters: customers won. Everything here is
// real, from /api/today. A brand-new account sees a cinematic invitation, never a
// dead empty box. Honesty is the brand: every number carries where it came from.

import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card, Provenance } from "@/components/ui/v2/primitives";
import { DataStateBadge, EmptyState } from "@/components/ui/v2/DataState";
import { EntityConfirm } from "@/components/ui/v2/EntityConfirm";
import { GenieMark } from "@/components/brand/GenieMark";
import { useLive } from "@/lib/useLive";
import { useEffect, useState } from "react";

const ICONS = { write: Icon.write, conversations: Icon.conversations, mail: Icon.mail, reply: Icon.reply, growth: Icon.growth, target: Icon.target, link: Icon.link, spark: Icon.spark, check: Icon.check };
const ic = (k) => ICONS[k] || Icon.spark;
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const money = (n, cur = "USD") => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n); } catch { return `$${n}`; } };

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

  const cust = d?.customers || null;
  const won = cust?.count || 0;
  const ai = d?.aiSearch || null;

  // The headline is the day's single most important truth. A customer won outranks
  // everything; otherwise, the work done through the night.
  const header = won > 0
    ? { title: "You’ve won", accent: `${won} ${won === 1 ? "customer" : "customers"}.`, kicker: cust.value > 0 ? `${money(cust.value, cust.currency)} in tracked revenue, every dollar traced back to work I did for you.` : "Real people, traced back to the work I did — not vanity metrics." }
    : { title: <>While you slept,<br /></>, accent: "Genie got to work.", kicker: state === "real" ? (d?.summaryLine || "Here’s the room. I’ll keep working in the background — come back anytime.") : undefined };

  return (
    <OperatorShell active="today">
      <OperatorHeader
        large
        icon={Sunrise}
        label={greeting}
        provenance={<DataStateBadge state={state} />}
        title={header.title}
        accent={header.accent}
        kicker={header.kicker}
      />

      {state !== "real" ? (
        <FirstRun state={state} />
      ) : (
        <>
          {/* ── THE ROOM: the war on the left, the proof + the one ask on the right ── */}
          <div className="mt-7 grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5">
            <WarRoom ai={ai} entityName={entity?.name} />

            <div className="flex flex-col gap-5">
              <CustomersCard cust={cust} />
              <DecisionCard count={count} clearTime={clearTime} />
            </div>
          </div>

          {/* ── YOUR NIGHT: what got handled + where you stand ── */}
          <section className="mg-act">
            <p className="mg-eyebrow">Your night, handled</p>
            <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5">
              <Card className="p-6 lg:p-7 flex flex-col">
                {did.length > 0 ? (
                  <ul className="space-y-3.5 mg-stagger">
                    {did.map((x, i) => {
                      const IconC = ic(x.iconKey);
                      return (
                        <li key={i} className="flex items-center gap-3">
                          <span className="mg-tile shrink-0" style={{ width: 32, height: 32, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><Icon.check size={16} /></span>
                          <span className="text-[15.5px]" style={{ color: "var(--fg-muted)" }}><span className="font-bold mg-num" style={{ color: "var(--fg)" }}>{x.n}</span> {x.label.toLowerCase()}</span>
                          <span className="ml-auto" style={{ color: "var(--fg-subtle)" }}><IconC size={15} /></span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="mg-live-dot" />
                    <p className="text-[15px] mg-muted">A quiet night so far — your engine is set and I’m hunting your first buyers right now. The work will land here.</p>
                  </div>
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

              {d?.growth?.score != null ? (
                <Card className="p-6 flex flex-col items-center text-center justify-center">
                  <p className="mg-eyebrow self-start">Growth score</p>
                  <div className="mt-3"><ScoreRing value={d.growth.score} size={104} /></div>
                  {d.growth.delta != null && (
                    <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: d.growth.delta >= 0 ? "var(--signal-live-ink)" : "var(--signal-danger)" }}>
                      <Icon.growth size={14} /> {d.growth.delta >= 0 ? "+" : ""}{d.growth.delta} vs last scan
                    </p>
                  )}
                  <a href="/impact" className="mt-2 text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>See what I earned you →</a>
                </Card>
              ) : (
                <Card className="p-6 flex flex-col justify-center">
                  <p className="mg-eyebrow">Growth score</p>
                  <p className="mt-3 text-[14px] mg-muted">Your score appears after your first full scan — the number I’ll move week over week.</p>
                </Card>
              )}
            </div>
          </section>

          {needsConfirm && <div className="mt-5"><EntityConfirm entity={entity} onConfirmed={(e) => setEntity(e)} /></div>}

          {(d?.learned || []).length > 0 && (
            <section className="mg-act">
              <p className="mg-eyebrow">What I’ve learned about you</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mg-stagger">
                {d.learned.slice(0, 3).map((l, i) => (
                  <Card key={i} className="p-4 flex gap-3">
                    <span style={{ color: "var(--accent-ink)", marginTop: 1 }}><Icon.spark size={15} /></span>
                    <span className="text-[13px]" style={{ color: "var(--fg-muted)", lineHeight: 1.45 }}>{l}</span>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <p className="mt-9 mb-1 text-center text-[13px] mg-subtle">That’s your room. I’ll keep working through the night — come back anytime.</p>
        </>
      )}
    </OperatorShell>
  );
}

// ── THE WAR ROOM ──────────────────────────────────────────────────────────
// The differentiator, made the centerpiece: when your buyers ask an AI what to
// buy, does it say your name — or a competitor's? Modelled, and labelled as such.
function WarRoom({ ai, entityName }) {
  const score = clampPct(ai?.score);
  const comp = ai?.topCompetitor;
  const working = ai?.working || 0;
  const landed = ai?.won || 0;
  const engines = Array.isArray(ai?.engines) ? ai.engines.filter(Boolean) : [];
  const you = entityName || "you";

  return (
    <Card className="mg-ambient p-6 lg:p-8 flex flex-col mg-rise">
      <div className="flex items-center justify-between gap-3">
        <p className="mg-eyebrow"><Icon.spark size={14} /> The AI answer war</p>
        {engines.length
          ? <Provenance kind="verified">Asked {engines.slice(0, 3).join(" · ")}</Provenance>
          : <Provenance kind="modelled">AI-modelled</Provenance>}
      </div>

      <h2 className="mt-3 mg-display" style={{ fontSize: "clamp(22px,2.4vw,30px)" }}>
        When buyers ask AI what to buy,<br />
        <span className="dawn-text">{score > 0 ? `you show up ${score}% of the time.` : "your name isn’t coming up yet."}</span>
      </h2>

      <div className="mt-6">
        <div className="flex items-baseline justify-between text-[12px] font-semibold mg-subtle mb-2">
          <span>Share of AI answers naming {you}</span>
          <span className="mg-num" style={{ color: score > 0 ? "var(--signal-live-ink)" : "var(--fg)" }}>{score}%</span>
        </div>
        <WarBar score={score} />
        <p className="mt-3 text-[13.5px] mg-muted leading-snug">
          {working > 0
            ? <>I’m writing <b style={{ color: "var(--fg)" }}>{working}</b> answer {working === 1 ? "page" : "pages"} to win more ground{landed > 0 ? <>, and <b style={{ color: "var(--signal-live-ink)" }}>{landed}</b> already landed</> : ""}.</>
            : comp
              ? <>Right now AI points them to <b style={{ color: "var(--fg)" }}>{comp}</b> instead. I’m going after that.</>
              : <>I’m mapping the questions your buyers ask AI, and where the answers come from.</>}
        </p>
      </div>

      <div className="mt-auto pt-6">
        <a href="/ai-search" className="mg-btn mg-btn--dawn" style={{ fontSize: 13.5 }}>See where AI sends your buyers →</a>
      </div>
    </Card>
  );
}

// The battle line — your share fills in on load; the rest is the ground still held
// by competitors. Motion is honest: it only animates a real, measured share.
function WarBar({ score }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(score), 90); return () => clearTimeout(t); }, [score]);
  return (
    <div style={{ position: "relative", height: 13, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden", border: "1px solid var(--hair)" }}>
      <div style={{ height: "100%", width: `${w}%`, borderRadius: 999, background: "linear-gradient(90deg, var(--mg-dawn-500), var(--signal-live))", transition: "width 1.1s var(--ease-out)", boxShadow: "var(--shadow-dawn)" }} />
    </div>
  );
}

// ── CUSTOMERS WON — the money proof (real, from the attribution ledger) ──────
function CustomersCard({ cust }) {
  const n = cust?.count || 0;
  const val = cust?.value || 0;
  const cur = cust?.currency || "USD";
  const last24 = cust?.last24 || 0;
  return (
    <Card className="p-6 flex flex-col mg-rise">
      <div className="flex items-center justify-between gap-2">
        <p className="mg-eyebrow">Customers won</p>
        <Provenance kind="verified">Attributed</Provenance>
      </div>
      <div className="mt-2 flex items-baseline gap-2.5">
        <span className="mg-num leading-none" style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-.03em", color: n > 0 ? "var(--signal-live-ink)" : "var(--fg)" }}>{n}</span>
        <span className="text-[14px] mg-muted pb-1">{n === 1 ? "customer" : "customers"}{last24 > 0 ? <>, <span style={{ color: "var(--signal-live-ink)", fontWeight: 700 }}>{last24} today</span></> : ""}</span>
      </div>
      <p className="mt-1.5 text-[13px] mg-muted leading-snug">
        {n > 0
          ? <>{val > 0 ? <><b style={{ color: "var(--fg)" }}>{money(val, cur)}</b> in tracked revenue, </> : null}each one traced back to a decision I made for you.</>
          : <>The moment one of my tagged links turns into a sale, your first one lands here — the number this whole product exists to move.</>}
      </p>
      <a href="/impact" className="mt-3 text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>See the money trail →</a>
    </Card>
  );
}

// ── THE ONE ASK — everything else, I handle myself ──────────────────────────
function DecisionCard({ count, clearTime }) {
  return (
    <Card className="p-6 flex flex-col mg-rise">
      <p className="mg-eyebrow">Needs you now</p>
      <div className="mt-2 flex items-baseline gap-2.5">
        <span className="mg-num leading-none" style={{ fontSize: 56, fontWeight: 800, letterSpacing: "-.03em", color: count > 0 ? "var(--accent-ink)" : "var(--fg)" }}>{count}</span>
        <span className="text-[14px] mg-muted pb-1">{count === 1 ? "decision" : "decisions"} waiting</span>
      </div>
      <p className="mt-1.5 text-[13px] mg-muted leading-snug">{count > 0 ? `${clearTime} to clear them. I handle everything else myself.` : "Nothing needs you yet. I’ll bring you decisions only when they’re worth your time."}</p>
      <a href="/approvals" className="mg-btn mg-btn--dawn mt-4" style={{ fontSize: 13.5 }}>{count > 0 ? "Review approvals →" : "See the queue →"}</a>
    </Card>
  );
}

// ── FIRST RUN — a cinematic invitation, never a dead empty box ───────────────
function FirstRun({ state }) {
  if (state === "disconnected") {
    return (
      <EmptyState
        state="disconnected"
        icon={Icon.spark}
        title="I can’t reach your account"
        sub="Sign in and I’ll pick right back up where we left off."
      />
    );
  }
  const previews = [
    { label: "Customers won", hint: "Every sale I drive, traced back to the work" },
    { label: "AI answer war", hint: "Whether AI names you or a competitor" },
    { label: "Growth score", hint: "The number I move for you, week over week" },
  ];
  return (
    <div className="mt-7">
      <Card className="mg-ambient p-8 lg:p-12 flex flex-col items-center text-center mg-rise">
        <span className="mg-presence" data-state="working"><GenieMark size={56} live /></span>
        <h2 className="mt-5 mg-display" style={{ maxWidth: "20ch" }}>
          Your war room is dark — <span className="dawn-text">for one more minute.</span>
        </h2>
        <p className="mt-3 mg-lede" style={{ marginLeft: "auto", marginRight: "auto" }}>
          Point me at your website. I’ll research your business, find the buyers already looking for what you sell, check whether AI recommends you or your competitor, and start working tonight. Everything on this page fills itself in from that first scan.
        </p>
        <a href="/welcome" className="mg-btn mg-btn--dawn mt-6" style={{ fontSize: 15, padding: ".85rem 1.4rem" }}>Run my first scan →</a>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-4 mg-stagger">
        {previews.map((p, i) => (
          <Card key={i} className="p-5" style={{ opacity: 0.72 }}>
            <div className="flex items-center justify-between">
              <p className="mg-eyebrow">{p.label}</p>
              <span className="mg-pill">Unlocks after scan</span>
            </div>
            <p className="mt-2 mg-num" style={{ fontSize: 34, fontWeight: 800, color: "var(--fg-subtle)" }}>—</p>
            <p className="mt-1 text-[12.5px] mg-muted leading-snug">{p.hint}</p>
          </Card>
        ))}
      </div>
    </div>
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
        <span className="font-bold leading-none mg-num" style={{ fontSize: size < 80 ? 20 : 30, color: "var(--fg)" }}>{value}</span>
        <span className="font-semibold" style={{ fontSize: size < 80 ? 9 : 11, color: "var(--signal-live-ink)" }}>{value >= 75 ? "Healthy" : value >= 50 ? "Good" : "Growing"}</span>
      </div>
    </div>
  );
}
function clampPct(n) { const v = Math.round(Number(n) || 0); return v < 0 ? 0 : v > 100 ? 100 : v; }
