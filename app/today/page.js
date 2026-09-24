"use client";

// ── TODAY — the home command center ──
// The claim, the proof, the ask, the results, in that order:
//   • a live greeting
//   • the work band — the globe, with the teams that are actually working on it
//   • the three next-best actions, and what is waiting on you
//   • the floor — what the crowd argued about and what the engines shipped, live
//   • traffic, this week's growth, the score
// Two blocks used to sit here restating "Genie is busy" from a hardcoded list and
// from reformatted stats, plus a focus card with invented competitor copy. The
// floor does that job from real records, so they are gone: everything on this
// page is now counted from something that happened.

import OperatorShell from "@/components/shell/v2/OperatorShell";
import WorkBand from "@/components/today/WorkBand";
import { Floor } from "@/components/team/Floor";
import { useSwarm } from "@/lib/useSwarm";
import FirstResults from "@/components/today/FirstResults";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { EmptyState, LoadingState } from "@/components/ui/v2/DataState";
import { GenieMark } from "@/components/brand/GenieMark";
import { useLive } from "@/lib/useLive";
import { fetchLive, relTime } from "@/lib/live";
import { useEffect, useState } from "react";

const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const num = (n) => Number(String(n ?? "").replace(/[^\d.-]/g, "")) || 0;
const money = (n, cur = "USD") => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n); } catch { return `$${n}`; } };

// Category colours — Apple's system palette, so each metric / action / activity
// carries its own hue and the dashboard reads at a glance. `ink` uses Apple's
// accessible variants (safe for text on white); `soft` is the tinted tile.
// Driven by CSS custom properties set per theme just below, so these no longer
// burn a light-mode tint onto a black card in Dark.
const CAT = {
  orange: { ink: "var(--cat-orange-ink)", solid: "var(--cat-orange)", soft: "var(--cat-orange-soft)" },
  green:  { ink: "var(--cat-green-ink)",  solid: "var(--cat-green)",  soft: "var(--cat-green-soft)" },
  blue:   { ink: "var(--cat-blue-ink)",   solid: "var(--cat-blue)",   soft: "var(--cat-blue-soft)" },
  purple: { ink: "var(--cat-purple-ink)", solid: "var(--cat-purple)", soft: "var(--cat-purple-soft)" },
  amber:  { ink: "var(--cat-amber-ink)",  solid: "var(--cat-amber)",  soft: "var(--cat-amber-soft)" },
};
const TIERS = [
  { min: 0, label: "Starting out" }, { min: 40, label: "Fair" }, { min: 55, label: "Good" },
  { min: 70, label: "Strong" }, { min: 85, label: "Dominating" },
];
const tierOf = (s) => { let cur = TIERS[0]; for (const t of TIERS) if (s >= t.min) cur = t; return cur; };

