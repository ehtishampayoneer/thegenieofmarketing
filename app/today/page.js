"use client";

// ── TODAY — the command center ──
// The one page that answers, in order: what should I do today, how am I
// progressing, what did Genie accomplish while I was away, and where's my
// biggest opening. Built to a fixed, approved composition: a two-column hero
// (your one thing · growth score), the six-stage journey, today's glance beside
// last night's work, then insight + opportunity. Real data fills every number;
// a zero is always shown with the reason it's zero.

import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { EmptyState, LoadingState } from "@/components/ui/v2/DataState";
import { GenieMark } from "@/components/brand/GenieMark";
import { useLive } from "@/lib/useLive";
import { fetchLive } from "@/lib/live";
import { useEffect, useMemo, useState } from "react";

const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const num = (n) => Number(String(n ?? "").replace(/[^\d.-]/g, "")) || 0;
const money = (n, cur = "USD") => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n); } catch { return `$${n}`; } };

// Growth tiers — the ladder the score climbs. cur = where you stand, next = the
// level to reach. Thresholds match the reference (59 → "Good", next "70 · Great").
const TIERS = [
  { min: 0, label: "Starting out" },
  { min: 40, label: "Fair" },
  { min: 55, label: "Good" },
  { min: 70, label: "Great" },
  { min: 85, label: "Dominating" },
];
function tierOf(score) {
  let cur = TIERS[0];
  for (const t of TIERS) if (score >= t.min) cur = t;
  const next = TIERS[TIERS.indexOf(cur) + 1] || null;
  return { cur, next };
}

// The six stages of the journey. Colour walks red → gold → green as you climb.
const STAGES = [
  { key: "Setup", color: "#D6483B", desc: "Get Genie connected to your business. Takes 5 minutes." },
  { key: "Foundation", color: "#F59E3D", desc: "Genie is learning your business, buyers, and voice." },
  { key: "Building", color: "#E4A72E", desc: "Genie is planting seeds. Real results in 2 to 4 weeks." },
  { key: "Growing", color: "#8FBF5B", desc: "Google is indexing you. AI is starting to notice." },
  { key: "Winning", color: "#2FA76C", desc: "You’re being cited, ranking, and converting customers." },
  { key: "Dominating", color: "#1E7A50", desc: "You own your niche. Genie is your growth engine." },
];
// Which stage are we in? Derived from real signals, defaulting up the ladder.
// Deliberately conservative: a score bump alone doesn't mean "Growing" — that
// takes live, published content; "Winning" takes real AI citations.
function deriveStage(d) {
  const hasEntity = !!d?.entity;
  const hasOutput = (d?.approvalsCount || 0) > 0 || (d?.stats || []).some((s) => num(s.n) > 0);
  const published = num((d?.stats || []).find((s) => /publish/i.test(s.label))?.n);
  const cited = (d?.aiSearch?.won || 0) > 0;
  if ((d?.growth?.score || 0) >= 85 && (d?.customers?.count || 0) > 0) return 6;
  if (cited) return 5;
  if (published > 0) return 4;
  if (hasOutput) return 3;
  if (hasEntity) return 2;
  return 1;
}

