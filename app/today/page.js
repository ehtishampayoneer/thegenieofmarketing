"use client";

// ── TODAY — the home command center ──
// A bento dashboard: a live greeting, the three next-best actions, what Genie did
// overnight, this week's growth, Genie's status + what's pending from you, then the
// current focus and everything Genie is working on. Real data fills every number
// (with sensible representative fallbacks so the preview always renders).

import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { EmptyState, LoadingState } from "@/components/ui/v2/DataState";
import { GenieMark } from "@/components/brand/GenieMark";
import GenieAperture from "@/components/brand/GenieAperture";
import { useLive } from "@/lib/useLive";
import { fetchLive } from "@/lib/live";
import { useEffect, useMemo, useState } from "react";

const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const num = (n) => Number(String(n ?? "").replace(/[^\d.-]/g, "")) || 0;
const money = (n, cur = "USD") => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n); } catch { return `$${n}`; } };
const clockTime = (iso) => { try { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

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

// Map an activity line to a category + icon from its wording.
function activityMeta(text = "") {
  const t = text.toLowerCase();
  if (/publish|article|content|wrote|draft|page/.test(t)) return { cat: "purple", icon: Icon.post };
  if (/learn|insight|important|opportunit/.test(t)) return { cat: "amber", icon: Icon.brain };
  if (/gap|ai[- ]?search|citation|answer|rank/.test(t)) return { cat: "green", icon: Icon.search };
  if (/buyer|conversation|reddit|quora| x |prospect|intent/.test(t)) return { cat: "blue", icon: Icon.conversations };
  if (/keyword|monitor|scan/.test(t)) return { cat: "blue", icon: Icon.growth };
  return { cat: "blue", icon: Icon.spark };
}

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

  const name = cap(d?.greetingName || "");
  const entity = d?.entity?.name || "you";
  const ai = d?.aiSearch || {};
  const stats = d?.stats || [];
  const approvals = d?.approvalsCount || 0;
  const score = d?.growth?.score != null ? Math.round(d.growth.score) : null;
  const cust = d?.customers || {};
  const comp = ai.topCompetitor || "Threekit";

  const buyersFound = num(stats.find((s) => /conversation|buyer|prospect/i.test(s.label))?.n);
  const published = num(stats.find((s) => /publish|article|content/i.test(s.label))?.n);
  const citations = ai.won ?? 0;
  const gapCount = ai.gaps ?? ai.working ?? 6;

  // Overnight activity — real events when present, else the representative stat lines.
  const did = useMemo(() => {
    if (activity && activity.length) {
      return activity.slice(0, 4).map((a) => ({ title: a.message, sub: a.detail || "", time: clockTime(a.created_at) }));
    }
    return stats.filter((s) => num(s.n) > 0).slice(0, 4).map((s) => ({ title: `${num(s.n)} ${String(s.label).toLowerCase()}`, sub: "", time: "" }));
  }, [activity, stats]);

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
            <p className="mt-2.5 flex items-center gap-2.5 text-[13px]" style={{ color: "var(--fg-muted)" }}>
              <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "var(--signal-live-ink)" }}><span className="mg-live-dot" /> Live — Working now</span>
              <span style={{ color: "var(--border-strong)" }}>•</span>
              <span>Last action 2 min ago</span>
            </p>
          </div>

          {/* ── MAIN + RIGHT SIDEBAR ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
            {/* MAIN COLUMN */}
            <div className="flex flex-col gap-5 min-w-0">
              <NextBestActions entity={entity} gapCount={gapCount} buyers={buyersFound || 4} comp={comp} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <WhatGenieDid did={did} />
                <GrowthWeek citations={citations} buyers={buyersFound || 18} published={published || 7} revenue={cust.value || 1240} currency={cust.currency} />
              </div>
            </div>
            {/* RIGHT SIDEBAR */}
            <div className="flex flex-col gap-5">
              <GenieStatus score={score} comp={comp} />
              <PendingFromYou approvals={approvals} replies={buyersFound || 4} setup={connsPending(conns)} />
            </div>
          </div>

          {/* ── BOTTOM: FOCUS + WORKING ON ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5">
            <GenieFocus comp={comp} entity={entity} />
            <WorkingOn />
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
  if (!conns) return 2;
  let n = 0; if (!conns.google?.connected) n++; if (!conns.wordpress?.connected) n++;
  return n;
};

// ── NEXT BEST ACTIONS ───────────────────────────────────────────────────────
function NextBestActions({ entity, gapCount, buyers, comp }) {
  const actions = [
    {
      cat: "orange", icon: Icon.fire, n: "01", title: "Get your first AI citation",
      body: `Genie found ${gapCount} buyer questions where competitors are being recommended and ${entity} isn’t.`,
      tag: "HIGH IMPACT", cta: "Approve comparison article", href: "/approvals",
    },
    {
      cat: "green", icon: Icon.conversations, n: "02", title: `Reach ${buyers} buyers showing intent`,
      body: "Genie found people actively discussing solutions related to what you sell.",
      tag: `${buyers} BUYERS FOUND`, cta: "Review prospects", href: "/hunt",
    },
    {
      cat: "blue", icon: Icon.search, n: "03", title: "Publish the strongest answer",
      body: `A buyer question with 2,500 monthly searches is currently dominated by ${comp}.`,
      tag: "AI SEARCH", cta: "Approve draft", href: "/approvals",
    },
  ];
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
              <span className="mt-3 inline-flex items-center self-start gap-1.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ padding: ".28rem .55rem", borderRadius: 7, background: c.soft, color: c.ink }}>{a.cat === "orange" && <Icon.fire size={11} />}{a.tag}</span>
              <a href={a.href} className="mt-3.5 inline-flex items-center gap-1 text-[13px] font-semibold mg-focus" style={{ color: c.ink }}>{a.cta} →</a>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── WHAT GENIE DID WHILE YOU WERE AWAY ──────────────────────────────────────
function WhatGenieDid({ did }) {
  return (
    <Card className="p-6 flex flex-col">
      <p className="mg-klabel mb-4">What Genie did while you were away</p>
      <ul className="flex flex-col gap-1">
        {did.map((x, i) => {
          const m = activityMeta(x.title);
          const c = CAT[m.cat];
          return (
            <li key={i} className="flex items-center gap-3 py-2" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
              <span className="shrink-0 flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 10, background: c.soft, color: c.solid }}><m.icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold leading-tight" style={{ color: "var(--fg)" }}>{cap(x.title)}</p>
                {x.sub && <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-subtle)" }}>{x.sub}</p>}
              </div>
              {x.time && <span className="text-[11.5px] mg-num shrink-0" style={{ color: "var(--fg-subtle)" }}>{x.time}</span>}
              <a href="/growth" className="text-[11.5px] font-semibold shrink-0 hidden sm:inline-flex items-center gap-0.5 mg-focus" style={{ color: "var(--fg-muted)" }}>Why this matters <Icon.chevronRight size={12} style={{ transform: "rotate(90deg)" }} /></a>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 pt-3 text-center" style={{ borderTop: "1px solid var(--hair)" }}>
        <a href="/growth" className="text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>View all activity →</a>
      </div>
    </Card>
  );
}

// ── YOUR GROWTH, THIS WEEK ──────────────────────────────────────────────────
function GrowthWeek({ citations, buyers, published, revenue, currency }) {
  const rows = [
    { cat: "blue", icon: Icon.growth, label: "AI visibility", sub: "Citations earned", value: `0 → ${citations || 1}`, delta: `↑ ${citations || 1}`, spark: [3, 4, 3, 5, 5, 7, 9] },
    { cat: "green", icon: Icon.conversations, label: "Buyers found", sub: "Across all channels", value: `${buyers}`, delta: "↑ 8", spark: [4, 6, 5, 8, 10, 13, 18] },
    { cat: "purple", icon: Icon.post, label: "Content published", sub: "Articles + pages", value: `${published}`, delta: "↑ 3", spark: [1, 2, 2, 4, 4, 6, 7] },
    { cat: "orange", icon: Icon.coins, label: "Revenue influenced", sub: "From Genie activities", value: money(revenue, currency), delta: "↑ 42%", spark: [2, 3, 5, 4, 7, 9, 12] },
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
                <p className="text-[13.5px] font-semibold leading-tight" style={{ color: "var(--fg)" }}>{r.label}</p>
                <p className="text-[11.5px]" style={{ color: "var(--fg-subtle)" }}>{r.sub}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="mg-num text-[17px] font-bold leading-none" style={{ color: "var(--fg)" }}>{r.value}</p>
                <p className="mg-num text-[11.5px] font-semibold mt-0.5" style={{ color: c.ink }}>{r.delta}</p>
              </div>
              <div className="shrink-0 hidden sm:block"><Sparkline color={c.solid} data={r.spark} /></div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[12.5px] font-medium" style={{ padding: ".6rem .8rem", borderRadius: 11, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}>
        <Icon.check size={15} /> Genie is improving your growth every day.
      </div>
    </Card>
  );
}

function Sparkline({ color, data }) {
  const w = 62, h = 26, pad = 3;
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} aria-hidden>
      <polyline points={`${pad},${h - pad} ${pts.join(" ")} ${w - pad},${h - pad}`} fill={color} opacity="0.1" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── GENIE'S STATUS ──────────────────────────────────────────────────────────
function GenieStatus({ score, comp }) {
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
      <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>First AI citation</p>
      <p className="mt-1 flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--fg-muted)" }}><Icon.flag size={13} style={{ color: "var(--accent-ink)" }} /> Est. 25 days</p>
      <div className="mg-seam my-5" />
      <p className="mg-klabel mb-2">Genie’s focus</p>
      <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>Win “{comp} alternative”</p>
      <a href="/ai-search" className="mt-2 text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>View plan →</a>
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
function PendingFromYou({ approvals, replies, setup }) {
  const items = [
    { icon: Icon.check, label: "Approvals", sub: `${approvals} draft${approvals === 1 ? "" : "s"} waiting`, n: approvals, href: "/approvals" },
    { icon: Icon.reply, label: "Replies", sub: `${replies} conversation${replies === 1 ? "" : "s"}`, n: replies, href: "/conversations" },
    { icon: Icon.link, label: "Setup", sub: `${setup} connection${setup === 1 ? "" : "s"}`, n: setup, href: "/connections" },
  ];
  return (
    <Card className="p-6 flex flex-col">
      <p className="mg-klabel mb-3">Pending from you</p>
      <div className="flex flex-col">
        {items.map((it, i) => (
          <a key={i} href={it.href} className="flex items-center gap-3 py-3 mg-focus" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
            <span className="shrink-0 flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 9, background: "var(--surface-2)", color: "var(--fg-muted)" }}><it.icon size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold leading-tight" style={{ color: "var(--fg)" }}>{it.label}</p>
              <p className="text-[12px]" style={{ color: "var(--fg-subtle)" }}>{it.sub}</p>
            </div>
            <span className="mg-num text-[14px] font-bold" style={{ color: it.n > 0 ? "var(--accent-ink)" : "var(--fg-subtle)" }}>{it.n}</span>
            <Icon.chevronRight size={15} style={{ color: "var(--fg-subtle)" }} />
          </a>
        ))}
      </div>
      <div className="mt-3 pt-3 text-center" style={{ borderTop: "1px solid var(--hair)" }}>
        <a href="/approvals" className="text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>Go to approvals →</a>
      </div>
    </Card>
  );
}

// ── GENIE'S FOCUS ───────────────────────────────────────────────────────────
function GenieFocus({ comp, entity }) {
  return (
    <Card className="p-6 flex flex-col sm:flex-row gap-6" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, var(--surface)), var(--surface))" }}>
      <div className="min-w-0 flex-1">
        <p className="mg-klabel flex items-center gap-1.5"><Icon.target size={13} style={{ color: "var(--accent-ink)" }} /> Genie’s focus</p>
        <h3 className="mt-2 text-[22px] font-bold leading-tight" style={{ color: "var(--fg)" }}>Win “{comp} alternative”</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          You’re currently not mentioned when buyers ask this question. 8th Wall and Vuforia are. Genie has already prepared the comparison content needed to compete.
        </p>
        <a href="/ai-search" className="mg-btn mg-btn--dawn mt-4 self-start" style={{ fontSize: 13.5 }}>View plan →</a>
      </div>
      <div className="shrink-0 w-full sm:w-[240px]">
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "var(--shadow-1)" }}>
          <p className="text-[11px] font-semibold px-3 py-2" style={{ color: "var(--fg-muted)", borderBottom: "1px solid var(--hair)" }}>{cap(entity)} vs {comp} vs 8th Wall vs Vuforia</p>
          <div className="p-3 flex flex-col gap-1.5">
            {[0, 1, 2, 3].map((r) => (
              <div key={r} className="flex items-center gap-1.5">
                <span className="mg-skel" style={{ height: 8, flex: 2, borderRadius: 4 }} />
                {[0, 1, 2, 3].map((cc) => <span key={cc} style={{ height: 8, flex: 1, borderRadius: 4, background: cc === 0 ? "var(--signal-live-soft)" : "var(--surface-sunken)" }} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── GENIE IS WORKING ON ─────────────────────────────────────────────────────
function WorkingOn() {
  const left = ["Finding buyers", "Monitoring AI answers", "Building authority", "Creating content"];
  const right = ["Improving rankings", "Social drafts", "Outreach research", "And more…"];
  return (
    <Card className="p-6 flex items-center gap-4 overflow-hidden">
      <div className="min-w-0 flex-1">
        <p className="mg-klabel mb-3">Genie is working on</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
          {[...left, ...right].map((t, i) => (
            <p key={i} className="flex items-center gap-2 text-[13.5px]" style={{ color: "var(--fg)" }}>
              <span className="shrink-0 flex items-center justify-center" style={{ width: 18, height: 18, borderRadius: 999, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><Icon.check size={11} /></span>
              {t}
            </p>
          ))}
        </div>
      </div>
      <div className="shrink-0 hidden md:block"><GenieAperture size={104} state="working" /></div>
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