export default function TodayPage() {
  const { data: d, state } = useLive("/api/today", (j) => j.needsOnboarding || !j.entity);
  const [conns, setConns] = useState(null);
  const [activity, setActivity] = useState(null);
  useEffect(() => {
    (async () => {
      const c = await fetchLive("/api/connections/status");
      if (c.live && c.data?.integrations) setConns(c.data.integrations);
      const a = await fetchLive("/api/activity");
      if (a.live && Array.isArray(a.data?.activity)) setActivity(a.data.activity);
    })();
  }, []);

  const swarm = useSwarm(15000);
  // A nightly run that has not happened in 36 hours is a stopped run, not a
  // slow one: the schedule is daily and the job records its own completion.
  const staleRun = !!d?.lastRun && Date.now() - Date.parse(d.lastRun) > 36 * 3600 * 1000;
  const name = cap(d?.greetingName || "");
  const entity = d?.entity?.name || "you";
  const ai = d?.aiSearch || {};
  const stats = d?.stats || [];
  const approvals = d?.approvalsCount || 0;
  const score = d?.growth?.score != null ? Math.round(d.growth.score) : null;
  const cust = d?.customers || {};
  // Real or nothing: an invented competitor name is a lie on the first screen.
  const comp = ai.topCompetitor || null;

  const buyersFound = num(stats.find((s) => /conversation|buyer|prospect/i.test(s.label))?.n);
  const published = num(stats.find((s) => /publish|article|content/i.test(s.label))?.n);
  const citations = ai.won ?? 0;
  const gapCount = ai.gaps ?? ai.working ?? 0;

  return (
    <OperatorShell active="today">
      {state === "loading" ? (
        <LoadingState rows={4} />
      ) : state === "disconnected" || state === "empty" ? (
        <FirstRun state={state} />
      ) : (
        <div className="mg-stagger flex flex-col gap-5">
          {/* ── GREETING ── */}
          <div>
            <p className="text-[15px] font-medium" style={{ color: "var(--fg-muted)" }}>Good morning{name ? `, ${name}` : ""} <span aria-hidden>👋</span></p>
            <h1 className="mt-1 mg-display-lg">Genie is working on your growth.</h1>
            {/* Genie runs once a night. If the last one was more than a day and
                a half ago something has stopped, and the owner should hear it
                from Genie rather than work it out from a dashboard that never
                changes. */}
            {staleRun && (
              <p className="mt-2 text-[13px] flex items-start gap-2" style={{ color: "var(--signal-danger)" }}>
                <span aria-hidden>⚠️</span>
                <span style={{ color: "var(--fg-muted)" }}>
                  Genie hasn’t completed a run since <b style={{ color: "var(--fg)" }}>{relTime(d.lastRun)} ago</b>. It runs every night — if this stays stuck, check the cron on your deployment.
                </span>
              </p>
            )}
            {/* Last night ran out of time before it reached these. Saying which, in
                the words an owner would use, is the difference between "Genie is
                slow" and a decision they can actually make about their hosting. */}
            {d?.lastRunSkipped?.length > 0 && (
              <p className="mt-2 text-[13px] flex items-start gap-2">
                <span aria-hidden>⏱️</span>
                <span style={{ color: "var(--fg-muted)" }}>
                  Last night finished the main work but ran out of time for{" "}
                  <b style={{ color: "var(--fg)" }}>{d.lastRunSkipped.map(skipLabel).join(", ")}</b>. Everything else ran. This is your hosting plan&apos;s time limit, not a fault — it will try again tonight.
                </span>
              </p>
            )}
            <p className="mt-2.5 flex items-center gap-2.5 text-[13px]" style={{ color: "var(--fg-muted)" }}>
              <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "var(--signal-live-ink)" }}><span className="mg-live-dot" /> Live — Working now</span>
              {activity?.[0]?.created_at && (
                <>
                  <span style={{ color: "var(--border-strong)" }}>•</span>
                  <span>Last action {relTime(activity[0].created_at)}</span>
                </>
              )}
            </p>
          </div>

          {/* ── THE PROOF: the teams at work, under the claim ── */}
          <WorkBand s={swarm} business={entity} />

          {/* ── MAIN + RIGHT SIDEBAR ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
            {/* MAIN COLUMN */}
            <div className="flex flex-col gap-5 min-w-0">
              <NextBestActions entity={entity} gapCount={gapCount} buyers={buyersFound} comp={comp} approvals={approvals} />
              {/* What the teams are saying and doing, as it happens. The same
                  component as /team, shortened and without the filters. */}
              <Floor
                rows={swarm?.ticker} waiting={swarm?.waiting} ai={swarm?.ai} loaded={!!swarm}
                limit={14} filters={false} height={420} more="/team"
                title="What your team is doing" note="Your crowd's own words, your improvers' rewrites, and every job Genie finished."
              />
              <TrafficPanel />
              <GrowthWeek citations={citations} buyers={buyersFound} published={published} revenue={cust.value || 0} currency={cust.currency} />
            </div>
            {/* RIGHT SIDEBAR */}
            <div className="flex flex-col gap-5">
              <FirstResults />
              <GenieStatus score={score} comp={comp} won={citations} gaps={gapCount} />
              <PendingFromYou approvals={approvals} replies={buyersFound} setup={connsPending(conns)} broken={brokenConns(conns)} />
            </div>
          </div>

          <p className="mt-1 mb-1 flex items-center justify-center gap-2 text-[13px]" style={{ color: "var(--fg-subtle)" }}>
            <Lock /> Genie works while you focus on what matters. We’ll handle the marketing.
          </p>
        </div>
      )}
    </OperatorShell>
  );
}