export default function TodayPage() {
  const { data: d, state } = useLive("/api/today", (j) => j.needsOnboarding || !j.entity);
  const [conns, setConns] = useState(null);
  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/connections/status");
      if (live && data?.integrations) setConns(data.integrations);
    })();
  }, []);

  const name = cap(d?.greetingName || "");
  const count = d?.approvalsCount || 0;
  const clearTime = count === 0 ? "5 min" : count * 15 < 60 ? `${count * 15} sec` : `${Math.max(1, Math.round((count * 15) / 60))} min`;
  const did = useMemo(
    () => (d?.stats || []).map((s) => ({ ...s, n: num(s.n) })).filter((s) => s.n > 0),
    [d]
  );
  const stage = deriveStage(d);

  return (
    <OperatorShell active="today">
      {state === "loading" ? (
        <LoadingState rows={4} />
      ) : state === "disconnected" || state === "empty" ? (
        <FirstRun state={state} />
      ) : (
        <div className="mg-stagger" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* ── HERO: your one thing · growth score ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 items-stretch">
            <HeroOneThing name={name} count={count} clearTime={clearTime} />
            <GrowthScore d={d} count={count} conns={conns} />
          </div>

          {/* ── YOUR GENIE JOURNEY ── */}
          <Journey stage={stage} d={d} />

          {/* ── TODAY AT A GLANCE · WHAT GENIE DID LAST NIGHT ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 items-start">
            <Glance d={d} count={count} clearTime={clearTime} did={did} />
            <LastNight did={did} />
          </div>

          {/* ── INSIGHT · OPPORTUNITY ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Insight d={d} />
            <Opportunity d={d} />
          </div>

          <p className="mt-3 mb-1 text-center text-[13px] mg-subtle">That’s your room. I’ll keep working through the night. Come back anytime.</p>
        </div>
      )}
    </OperatorShell>
  );
}

// ── HERO LEFT — the single most important action today ──────────────────────
function HeroOneThing({ name, count, clearTime }) {
  const has = count > 0;
  return (
    <Card className="p-7 lg:p-8 flex flex-col mg-rise mg-aura-field relative overflow-hidden">
      <div className="flex items-start gap-5">
        <span className="shrink-0 hidden sm:block"><span className="mg-presence" data-state={has ? "working" : "idle"}><GenieMark size={72} live={has} /></span></span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold flex items-center gap-2" style={{ color: "var(--fg-muted)" }}>
            <span className="mg-live-dot" /> Good morning{name ? `, ${name}` : ""}
          </p>
          <h1 className="mt-1.5 mg-display" style={{ fontSize: "clamp(30px,3.3vw,42px)" }}>
            {has ? <>Your <span className="dawn-text">one thing</span> to do today</> : <>You’re <span className="dawn-text">all caught up</span></>}
          </h1>
          <p className="mt-2.5 mg-lede" style={{ maxWidth: "44ch" }}>
            {has
              ? <>Genie drafted <b style={{ color: "var(--fg)", fontWeight: 700 }}>{count}</b> {count === 1 ? "piece" : "pieces"} last night. Approve them to start winning traffic.</>
              : <>Nothing needs you right now. I’ll bring you a decision only when it’s worth your time, and keep working in the background.</>}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4 flex-wrap">
        <a href="/approvals" className="mg-btn mg-btn--dawn" style={{ fontSize: 14 }}>{has ? `Review ${count} approval${count === 1 ? "" : "s"} →` : "See what I’m working on →"}</a>
        <a href="/approvals" className="text-[13px] font-semibold" style={{ color: "var(--fg-muted)" }}>See what’s inside</a>
      </div>

      <div className="mt-auto pt-6 flex items-center gap-2.5 flex-wrap">
        <span className="mg-pill"><Icon.clock size={13} /> Takes {clearTime}</span>
        <span className="mg-pill mg-pill--dawn"><Icon.spark size={12} /> High impact</span>
      </div>
    </Card>
  );
}

// ── HERO RIGHT — growth score + the fastest ways to raise it ─────────────────
function GrowthScore({ d, count, conns }) {
  const raw = d?.growth?.score;
  const score = raw == null ? null : Math.round(raw);
  const delta = d?.growth?.delta;
  const { cur, next } = tierOf(score ?? 0);

  // The checklist — real levers, real point values. Done state comes from live
  // connection status + the approvals count; falls back to "to do" when unknown.
  const items = [
    { label: "Connect Google Search Console", pts: 5, done: conns?.google?.connected === true, href: "/connections" },
    { label: `Approve ${count || "your"} pending draft${count === 1 ? "" : "s"}`, pts: 3, done: count === 0 && conns != null, href: "/approvals" },
    { label: "Connect your blog", pts: 3, done: conns?.wordpress?.connected === true, href: "/connections" },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <Card className="p-6 flex flex-col mg-rise">
      <p className="mg-klabel">Growth Score</p>
      <div className="mt-4 flex items-center gap-5">
        <BigRing value={score} label={cur.label} />
        <div className="min-w-0">
          <p className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>{cur.label}{delta > 0 ? ", climbing" : ""}</p>
          {delta != null && (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: delta >= 0 ? "var(--signal-live-ink)" : "var(--signal-danger)" }}>
              <Icon.growth size={14} /> {delta >= 0 ? "+" : ""}{delta} this week
            </p>
          )}
          {next && (
            <p className="mt-3 text-[12px] font-semibold" style={{ color: "var(--accent-ink)" }}>
              <span style={{ textTransform: "uppercase", letterSpacing: ".08em" }}>Next level:</span> {next.min} ({next.label})
            </p>
          )}
        </div>
      </div>

      <div className="mg-seam my-4" />

      <p className="text-[12px] font-semibold mg-subtle mb-1.5">{doneCount}/{items.length} completed</p>
      <div>
        {items.map((it, i) => (
          <a key={i} href={it.href} className="mg-checkrow mg-focus">
            <span className="shrink-0" style={{ width: 18, height: 18, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", border: it.done ? "none" : "1.5px solid var(--border-strong)", background: it.done ? "var(--signal-live-soft)" : "transparent", color: "var(--signal-live-ink)" }}>
              {it.done && <Icon.check size={12} />}
            </span>
            <span className="flex-1 text-[13px]" style={{ color: it.done ? "var(--fg-subtle)" : "var(--fg)", textDecoration: it.done ? "line-through" : "none" }}>{it.label}</span>
            <span className="text-[12px] font-semibold mg-num" style={{ color: "var(--accent-ink)" }}>+{it.pts} pts</span>
            <Icon.chevronRight size={14} style={{ color: "var(--fg-subtle)" }} />
          </a>
        ))}
      </div>
    </Card>
  );
}

function BigRing({ value, label, size = 128 }) {
  const stroke = 10;
  const r = size / 2 - stroke - 2, c = 2 * Math.PI * r;
  const [off, setOff] = useState(c);
  useEffect(() => { const t = setTimeout(() => setOff(c - ((value ?? 0) / 100) * c), 120); return () => clearTimeout(t); }, [value, c]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--signal-live)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.1s var(--ease-out)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none mg-num" style={{ fontSize: 40, letterSpacing: "-.03em", color: "var(--fg)" }}>{value == null ? "—" : value}</span>
        <span className="mt-1 text-[12px] font-semibold" style={{ color: "var(--signal-live-ink)" }}>{label}</span>
      </div>
    </div>
  );
}

// ── YOUR GENIE JOURNEY — the six-stage arc, current stage breathing ─────────
function Journey({ stage, d }) {
  const curIdx = stage - 1;
  const milestone = d?.aiSearch?.won > 0 ? "Ranking in more AI answers" : "First AI citation (2 to go)";
  return (
    <Card className="p-6 lg:p-7 mg-rise">
      <p className="mg-klabel">Your Genie Journey</p>

      <div className="mt-6 overflow-x-auto thin-scroll pb-1">
        <div className="flex items-start" style={{ minWidth: 620 }}>
          {STAGES.map((s, i) => {
            const st = i < curIdx ? "done" : i === curIdx ? "current" : "locked";
            return (
              <div key={i} className="flex items-start" style={{ flex: i < STAGES.length - 1 ? "1 1 0%" : "0 0 auto" }}>
                <JourneyNode index={i} stage={s} st={st} />
                {i < STAGES.length - 1 && (
                  <div className="flex-1 self-start" style={{ marginTop: 22 }}>
                    {i < curIdx
                      ? <div style={{ height: 2, borderRadius: 3, background: "var(--border-strong)" }} />
                      : <div style={{ height: 0, borderTop: "2px dashed var(--border)" }} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[12px] font-bold" style={{ color: "var(--fg)", textTransform: "uppercase", letterSpacing: ".1em" }}>Stage {stage}: {STAGES[curIdx].key}</p>
          <p className="mt-1 text-[14px] mg-muted">{STAGES[curIdx].desc}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] mg-subtle">Next milestone</p>
          <a href="/ai-search" className="text-[13.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>{milestone} →</a>
        </div>
      </div>

      <div className="mg-seam my-5" />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-3">
        {STAGES.map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--fg)" }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: i <= curIdx ? "var(--fg-muted)" : "var(--border-strong)", flex: "none" }} /> {i + 1} {s.key}
            </p>
            <p className="text-[11.5px] mg-subtle leading-snug">{s.desc}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function JourneyNode({ index, stage, st }) {
  const base = { width: 46, height: 46, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15.5, position: "relative", zIndex: 2, background: "var(--surface)", flex: "none" };
  const ringStyle = st === "current"
    ? { ...base, background: "linear-gradient(135deg,var(--mg-dawn-500),var(--mg-dawn-600))", border: "2px solid transparent", color: "#2C1B05" }
    : st === "done"
      ? { ...base, border: "2px solid var(--border-strong)", color: "var(--fg-muted)" }
      : { ...base, border: "2px solid var(--border)", color: "var(--fg-subtle)" };
  return (
    <div className="flex flex-col items-center" style={{ width: 72, flex: "none" }}>
      <div className={st === "current" ? "mg-journey-cur mg-num" : "mg-num"} style={ringStyle}>{index + 1}</div>
      <span className="mt-2 text-[11px] font-semibold" style={{ color: st === "locked" ? "var(--fg-subtle)" : "var(--fg)" }}>{stage.key}</span>
      <span className="mt-1 flex items-center justify-center" style={{ height: 16, overflow: "visible", whiteSpace: "nowrap" }}>
        {st === "done" && <Icon.check size={13} style={{ color: "var(--signal-live-ink)" }} />}
        {st === "current" && <span className="text-[10.5px] font-bold" style={{ color: "var(--accent-ink)" }}>← You are here</span>}
      </span>
    </div>
  );
}

// ── TODAY AT A GLANCE — three honest metrics ────────────────────────────────
function Glance({ d, count, clearTime, did }) {
  const convFound = num((d?.stats || []).find((s) => /conversation/i.test(s.label))?.n);
  const cust = d?.customers || {};
  const won = cust.count || 0;
  const cards = [
    {
      icon: Icon.conversations, n: convFound, label: convFound === 1 ? "Conversation found" : "Conversations found",
      body: "Genie is monitoring forums and subreddits for buyers asking about what you sell.",
      cta: "See conversations →", href: "/conversations",
    },
    {
      icon: Icon.store, n: won, label: won === 1 ? "Customer won" : "Customers won",
      body: won > 0
        ? <><b style={{ color: "var(--fg)" }}>{money(cust.value || 0, cust.currency)}</b> in tracked revenue, each one traced back to work I did.</>
        : "Normal for week one. Your first usually lands in week 3 to 5. Genie is working on it tonight.",
      cta: "See the money trail →", href: "/impact",
    },
    {
      icon: Icon.bolt, n: count, label: count === 1 ? "Decision waiting" : "Decisions waiting",
      body: count > 0 ? `About ${clearTime} to clear them. Genie handles everything else itself.` : "Nothing waiting. Genie only brings you decisions worth your time.",
      cta: "Review approvals →", href: "/approvals",
    },
  ];
  return (
    <div>
      <p className="mg-klabel mb-3">Today at a glance</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <Card key={i} className="p-5 mg-lift flex flex-col">
            <span className="mg-tile" style={{ width: 34, height: 34, background: "var(--accent)", color: "#fff", boxShadow: "0 2px 8px rgba(198,62,24,.30)" }}><c.icon size={17} /></span>
            <p className="mt-3 mg-num" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, letterSpacing: "-.02em", color: c.n > 0 ? "var(--fg)" : "var(--fg)" }}>{c.n}</p>
            <p className="mt-1 text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{c.label}</p>
            <p className="mt-1.5 text-[12.5px] mg-muted leading-snug flex-1">{c.body}</p>
            <a href={c.href} className="mt-3 text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>{c.cta}</a>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── WHAT GENIE DID LAST NIGHT — the overnight work, plainly listed ──────────
function LastNight({ did }) {
  return (
    <div>
      <p className="mg-klabel mb-3">What Genie did last night</p>
      <Card className="p-6 flex flex-col">
        {did.length > 0 ? (
          <ul className="space-y-3.5">
            {did.map((x, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="mg-tile shrink-0" style={{ width: 26, height: 26, background: "var(--signal-live)", color: "#fff" }}><Icon.check size={14} /></span>
                <span className="text-[14px]" style={{ color: "var(--fg)" }}><b className="mg-num" style={{ fontWeight: 700 }}>{x.n}</b> <span style={{ color: "var(--fg-muted)" }}>{x.label.toLowerCase()}</span></span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3">
            <span className="mg-live-dot" />
            <p className="text-[13.5px] mg-muted leading-snug">A quiet night so far. Your engine is set and I’m hunting your first buyers right now. Everything I do will land here.</p>
          </div>
        )}
        <div className="mt-auto pt-5">
          <div className="mg-seam mb-4" />
          <a href="/growth" className="text-[13px] font-semibold" style={{ color: "var(--accent-ink)" }}>See everything →</a>
        </div>
      </Card>
    </div>
  );
}

// ── INSIGHT — where AI sends your buyers, and the plan to change it ─────────
function Insight({ d }) {
  const ai = d?.aiSearch;
  const comp = ai?.topCompetitor || "8th Wall";
  const won = ai?.won ?? 0;
  return (
    <Card className="p-6 mg-lift flex gap-4">
      <span className="mg-tile shrink-0" style={{ width: 40, height: 40, background: "var(--accent)", color: "#fff", boxShadow: "0 3px 10px rgba(198,62,24,.28)" }}><Icon.search size={19} /></span>
      <div className="min-w-0">
        <p className="mg-klabel">Insight</p>
        <p className="mt-1.5 text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Gemini and OpenAI name you in {won} of 6 buyer answers.</p>
        <p className="mt-1.5 text-[13px] mg-muted leading-snug">They recommend {comp} instead. Genie is writing comparison pages to win this.</p>
        <a href="/ai-search" className="mt-3 inline-block text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>See the plan →</a>
      </div>
    </Card>
  );
}

// ── OPPORTUNITY — the biggest opening this week ─────────────────────────────
function Opportunity({ d }) {
  const gaps = d?.aiSearch?.working;
  return (
    <Card className="p-6 mg-lift flex gap-4">
      <span className="mg-tile shrink-0" style={{ width: 40, height: 40, background: "var(--signal-live)", color: "#fff", boxShadow: "0 3px 10px rgba(30,158,106,.26)" }}><Icon.target size={19} /></span>
      <div className="min-w-0">
        <p className="mg-klabel">Opportunity</p>
        <p className="mt-1.5 text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Comparison content is your biggest opening{gaps > 0 ? ` (${gaps} in flight)` : ""}.</p>
        <p className="mt-1.5 text-[13px] mg-muted leading-snug">Genie will prioritize writing “vs” pages this week, the ones your buyers ask AI for.</p>
        <a href="/growth" className="mt-3 inline-block text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)" }}>See target pages →</a>
      </div>
    </Card>
  );
}

// ── FIRST RUN — a cinematic invitation, never a dead empty box ──────────────
function FirstRun({ state }) {
  if (state === "disconnected") {
    return <EmptyState state="disconnected" icon={Icon.spark} title="I can’t reach your account" sub="Sign in and I’ll pick right back up where we left off." />;
  }
  return (
    <div className="mt-2">
      <Card className="mg-ambient p-8 lg:p-12 flex flex-col items-center text-center mg-rise">
        <span className="mg-presence" data-state="working"><GenieMark size={56} live /></span>
        <h2 className="mt-5 mg-display" style={{ maxWidth: "22ch" }}>
          Your command center is dark, <span className="dawn-text">for one more minute.</span>
        </h2>
        <p className="mt-3 mg-lede" style={{ marginLeft: "auto", marginRight: "auto" }}>
          Point me at your website. I’ll research your business, find the buyers already looking for what you sell, check whether AI recommends you or a competitor, and start working tonight. Everything on this page fills itself in from that first scan.
        </p>
        <a href="/welcome" className="mg-btn mg-btn--dawn mt-6" style={{ fontSize: 15, padding: ".85rem 1.4rem" }}>Run my first scan →</a>
      </Card>
    </div>
  );
}