const connsPending = (conns) => {
  if (!conns) return 0;
  let n = 0; if (!conns.google?.connected) n++; if (!conns.wordpress?.connected) n++;
  // A connection that has stopped working needs a human just as much as one that
  // was never made, and it is the more urgent of the two.
  return n + brokenConns(conns).length;
};

// Connected once, dead now. lib/google.js marks these when Google ends the grant.
const brokenConns = (conns) => {
  if (!conns) return [];
  return Object.values(conns).filter((c) => c?.broken && c?.connected).map((c) => c.label)
    .filter((l, i, a) => a.indexOf(l) === i);
};

// ── NEXT BEST ACTIONS ───────────────────────────────────────────────────────
// Every card here must be backed by something Genie really found. A card with no
// real number behind it is an advert for itself, and the first screen is exactly
// where that costs the owner's trust.
function NextBestActions({ entity, gapCount, buyers, comp, approvals }) {
  const actions = [];
  if (approvals > 0) actions.push({
    cat: "orange", icon: Icon.fire, n: String(actions.length + 1).padStart(2, "0"),
    title: `Approve ${approvals} ${approvals === 1 ? "draft" : "drafts"}`,
    body: "Each one was tested by 1,000 simulated customers and improved before it reached you. Nothing goes out until you approve it.",
    tag: "WAITING FOR YOU", cta: "Open Approvals", href: "/approvals",
  });
  if (buyers > 0) actions.push({
    cat: "green", icon: Icon.conversations, n: String(actions.length + 1).padStart(2, "0"),
    title: `Reach ${buyers} ${buyers === 1 ? "buyer" : "buyers"} showing intent`,
    body: "Real people discussing what you sell, with your reply already drafted.",
    tag: `${buyers} FOUND`, cta: "Open Buyer Hunt", href: "/hunt",
  });
  if (gapCount > 0) actions.push({
    cat: "blue", icon: Icon.search, n: String(actions.length + 1).padStart(2, "0"),
    title: "Win the answers AI gives",
    body: `${gapCount} buyer ${gapCount === 1 ? "question where AI recommends someone else" : "questions where AI recommends someone else"}${comp ? `, usually ${comp}` : ""}, and not ${entity}.`,
    tag: "AI SEARCH", cta: "See the gaps", href: "/ai-search",
  });
  if (!actions.length) actions.push({
    cat: "green", icon: Icon.check, n: "01", title: "Nothing needs you right now",
    body: "Genie is working. New drafts, buyers and places to get featured arrive overnight.",
    tag: "ALL CLEAR", cta: "See what it is doing", href: "/team",
  });
  return (
    <div>
      <p className="mg-klabel mb-3"><Icon.spark size={13} style={{ color: "var(--accent-ink)" }} /> Your next best actions</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {actions.map((a, i) => {
          const c = CAT[a.cat];
          return (
            <Card key={i} className="p-5 mg-lift flex flex-col">
              <div className="flex items-start justify-between">
                <span className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 11, background: c.soft, color: c.solid }}><a.icon size={19} /></span>
                <Icon.chevronRight size={16} style={{ color: "var(--fg-subtle)", opacity: .5, transform: "rotate(90deg)" }} />
              </div>
              <p className="mt-3.5 mg-num text-[13px] font-bold" style={{ color: c.ink, letterSpacing: ".02em" }}>{a.n}</p>
              <p className="mt-0.5 text-[16px] font-bold leading-snug" style={{ color: "var(--fg)" }}>{a.title}</p>
              <p className="mt-1.5 text-[13px] leading-snug flex-1" style={{ color: "var(--fg-muted)" }}>{a.body}</p>
              <span className="mt-3 inline-flex items-center self-start gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ padding: ".28rem .55rem", borderRadius: 7, background: c.soft, color: c.ink }}>{a.cat === "orange" && <Icon.fire size={11} />}{a.tag}</span>
              <a href={a.href} className="mt-3.5 inline-flex items-center gap-1 text-[13px] font-semibold mg-focus" style={{ color: c.ink }}>{a.cta} →</a>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── YOUR GROWTH, THIS WEEK ──────────────────────────────────────────────────
// ── TRAFFIC ON YOUR OWN SITE ─────────────────────────────────────────────────
// How many people visited today, yesterday and across the week. Counted
// first-party by Genie's own embed, so it works from the moment the snippet is
// pasted with no Google Analytics connection and nothing to backfill.
//
// Honest by construction: until the snippet is installed this shows the install
// prompt rather than a zeroed chart pretending to be data. "Visitors" is
// distinct tab-sessions, which is close to people but not identical, and the
// label says so rather than overclaiming.
function TrafficPanel() {
  const [t, setT] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    (async () => {
      const r = await fetchLive(`/api/traffic?tz=${new Date().getTimezoneOffset()}`);
      if (r.live && r.data?.ok) { setT(r.data); setState(r.data.installed ? "ready" : "empty"); }
      else setState("empty");
    })();
  }, []);

  if (state === "loading") {
    return <Card className="p-6"><div className="mg-skel" style={{ height: 96, borderRadius: 12 }} /></Card>;
  }

  if (state === "empty") {
    return (
      <Card className="p-6">
        <p className="mg-klabel">Traffic on your website</p>
        <p className="mt-2 text-[14px] mg-muted" style={{ maxWidth: "var(--measure)" }}>
          Paste one line into your site and Genie will count every visitor for you, catch the ones who are not ready to buy, and send the rest to your buy page.
        </p>
        <a href="/settings" className="mg-btn mg-btn--dawn mt-3 inline-flex" style={{ fontSize: 13 }}>Get my snippet</a>
      </Card>
    );
  }

  const peak = Math.max(1, ...t.days.map((d) => d.views));
  const up = t.change != null && t.change >= 0;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="mg-klabel">Traffic on your website</p>
        <span className="mg-verified">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
          Counted by Genie
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <TrafficStat label="Today" views={t.today.views} visitors={t.today.visitors} accent
          note={t.change == null ? null : `${up ? "↑" : "↓"} ${Math.abs(t.change)}% vs yesterday`} good={up} />
        <TrafficStat label="Yesterday" views={t.yesterday.views} visitors={t.yesterday.visitors} />
        <TrafficStat label="Last 7 days" views={t.week.views} visitors={t.week.visitors} />
      </div>

      {/* Seven-day shape. The bars carry the trend; the numbers above carry the value. */}
      <div className="mt-5 flex items-end gap-1.5" style={{ height: 56 }} aria-hidden>
        {t.days.map((d, i) => (
          <div key={d.date} className="flex-1 rounded-t"
               title={`${d.date}: ${d.views} views`}
               style={{
                 height: `${Math.max(3, (d.views / peak) * 100)}%`,
                 background: i === t.days.length - 1 ? "var(--cat-blue)" : "var(--cat-blue-soft)",
                 minWidth: 6,
               }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] mg-subtle">
        <span>7 days ago</span><span>Today</span>
      </div>

      {(t.leads.week > 0 || t.topSources.length > 0) && (
        <div className="mt-4 pt-4 flex items-center gap-4 flex-wrap" style={{ borderTop: "1px solid var(--hair)" }}>
          {t.leads.week > 0 && (
            <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              <b style={{ color: "var(--fg)" }}>{t.leads.week}</b> {t.leads.week === 1 ? "lead" : "leads"} caught this week
            </span>
          )}
          {t.topSources.length > 0 && (
            <span className="text-[13px] mg-subtle">
              Mostly from <b style={{ color: "var(--fg-muted)" }}>{t.topSources[0].source}</b>
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

function TrafficStat({ label, views, visitors, note, good, accent }) {
  return (
    <div>
      <p className="text-[12px] mg-subtle">{label}</p>
      <p className="mg-num text-[24px] font-bold leading-none mt-1"
         style={{ color: accent ? "var(--cat-blue-ink)" : "var(--fg)" }}>{views.toLocaleString()}</p>
      <p className="text-[12px] mg-subtle mt-1">{visitors.toLocaleString()} {visitors === 1 ? "visitor" : "visitors"}</p>
      {note && (
        <p className="text-[12px] font-semibold mt-1"
           style={{ color: good ? "var(--signal-live-ink)" : "var(--fg-muted)" }}>{note}</p>
      )}
    </div>
  );
}

// Real counts only. Where a number is zero it says zero and why, because a
// decorated zero is the fastest way to lose an owner's trust in every other
// number on the page. No invented trend arrows, no drawn-from-nowhere charts.
function GrowthWeek({ citations, buyers, published, revenue, currency }) {
  const rows = [
    { cat: "blue", icon: Icon.growth, label: "AI answers naming you", sub: citations ? "Buyer questions won" : "None yet: Genie is writing the answers", value: `${citations}` },
    { cat: "green", icon: Icon.conversations, label: "Buyers found", sub: buyers ? "Across Reddit, Quora and the web" : "None this week", value: `${buyers}` },
    { cat: "purple", icon: Icon.post, label: "Content published", sub: published ? "Articles and pages live" : "Approve a draft to publish the first", value: `${published}` },
    { cat: "orange", icon: Icon.coins, label: "Revenue traced to Genie", sub: revenue ? "From connected payments" : "Connect payments to trace sales", value: money(revenue, currency) },
  ];
  return (
    <Card className="p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <p className="mg-klabel">Your growth, this week</p>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>This week <Icon.chevronRight size={13} style={{ transform: "rotate(90deg)" }} /></span>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => {
          const c = CAT[r.cat];
          return (
            <div key={i} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
              <span className="shrink-0 flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: c.soft, color: c.solid }}><r.icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-tight" style={{ color: "var(--fg)" }}>{r.label}</p>
                <p className="text-[12px]" style={{ color: "var(--fg-subtle)" }}>{r.sub}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="mg-num text-[17px] font-bold leading-none" style={{ color: "var(--fg)" }}>{r.value}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[13px] font-medium" style={{ padding: ".6rem .8rem", borderRadius: 11, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}>
        <Icon.check size={15} /> Counted from real work. Nothing here is estimated.
      </div>
    </Card>
  );
}


// ── GENIE'S STATUS ──────────────────────────────────────────────────────────
function GenieStatus({ score, comp, won = 0, gaps = 0 }) {
  // The milestone is read off the real AI-search numbers. It used to say
  // "First AI citation · Est. 25 days" to everyone, forever — a date Genie had
  // no way of knowing.
  const milestone = won > 0
    ? { title: `${won} AI answer${won === 1 ? "" : "s"} won`, sub: gaps ? `${gaps} more question${gaps === 1 ? "" : "s"} still name someone else.` : "Genie is watching for new questions." }
    : { title: "First AI citation", sub: gaps ? `${gaps} question${gaps === 1 ? "" : "s"} where AI names someone else. Genie is working on them.` : "Genie is finding the questions your buyers ask." };
  const tier = tierOf(score ?? 0);
  return (
    <Card className="p-6 flex flex-col">
      <p className="mg-klabel">Genie’s status</p>
      <div className="mt-4 flex flex-col items-center">
        <Gauge value={score} />
        <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--fg-muted)" }}>Growth Health</p>
        <p className="text-[15px] font-bold" style={{ color: "var(--signal-live-ink)" }}>{tier.label}</p>
      </div>
      <div className="mg-seam my-5" />
      <p className="mg-klabel mb-2">Next milestone</p>
      <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{milestone.title}</p>
      <p className="mt-1 flex items-start gap-1.5 text-[13px]" style={{ color: "var(--fg-muted)" }}><Icon.flag size={13} style={{ color: "var(--accent-ink)", marginTop: 3, flexShrink: 0 }} /> {milestone.sub}</p>
      {/* Only shown when Genie actually knows who you are losing to. */}
      {comp && (
        <>
          <div className="mg-seam my-5" />
          <p className="mg-klabel mb-2">Genie’s focus</p>
          <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>Win “{comp} alternative”</p>
          <a href="/ai-search" className="mt-2 text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>View plan →</a>
        </>
      )}
    </Card>
  );
}

function Gauge({ value, size = 132 }) {
  const stroke = 11;
  const r = size / 2 - stroke - 2, c = 2 * Math.PI * r;
  const [off, setOff] = useState(c);
  useEffect(() => { const t = setTimeout(() => setOff(c - ((value ?? 0) / 100) * c), 150); return () => clearTimeout(t); }, [value, c]);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--signal-live)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.1s var(--ease-out)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="mg-num font-bold leading-none" style={{ fontSize: 38, letterSpacing: "-.03em", color: "var(--fg)" }}>{value == null ? "—" : value}</span>
        <span className="mg-num text-[12px] font-semibold" style={{ color: "var(--fg-subtle)" }}>/100</span>
      </div>
    </div>
  );
}

// ── PENDING FROM YOU ────────────────────────────────────────────────────────
function PendingFromYou({ approvals, replies, setup, broken = [] }) {
  const items = [
    { icon: Icon.check, label: "Approvals", sub: `${approvals} draft${approvals === 1 ? "" : "s"} waiting`, n: approvals, href: "/approvals" },
    { icon: Icon.reply, label: "Replies", sub: `${replies} conversation${replies === 1 ? "" : "s"}`, n: replies, href: "/conversations" },
    { icon: Icon.link, label: "Setup", sub: `${setup} connection${setup === 1 ? "" : "s"}`, n: setup, href: "/connections" },
  ];
  return (
    <Card className="p-6 flex flex-col">
      <p className="mg-klabel mb-3">Pending from you</p>
      {/* A dead connection is not a number in a list. Nothing Genie does with
          Google works until this is fixed, so it says so, in full. */}
      {broken.length > 0 && (
        <a href="/connections" className="mg-focus rounded-xl p-3.5 mb-3 flex items-start gap-3"
          style={{ background: "var(--signal-danger-soft, var(--surface-2))", border: "1px solid var(--signal-danger)" }}>
          <span className="shrink-0" style={{ fontSize: 16, lineHeight: 1.2 }}>⚠️</span>
          <span className="min-w-0">
            <span className="block text-[14px] font-bold" style={{ color: "var(--fg)" }}>{broken.join(" and ")} stopped working</span>
            <span className="block text-[12.5px] mt-0.5" style={{ color: "var(--fg-muted)", lineHeight: 1.45 }}>
              Until you reconnect, Genie can’t read your real rankings, ask Google to index new pages, or send from your address. Reconnect →
            </span>
          </span>
        </a>
      )}
      <div className="flex flex-col">
        {items.map((it, i) => (
          <a key={i} href={it.href} className="flex items-center gap-3 py-3 mg-focus" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
            <span className="shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 9, background: "var(--surface-2)", color: "var(--fg-muted)" }}><it.icon size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold leading-tight" style={{ color: "var(--fg)" }}>{it.label}</p>
              <p className="text-[12px]" style={{ color: "var(--fg-subtle)" }}>{it.sub}</p>
            </div>
            <span className="mg-num text-[14px] font-bold" style={{ color: it.n > 0 ? "var(--accent-ink)" : "var(--fg-subtle)" }}>{it.n}</span>
            <Icon.chevronRight size={15} style={{ color: "var(--fg-subtle)" }} />
          </a>
        ))}
      </div>
      <div className="mt-3 pt-3 flex items-center justify-center gap-4 flex-wrap" style={{ borderTop: "1px solid var(--hair)" }}>
        <a href="/approvals" className="text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>Go to approvals →</a>
        {/* Results take weeks; proof of work is there on day two, and it is the
            reason someone is still here in week three. */}
        <a href="/worklog" className="text-[13px] mg-focus mg-muted">See everything I did</a>
      </div>
    </Card>
  );
}

function Lock() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ opacity: .7 }}><rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>;
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

// The nightly pass records what it skipped by its internal step name. An owner
// should never have to read "plan-revision" to find out what did not happen.
function skipLabel(name) {
  return ({
    spread: "preparing the other-platform versions of your newest article",
    listings: "finding new places to be listed",
    escalate: "helping a stuck keyword",
    pillar: "building a hub page",
    "gsc-setup": "finishing your Search Console setup",
    "site-check": "the weekly read of your own home page",
    calibrate: "checking the crowd against real results",
    "plan-revision": "looking for a correction to your plan",
  })[name] || name;
}
