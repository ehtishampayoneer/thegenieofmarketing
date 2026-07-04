"use client";

import { useState, useEffect } from "react";
import { hostOf } from "@/lib/business";

// components/report.js
// Shared report renderer — used by both the live homepage scan and the
// saved-scan detail view (/dashboard/scan/[id]).

function SinceLastScan({ c }) {
  const up = c.delta > 0;
  const flat = c.delta === 0;
  const when = (() => {
    try {
      return new Date(c.prevDate).toLocaleDateString(undefined, {
        month: "short", day: "numeric",
      });
    } catch {
      return "last time";
    }
  })();
  return (
    <div className="mt-5 bg-white border border-genie-purple/20 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-genie-purple">
          Since your last scan · {when}
        </p>
        <span
          className="text-sm font-bold"
          style={{ color: up ? "#059669" : flat ? "#6B7280" : "#EF4444" }}
        >
          {c.prevScore} → {c.newScore} ({c.delta >= 0 ? "+" : ""}{c.delta})
        </span>
      </div>
      {c.improved?.length > 0 && (
        <p className="mt-2 text-sm text-emerald-700">
          ✓ Fixed: {c.improved.join(", ")}
        </p>
      )}
      {c.regressed?.length > 0 && (
        <p className="mt-1 text-sm text-red-600">
          △ Slipped: {c.regressed.join(", ")}
        </p>
      )}
      {(!c.improved || c.improved.length === 0) &&
        (!c.regressed || c.regressed.length === 0) && (
          <p className="mt-2 text-sm text-genie-ink/55">
            No individual checks changed since last time — steady.
          </p>
        )}
    </div>
  );
}

export function Report({ data, loggedIn, saved, comparison, scanId }) {
  const { scores, ai, checks, finalUrl, speed, speedAvailable, accuracy, gsc } = data;
  const label = scoreLabel(scores.overall);
  const host = hostOf(finalUrl || "");

  const [tab, setTab] = useState("overview");
  const [revealed, setRevealed] = useState(false);
  const [actions, setActions] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/actions?status=proposed");
        const j = await res.json();
        if (active && j.ok) {
          const scoped = (j.actions || []).filter(
            (a) => (scanId && a.scan_id === scanId) || a.target?.host === host
          );
          setActions(sortByPriority(scoped));
        }
      } catch {}
    })();
    return () => { active = false; };
  }, [loggedIn, scanId, host]);

  const failing = checks.filter((c) => c.status !== "pass");
  const highImpactFails = failing.filter((c) => c.impact === "high" && c.status === "fail").length;
  const status = deriveStatus({ actions, overall: scores.overall, highImpactFails });

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "fixes", label: "Fixes", badge: failing.length },
    { id: "opportunities", label: "Opportunities" },
    { id: "content", label: "Content" },
    { id: "actions", label: "Actions", badge: actions.length },
  ];

  const goNext = () => setTab(actions.length ? "actions" : "fixes");

  return (
    <div
      className={`transition-all duration-700 ${
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
    >
      <p className="text-sm text-brand-violet/70 mb-3">
        ✨ Genie has analyzed your business. Here's your command center.
      </p>

      <IdentityTop
        ai={ai}
        host={prettyHost(finalUrl)}
        scores={scores}
        label={label}
        accuracy={accuracy}
        onNext={goNext}
      />

      {comparison && <SinceLastScan c={comparison} />}
      {!loggedIn && (
        <div className="mt-4 bg-surface2 border border-ink-900/[0.06] rounded-xl p-3 text-center text-sm">
          <a href="/login" className="text-brand-violet font-medium hover:underline">Sign in</a>
          <span className="text-ink-600"> to save this report and track your score over time.</span>
        </div>
      )}
      {loggedIn && saved && (
        <p className="mt-3 text-center text-sm text-emerald-600">✓ Saved to your history</p>
      )}

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === "overview" && (
          <OverviewTab data={data} actions={actions} failing={failing} highImpactFails={highImpactFails} setTab={setTab} />
        )}
        {tab === "fixes" && <FixesTab ai={ai} checks={checks} />}
        {tab === "opportunities" && <OpportunitiesTab data={data} />}
        {tab === "content" && <ContentEngine data={data} scanId={scanId} />}
        {tab === "actions" && <ActionsTab actions={actions} host={host} loggedIn={loggedIn} />}
      </div>
    </div>
  );
}

// ----- Genie Status Strip (defined state machine) -----
const STATUS_STATES = {
  idle: {
    cls: "bg-blue-50 border-blue-200 text-blue-800",
    icon: "🔵",
    msg: () => "Genie is idle — everything's reviewed. Run a new scan to give her work.",
  },
  pending_approval: {
    cls: "bg-amber-50 border-amber-200 text-amber-800",
    icon: "🟡",
    msg: (s) => `${s.count} item${s.count > 1 ? "s" : ""} waiting for your approval.`,
  },
  opportunity: {
    cls: "bg-emerald-50 border-emerald-200 text-emerald-800",
    icon: "🟢",
    msg: (s) => `Genie found ${s.count} high-impact fix${s.count > 1 ? "es" : ""} worth acting on — want to see them?`,
  },
  attention: {
    cls: "bg-red-50 border-red-200 text-red-800",
    icon: "🔴",
    msg: (s) => `Something needs attention: ${s.detail}`,
  },
  working: {
    cls: "bg-genie-purple/5 border-genie-purple/20 text-genie-purple",
    icon: "⏳",
    msg: () => "Genie is working…",
  },
};

function deriveStatus({ actions, overall, highImpactFails }) {
  if (actions.length > 0) return { state: "pending_approval", count: actions.length, actionable: true };
  if (overall < 40) return { state: "attention", detail: "your score is in the critical range", actionable: true };
  if (highImpactFails > 0) return { state: "opportunity", count: highImpactFails, actionable: true };
  return { state: "idle", actionable: false };
}

function StatusStrip({ status, onAct }) {
  const st = STATUS_STATES[status.state] || STATUS_STATES.idle;
  return (
    <div className={`mt-2 rounded-xl border px-4 py-3 flex items-center gap-3 ${st.cls}`}>
      <span className="text-lg leading-none">{st.icon}</span>
      <span className="text-sm font-medium flex-1">{st.msg(status)}</span>
      {status.actionable && (
        <button onClick={onAct} className="text-sm font-semibold underline whitespace-nowrap">
          View
        </button>
      )}
    </div>
  );
}

// ----- Identity top -----
function IdentityTop({ ai, host, scores, label, accuracy, onNext }) {
  return (
    <div className="mt-1 rounded-2xl p-6 shadow-lg grad-genie text-white overflow-hidden relative">
      <div className="flex items-center gap-6 flex-col sm:flex-row">
        <Ring value={scores.overall} onGradient />
        <div className="flex-1 text-center sm:text-left">
          <p className="text-xs uppercase tracking-widest text-white/60 break-all">{host}</p>
          <h1 className="text-2xl font-extrabold">{ai?.businessName || host}</h1>
          {[ai?.industry, ai?.subCategory].filter(Boolean).length > 0 && (
            <p className="text-sm text-white/70">
              {[ai?.industry, ai?.subCategory].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="mt-1 text-sm font-semibold text-white/90">{label.text}</p>
          <button
            onClick={onNext}
            className="mt-4 bg-white text-brand-indigo font-semibold px-5 py-2.5 rounded-xl active:scale-[0.99] shadow-sm hover:shadow-md transition"
          >
            Show me what to do next →
          </button>
        </div>
      </div>
      {accuracy && <SlimAccuracy accuracy={accuracy} onGradient />}
    </div>
  );
}

function SlimAccuracy({ accuracy, onGradient }) {
  const muted = onGradient ? "text-white/60" : "text-ink-400";
  const strong = onGradient ? "text-white" : "text-ink-900";
  const track = onGradient ? "bg-white/20" : "bg-ink-900/10";
  return (
    <div className={`mt-5 pt-4 border-t ${onGradient ? "border-white/15" : "border-ink-900/5"}`}>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className={muted}>Genie accuracy</span>
        <span className={`font-mono font-semibold ${strong}`}>{accuracy.percent}%</span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${track}`}>
        <div
          className={onGradient ? "h-full bg-white" : "h-full grad-genie"}
          style={{ width: `${accuracy.percent}%`, transition: "width 1s ease" }}
        />
      </div>
    </div>
  );
}

// ----- Tab bar (scrollable pills on mobile) -----
function TabBar({ tabs, active, onChange }) {
  return (
    <div className="mt-5 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap text-sm font-medium px-4 py-2 rounded-full border transition ${
            active === t.id
              ? "grad-genie text-white border-transparent shadow-sm"
              : "bg-surface text-ink-600 border-ink-900/[0.08] hover:border-brand-violet/40"
          }`}
        >
          {t.label}
          {t.badge ? <span className="font-mono"> {t.badge}</span> : ""}
        </button>
      ))}
    </div>
  );
}

// ----- Overview tab (summarizes every other tab) -----
function OverviewTab({ data, actions, failing, highImpactFails, setTab }) {
  const { scores, speed, speedAvailable, ai, gsc } = data;
  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Bar label="SEO & Visibility" value={scores.seo} cat="seo" />
        <Bar label="Speed" value={scores.speed} cat="speed" />
        <Bar label="Trust" value={scores.trust} cat="trust" />
        <Bar label="Technical" value={scores.technical} cat="technical" />
        <Bar label="Social" value={scores.social} cat="social" />
      </div>
      {speed && (
        <div className="mt-3 flex flex-wrap gap-2 justify-center">
          <Metric label="Load (LCP)" value={speed.lcpSec != null ? speed.lcpSec + "s" : "—"} />
          <Metric label="Stability (CLS)" value={speed.cls != null ? speed.cls : "—"} />
          <Metric label="Speed" value={speed.performance + "/100"} />
        </div>
      )}
      {!speedAvailable && (
        <p className="mt-3 text-center text-xs text-genie-ink/40">
          ⚡ Speed score pending — add a PageSpeed key to measure real load time.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <SummaryCard title="Fixes" value={`${failing.length} to address`} sub={`${highImpactFails} high-impact`} onClick={() => setTab("fixes")} />
        <SummaryCard title="Opportunities" value="Discover growth →" onClick={() => setTab("opportunities")} />
        <SummaryCard title="Content" value="Genie can write for you →" onClick={() => setTab("content")} />
        <SummaryCard title="Actions" value={`${actions.length} pending`} onClick={() => setTab("actions")} />
      </div>

      {ai && <BusinessBrain ai={ai} gsc={gsc} />}
    </div>
  );
}

function SummaryCard({ title, value, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-genie-ink/10 rounded-xl p-4 hover:border-genie-purple/30 hover:shadow-sm transition"
    >
      <p className="text-xs uppercase tracking-wide text-genie-ink/45">{title}</p>
      <p className="text-sm font-semibold text-genie-ink mt-0.5">{value}</p>
      {sub && <p className="text-xs text-genie-ink/50">{sub}</p>}
    </button>
  );
}

// ----- Fixes tab -----
function FixesTab({ ai, checks }) {
  const fails = checks.filter((c) => c.status === "fail");
  const warns = checks.filter((c) => c.status === "warn");
  const passes = checks.filter((c) => c.status === "pass");
  return (
    <div>
      {ai?.topFixes?.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-genie-ink mb-2">🔥 Highest-impact fixes</h3>
          <div className="space-y-3">
            {ai.topFixes.map((f, i) => <FixCard key={i} fix={f} n={i + 1} />)}
          </div>
        </div>
      )}
      {fails.length > 0 && <CheckGroup title={`Failing (${fails.length})`} items={fails} />}
      {warns.length > 0 && <CheckGroup title={`Needs attention (${warns.length})`} items={warns} />}
      {passes.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-genie-purple font-medium">
            Passing ({passes.length})
          </summary>
          <div className="mt-2 space-y-1">
            {passes.map((c) => <CheckRow key={c.id} c={c} />)}
          </div>
        </details>
      )}
    </div>
  );
}

function CheckGroup({ title, items }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-genie-ink/45 mb-2">{title}</p>
      <div className="space-y-1">
        {items.map((c) => <CheckRow key={c.id} c={c} />)}
      </div>
    </div>
  );
}

function CheckRow({ c }) {
  return (
    <div className="flex items-start gap-3 bg-white border border-genie-ink/10 rounded-lg px-4 py-3">
      <span className="mt-0.5">{statusIcon(c.status)}</span>
      <div className="flex-1">
        <p className="font-medium text-genie-ink text-sm">{c.label}</p>
        <p className="text-sm text-genie-ink/60">{c.detail}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {c.status !== "pass" && c.difficulty && <Chip tone={difficultyTone(c.difficulty)}>{c.difficulty}</Chip>}
          {c.status !== "pass" && c.timeToFix && c.timeToFix !== "—" && <Chip>🕒 {c.timeToFix}</Chip>}
          {c.impactEstimate && <Chip tone="emerald">▲ {c.impactEstimate} est.</Chip>}
          {c.confidence != null && <Chip tone="muted">{c.confidence}% confidence</Chip>}
        </div>
      </div>
    </div>
  );
}

// ----- Opportunities tab -----
function OpportunitiesTab({ data }) {
  return (
    <div>
      {data.gsc?.available && <GscPanel gsc={data.gsc} />}
      <OpportunityEngine data={data} />
    </div>
  );
}

// ----- Actions tab -----
const PRIORITY_META = {
  high: { label: "High-impact", icon: "🔥", tone: "red" },
  quick_win: { label: "Quick win", icon: "⚡", tone: "green" },
  strategic: { label: "Strategic", icon: "🧠", tone: "default" },
  low: { label: "Low", icon: "💤", tone: "muted" },
  medium: { label: "Normal", icon: "", tone: "muted" },
};

function PriorityTag({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.medium;
  return <Chip tone={m.tone}>{m.icon ? m.icon + " " : ""}{m.label}</Chip>;
}

function sortByPriority(arr) {
  const order = { high: 0, quick_win: 1, strategic: 2, medium: 3, low: 4 };
  return [...arr].sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));
}

function actionIcon(t) {
  return t === "article" ? "📝" : t === "social_post" ? "📣" : t === "seo_fix" ? "🔧" :
    t === "outreach_email" ? "✉️" : t === "ad_campaign" ? "📢" : t === "distribution" ? "🌐" : "⚡";
}

function ActionsTab({ actions, host, loggedIn }) {
  if (!loggedIn) {
    return (
      <div className="bg-white border border-genie-ink/10 rounded-2xl p-6 text-center text-sm text-genie-ink/60">
        <a href="/login" className="text-genie-purple font-medium hover:underline">Sign in</a> to see and approve the actions Genie generates.
      </div>
    );
  }
  if (actions.length === 0) {
    return (
      <div className="bg-white border border-genie-ink/10 rounded-2xl p-6 text-center text-sm text-genie-ink/60">
        No pending actions yet. Generate an article or opportunities and they'll appear here for approval.
      </div>
    );
  }
  const bizParam = host ? `?business=${encodeURIComponent(host)}` : "";
  return (
    <div className="space-y-2">
      {actions.map((a) => (
        <a
          key={a.id}
          href={`/dashboard/action/${a.id}${bizParam}`}
          className="flex items-center gap-3 bg-white border border-genie-ink/10 rounded-xl px-3 py-3 hover:border-genie-purple/30 hover:shadow-sm transition"
        >
          <span className="text-lg">{actionIcon(a.type)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-genie-ink truncate">{a.title || a.type}</p>
            <p className="text-xs text-genie-ink/45 capitalize">{String(a.type).replace("_", " ")}</p>
          </div>
          <PriorityTag priority={a.priority} />
          <span className="text-xs text-genie-ink/30 hidden sm:inline">View →</span>
        </a>
      ))}
    </div>
  );
}

function Ring({ value, onGradient }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = onGradient ? "#FFFFFF" : scoreLabel(value).color;
  const track = onGradient ? "rgba(255,255,255,0.25)" : "#E5E7EB";
  return (
    <div className="relative inline-block">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke={track} strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-mono font-bold ${onGradient ? "text-white" : "text-ink-900"}`}>{value}</span>
        <span className={`text-xs ${onGradient ? "text-white/60" : "text-ink-400"}`}>/ 100</span>
      </div>
    </div>
  );
}

const CAT_COLOR = {
  seo: "#2563EB", speed: "#F59E0B", trust: "#059669",
  technical: "#7C3AED", social: "#DB2777", content: "#4F46E5",
};

function Bar({ label, value, cat }) {
  if (value === null || value === undefined) return null;
  const color = cat ? CAT_COLOR[cat] : scoreLabel(value).color;
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-xl px-4 py-3 shadow-xs">
      <div className="flex justify-between items-center text-sm font-medium text-ink-900">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-ink-900/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, background: color, transition: "width 1s ease" }}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-lg px-3 py-2 text-center shadow-xs">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="text-sm font-mono font-semibold text-ink-900">{value}</div>
    </div>
  );
}

function AccuracyBar({ accuracy }) {
  const { percent, sources } = accuracy;
  const meta = {
    verified: { tone: "green", icon: "✓", word: "Verified" },
    estimated: { tone: "amber", icon: "≈", word: "Estimated" },
    missing: { tone: "muted", icon: "○", word: "Not connected" },
  };
  return (
    <div className="mt-8 bg-white border border-genie-ink/10 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-genie-purple">Genie accuracy</p>
        <span className="text-lg font-extrabold text-genie-ink">{percent}%</span>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-genie-ink/10 overflow-hidden">
        <div
          className="h-full genie-gradient"
          style={{ width: `${percent}%`, transition: "width 1s ease" }}
        />
      </div>
      <p className="mt-2 text-sm text-genie-ink/55">
        Genie is working with partial data. Connecting your accounts raises accuracy
        and swaps estimates for exact numbers.
      </p>
      <div className="mt-4 space-y-2">
        {sources.map((s) => {
          const m = meta[s.status];
          return (
            <div key={s.key} className="flex items-center gap-3">
              <Chip tone={m.tone}>
                {m.icon} {m.word}
              </Chip>
              <span className="text-sm text-genie-ink/75 flex-1">{s.label}</span>
              {s.status === "missing" && s.unlock && (
                <span className="text-xs font-medium text-genie-purple/70 whitespace-nowrap">
                  {s.unlock} · +{s.gain}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BusinessBrain({ ai, gsc }) {
  const has = (v) => v && (Array.isArray(v) ? v.length > 0 : String(v).trim());
  const realKw = gsc?.available ? gsc.topQueries.slice(0, 8) : null;
  const subtitle = [ai.industry, ai.subCategory].filter(has).join(" · ");
  const metaLine = [ai.businessType, ai.primaryMarket && `${ai.primaryMarket} (est.)`]
    .filter(has)
    .join(" · ");

  return (
    <div className="mt-8 bg-white border border-genie-ink/10 rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-semibold text-genie-purple">What Genie sees</p>

      {has(ai.businessName) && (
        <p className="mt-2 text-lg font-bold text-genie-ink">{ai.businessName}</p>
      )}
      {has(subtitle) && <p className="text-sm text-genie-ink/60">{subtitle}</p>}
      {has(metaLine) && <p className="text-sm text-genie-ink/50 mt-0.5">{metaLine}</p>}
      {has(ai.summary) && (
        <p className="mt-3 text-genie-ink/80 leading-relaxed">{ai.summary}</p>
      )}

      <div className="mt-5 grid sm:grid-cols-2 gap-5">
        {has(ai.targetCustomer) && (
          <Section title="Target customer">
            <p className="text-sm text-genie-ink/75">{ai.targetCustomer}</p>
          </Section>
        )}

        {ai.brandVoice && (has(ai.brandVoice.tone) || has(ai.brandVoice.note)) && (
          <Section title="Brand voice">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {has(ai.brandVoice.tone) && <Chip tone="default">{ai.brandVoice.tone}</Chip>}
              {has(ai.brandVoice.formality) && (
                <Chip tone="muted">{ai.brandVoice.formality}</Chip>
              )}
            </div>
            {has(ai.brandVoice.note) && (
              <p className="text-sm text-genie-ink/75">{ai.brandVoice.note}</p>
            )}
          </Section>
        )}

        {has(ai.strengths) && (
          <Section title="Strengths">
            <ul className="space-y-1">
              {ai.strengths.map((s, i) => (
                <li key={i} className="text-sm text-genie-ink/75 flex gap-2">
                  <span className="text-emerald-600">✓</span> {s}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {has(ai.weaknesses) && (
          <Section title="Weaknesses">
            <ul className="space-y-1">
              {ai.weaknesses.map((w, i) => (
                <li key={i} className="text-sm text-genie-ink/75 flex gap-2">
                  <span className="text-amber-600">△</span> {w}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {realKw && realKw.length > 0 ? (
        <Section title="Keywords you rank for" verified className="mt-5">
          <div className="flex flex-wrap gap-1.5">
            {realKw.map((k, i) => (
              <Chip key={i} tone="green">
                {k.query} · #{Math.round(k.position)}
              </Chip>
            ))}
          </div>
        </Section>
      ) : (
        has(ai.keywordsToOwn) && (
          <Section title="Keywords to own" est className="mt-5">
            <div className="flex flex-wrap gap-1.5">
              {ai.keywordsToOwn.map((k, i) => (
                <Chip key={i} tone="default">{k}</Chip>
              ))}
            </div>
          </Section>
        )
      )}
      {realKw && realKw.length > 0 && has(ai.keywordsToOwn) && (
        <Section title="New keywords to target" est className="mt-5">
          <div className="flex flex-wrap gap-1.5">
            {ai.keywordsToOwn.map((k, i) => (
              <Chip key={i} tone="default">{k}</Chip>
            ))}
          </div>
        </Section>
      )}

      {has(ai.competitors) && (
        <Section title="Likely competitors" est className="mt-5">
          <ul className="space-y-1.5">
            {ai.competitors.map((c, i) => (
              <li key={i} className="text-sm text-genie-ink/75">
                <span className="font-medium text-genie-ink">{c.name}</span>
                {has(c.why) && <span className="text-genie-ink/55"> — {c.why}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children, est, verified, className = "" }) {
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-genie-ink/45 mb-1.5">
        {title}
        {est && (
          <span className="ml-1.5 normal-case tracking-normal text-genie-purple/60 font-medium">
            · estimated
          </span>
        )}
        {verified && (
          <span className="ml-1.5 normal-case tracking-normal text-emerald-600 font-medium">
            · verified
          </span>
        )}
      </p>
      {children}
    </div>
  );
}

function GscPanel({ gsc }) {
  const t = gsc.totals || {};
  return (
    <div className="mt-8 bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-emerald-700">
          Real Search Console data
        </p>
        <Chip tone="green">✓ verified</Chip>
      </div>
      <p className="text-xs text-genie-ink/50 mt-1">Last 28 days · {prettySite(gsc.site)}</p>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Clicks" value={fmt(t.clicks)} />
        <Metric label="Impressions" value={fmt(t.impressions)} />
        <Metric label="Avg CTR" value={`${t.ctr ?? 0}%`} />
        <Metric label="Avg position" value={t.position ?? "–"} />
      </div>

      {gsc.opportunities?.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-genie-ink/45 mb-2">
            🔥 Quick-win keyword opportunities
          </p>
          <div className="space-y-2">
            {gsc.opportunities.map((o, i) => (
              <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm font-medium text-genie-ink">“{o.query}”</p>
                <p className="text-xs text-genie-ink/70 mt-0.5">
                  Seen {fmt(o.impressions)} times, ranking #{Math.round(o.position)}, but only{" "}
                  {o.ctr}% click. Improving your title/meta could capture far more of these.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {gsc.topQueries?.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-emerald-700 font-medium">
            Top {Math.min(gsc.topQueries.length, 25)} keywords
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-genie-ink/45 text-xs">
                  <th className="text-left font-medium pb-2">Keyword</th>
                  <th className="text-right font-medium pb-2">Clicks</th>
                  <th className="text-right font-medium pb-2">Impr.</th>
                  <th className="text-right font-medium pb-2">CTR</th>
                  <th className="text-right font-medium pb-2">Pos.</th>
                </tr>
              </thead>
              <tbody>
                {gsc.topQueries.map((q, i) => (
                  <tr key={i} className="border-t border-genie-ink/5">
                    <td className="py-1.5 pr-2 text-genie-ink/80">{q.query}</td>
                    <td className="py-1.5 text-right text-genie-ink/70">{fmt(q.clicks)}</td>
                    <td className="py-1.5 text-right text-genie-ink/70">{fmt(q.impressions)}</td>
                    <td className="py-1.5 text-right text-genie-ink/70">{q.ctr}%</td>
                    <td className="py-1.5 text-right text-genie-ink/70">{Math.round(q.position)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function fmt(n) {
  if (n == null) return "–";
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}
function prettySite(s) {
  if (!s) return "";
  return s.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function OpportunityEngine({ data }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [opps, setOpps] = useState(null);
  const [err, setErr] = useState("");

  if (!data?.ai) return null;

  async function discover() {
    setState("loading");
    setErr("");
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalUrl: data.finalUrl,
          ai: data.ai,
          checks: data.checks,
          gsc: data.gsc,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setState("error");
        setErr(j.message || "Couldn't generate opportunities. Try again.");
        return;
      }
      setOpps(j.opportunities);
      setState("done");
    } catch {
      setState("error");
      setErr("Something interrupted it. Try again.");
    }
  }

  return (
    <div className="mt-8">
      {state !== "done" && (
        <div className="bg-white border border-genie-purple/20 rounded-2xl p-6 text-center shadow-sm">
          <p className="text-lg font-bold text-genie-ink">
            🚀 Discover your growth opportunities
          </p>
          <p className="mt-1 text-sm text-genie-ink/60 max-w-md mx-auto">
            Genie maps keyword, competitor, content, product & partnership
            opportunities — with estimated revenue upside.
          </p>
          <button
            onClick={discover}
            disabled={state === "loading"}
            className="mt-4 genie-gradient text-white font-semibold px-5 py-3 rounded-xl disabled:opacity-70"
          >
            {state === "loading" ? "Genie is thinking…" : "Find my opportunities →"}
          </button>
          {state === "error" && (
            <p className="mt-3 text-sm text-amber-700">{err}</p>
          )}
        </div>
      )}
      {state === "done" && opps && <OpportunityResults opps={opps} />}
    </div>
  );
}

function OpportunityResults({ opps }) {
  const has = (v) => v && (Array.isArray(v) ? v.length > 0 : true);
  const demandTone = (d) =>
    d === "High" ? "green" : d === "Medium" ? "amber" : "muted";

  return (
    <div className="bg-white border border-genie-ink/10 rounded-2xl p-6 shadow-sm">
      <h2 className="text-xl font-bold text-genie-ink">🚀 Growth opportunities</h2>

      {opps.totalOpportunity?.range && (
        <div className="mt-3 rounded-xl bg-gradient-to-r from-genie-purple/5 to-genie-emerald/5 border border-genie-ink/10 p-4">
          <p className="text-xs uppercase tracking-wide text-genie-ink/45">
            Total opportunity · estimated
          </p>
          <p className="text-2xl font-extrabold text-genie-ink mt-0.5">
            {opps.totalOpportunity.range}
          </p>
          {opps.totalOpportunity.basis && (
            <p className="text-sm text-genie-ink/55 mt-1">{opps.totalOpportunity.basis}</p>
          )}
        </div>
      )}

      {has(opps.verifiedKeywordWins) && (
        <Section title="Quick-win keywords" verified className="mt-5">
          <div className="space-y-2">
            {opps.verifiedKeywordWins.map((k, i) => (
              <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-sm font-medium text-genie-ink">“{k.keyword}”</p>
                <p className="text-xs text-genie-ink/70 mt-0.5">{k.detail}</p>
                <p className="text-xs text-emerald-700 mt-1">{k.action}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {has(opps.keywordOpportunities) && (
        <Section title="Keyword opportunities" est className="mt-5">
          <div className="space-y-2">
            {opps.keywordOpportunities.map((k, i) => (
              <div key={i} className="border border-genie-ink/10 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-genie-ink">{k.keyword}</p>
                  <div className="flex gap-1.5">
                    {k.demand && <Chip tone={demandTone(k.demand)}>{k.demand} demand</Chip>}
                    {k.competition && <Chip tone="muted">{k.competition} comp.</Chip>}
                  </div>
                </div>
                {k.rationale && <p className="text-xs text-genie-ink/60 mt-1">{k.rationale}</p>}
                {k.estValue && (
                  <p className="text-xs text-genie-emerald font-medium mt-1">
                    ~{k.estValue} est.
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {has(opps.competitorWeaknesses) && (
        <Section title="Competitor weaknesses" est className="mt-5">
          <ul className="space-y-2">
            {opps.competitorWeaknesses.map((c, i) => (
              <li key={i} className="text-sm text-genie-ink/75">
                <span className="font-medium text-genie-ink">{c.competitor}</span>
                {c.gap && <> — {c.gap}.</>}
                {c.howToExploit && (
                  <span className="text-genie-ink/55"> {c.howToExploit}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {has(opps.contentGaps) && (
        <Section title="Content gaps" est className="mt-5">
          <ul className="space-y-2">
            {opps.contentGaps.map((c, i) => (
              <li key={i} className="text-sm text-genie-ink/75 flex items-start gap-2">
                {c.estDemand && <Chip tone={demandTone(c.estDemand)}>{c.estDemand}</Chip>}
                <span>
                  <span className="font-medium text-genie-ink">{c.topic}</span>
                  {c.rationale && <span className="text-genie-ink/55"> — {c.rationale}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {has(opps.productOpportunities) && (
        <Section title="Product opportunities" est className="mt-5">
          <ul className="space-y-1.5">
            {opps.productOpportunities.map((p, i) => (
              <li key={i} className="text-sm text-genie-ink/75">
                <span className="font-medium text-genie-ink">{p.idea}</span>
                {p.rationale && <span className="text-genie-ink/55"> — {p.rationale}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {has(opps.partnershipOpportunities) && (
        <Section title="Partnership opportunities" est className="mt-5">
          <ul className="space-y-1.5">
            {opps.partnershipOpportunities.map((p, i) => (
              <li key={i} className="text-sm text-genie-ink/75">
                <span className="font-medium text-genie-ink">{p.partnerType}</span>
                {p.rationale && <span className="text-genie-ink/55"> — {p.rationale}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function ContentEngine({ data, scanId }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [content, setContent] = useState(null);
  const [err, setErr] = useState("");

  if (!data?.ai) return null;

  async function write() {
    setState("loading");
    setErr("");
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai: data.ai,
          gsc: data.gsc,
          scanId: scanId || null,
          host: hostOf(data.finalUrl || ""),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setState("error");
        setErr(j.message || "Couldn't write the content. Try again.");
        return;
      }
      setContent(j.content);
      setState("done");
    } catch {
      setState("error");
      setErr("Something interrupted it. Try again.");
    }
  }

  return (
    <div className="mt-8">
      {state !== "done" && (
        <div className="bg-white border border-genie-purple/20 rounded-2xl p-6 text-center shadow-sm">
          <p className="text-lg font-bold text-genie-ink">✍️ Let Genie write your next article</p>
          <p className="mt-1 text-sm text-genie-ink/60 max-w-md mx-auto">
            Genie writes a complete, SEO-ready article plus the social posts to
            promote it — in your brand voice. Then publishes it for you.
          </p>
          <button
            onClick={write}
            disabled={state === "loading"}
            className="mt-4 genie-gradient text-white font-semibold px-5 py-3 rounded-xl disabled:opacity-70"
          >
            {state === "loading" ? "Genie is writing…" : "Write my next article →"}
          </button>
          {state === "error" && <p className="mt-3 text-sm text-amber-700">{err}</p>}
        </div>
      )}
      {state === "done" && content && (
        <ContentResults content={content} onRegenerate={write} data={data} scanId={scanId} />
      )}
    </div>
  );
}

function ContentResults({ content, onRegenerate, data, scanId }) {
  const a = content.article || {};
  const social = content.social || {};
  const socialBlocks = [
    ...(social.twitter || []).map((t) => ({ platform: "Twitter/X", text: t })),
    ...(social.linkedin ? [{ platform: "LinkedIn", text: social.linkedin }] : []),
    ...(social.instagram || []).map((t) => ({ platform: "Instagram", text: t })),
    ...(social.facebook || []).map((t) => ({ platform: "Facebook", text: t })),
  ];

  const [dist, setDist] = useState(null);
  const [distState, setDistState] = useState("idle"); // idle | loading | done | error

  async function distribute() {
    setDistState("loading");
    try {
      const res = await fetch("/api/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ article: a, ai: data?.ai, host: hostOf(data?.finalUrl || ""), scanId: scanId || null }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setDistState("error"); return; }
      setDist(j.channels);
      setDistState("done");
    } catch {
      setDistState("error");
    }
  }

  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-ink-900">✍️ Genie wrote this for you</h2>
        <button onClick={onRegenerate} className="text-sm text-brand-violet hover:underline">
          Rewrite
        </button>
      </div>

      {/* Article */}
      <div className="mt-4 border border-ink-900/[0.06] rounded-xl p-5">
        <h3 className="text-lg font-bold text-ink-900">{a.title}</h3>
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {a.targetKeyword && <Chip tone="green">🎯 {a.targetKeyword}</Chip>}
          {a.wordCount && <Chip tone="muted">{a.wordCount} words</Chip>}
        </div>
        {a.metaDescription && (
          <p className="mt-2 text-sm text-ink-400 italic">{a.metaDescription}</p>
        )}
        <div className="mt-3 max-h-72 overflow-y-auto thin-scroll pr-1 border-t border-ink-900/5 pt-3">
          <Markdown text={a.body || ""} />
        </div>
        <PublishActions
          label="Auto-publish to your website"
          copyText={`# ${a.title}\n\n${a.body || ""}`}
          copyLabel="article"
        />
      </div>

      {/* Distribution Intelligence */}
      <div className="mt-5">
        {distState !== "done" ? (
          <div className="border border-brand-violet/20 rounded-xl p-5 text-center">
            <p className="text-sm font-semibold text-ink-900">🌐 Multiply this article's reach</p>
            <p className="mt-1 text-xs text-ink-600 max-w-md mx-auto">
              Genie distributes one article across channels — republished for reach, and drafted
              (never auto-posted) for communities.
            </p>
            <button
              onClick={distribute}
              disabled={distState === "loading"}
              className="mt-3 grad-genie text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-70"
            >
              {distState === "loading" ? "Genie is planning distribution…" : "Distribute this article →"}
            </button>
            {distState === "error" && <p className="mt-2 text-xs text-amber-700">Couldn't plan distribution. Try again.</p>}
          </div>
        ) : (
          <DistributionResults channels={dist} />
        )}
      </div>

      {/* Social posts */}
      {socialBlocks.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-genie-ink/45 mb-2">
            Social posts to promote it
          </p>
          <div className="space-y-2">
            {socialBlocks.map((b, i) => (
              <div key={i} className="border border-genie-ink/10 rounded-xl p-3">
                <Chip tone="default">{b.platform}</Chip>
                <p className="mt-2 text-sm text-genie-ink/80 whitespace-pre-wrap">{b.text}</p>
                <PublishActions
                  label={`Auto-post to ${b.platform}`}
                  copyText={b.text}
                  copyLabel="post"
                  compact
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The vision-first action row: Auto-publish is the primary (coming soon);
// copy is an explicitly TEMPORARY stopgap until write-integrations land.
function DistributionResults({ channels }) {
  return (
    <div className="border border-ink-900/[0.06] rounded-xl p-5">
      <p className="text-sm font-semibold text-ink-900">🌐 Distribution plan</p>
      <p className="mt-0.5 text-xs text-ink-400">
        Saved to your actions. Republish = reach (canonical → your site). Community = drafted for you to post.
      </p>
      <div className="mt-3 space-y-2">
        {channels.map((c, i) => (
          <div key={i} className="border border-ink-900/[0.06] rounded-xl p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-ink-900">{c.channel}</span>
              {c.humanPost ? (
                <Chip tone="amber">✍️ you post</Chip>
              ) : (
                <Chip tone="green">↗ reach</Chip>
              )}
              {c.suggestedTarget && <Chip tone="muted">{c.suggestedTarget}</Chip>}
            </div>
            <p className="mt-1 text-xs text-ink-600">{c.framing}</p>
            {c.draft && (
              <div className="mt-2 text-xs text-ink-600 bg-surface2 rounded-lg p-2 max-h-28 overflow-y-auto thin-scroll whitespace-pre-wrap">
                {Array.isArray(c.draft) ? c.draft.join("\n\n") : c.draft}
              </div>
            )}
            <div className="mt-2">
              <button
                disabled
                title="Auto-publishing arrives with the channel integrations"
                className="grad-genie text-white text-xs font-semibold px-3 py-1.5 rounded-lg opacity-70 cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {c.humanPost ? "Open draft to post" : `Auto-publish to ${c.channel}`}
                <span className="text-[9px] bg-white/25 rounded-full px-1.5 py-0.5">soon</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PublishActions({ label, copyText, copyLabel, compact }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <div className={`flex items-center gap-3 flex-wrap ${compact ? "mt-2" : "mt-4"}`}>
      <button
        disabled
        title="Auto-publishing arrives with the WordPress & Shopify integrations"
        className="genie-gradient text-white font-semibold px-4 py-2 rounded-xl opacity-70 cursor-not-allowed flex items-center gap-2"
      >
        🚀 {label}
        <span className="text-[10px] bg-white/25 rounded-full px-2 py-0.5">coming soon</span>
      </button>
      <button onClick={copy} className="text-xs text-genie-ink/45 hover:text-genie-ink underline">
        {copied ? "Copied!" : `Copy ${copyLabel} (temporary)`}
      </button>
    </div>
  );
}

// Minimal markdown → JSX (headings, bold, paragraphs, list items).
function Markdown({ text }) {
  const lines = String(text).split("\n");
  const out = [];
  lines.forEach((line, i) => {
    const l = line.trim();
    if (!l) return;
    if (l.startsWith("### ")) out.push(<h5 key={i} className="font-semibold text-genie-ink mt-3">{l.slice(4)}</h5>);
    else if (l.startsWith("## ")) out.push(<h4 key={i} className="font-bold text-genie-ink mt-4">{l.slice(3)}</h4>);
    else if (l.startsWith("# ")) out.push(<h3 key={i} className="text-lg font-bold text-genie-ink mt-4">{l.slice(2)}</h3>);
    else if (l.startsWith("- ") || l.startsWith("* ")) out.push(<li key={i} className="text-sm text-genie-ink/75 ml-4 list-disc">{stripBold(l.slice(2))}</li>);
    else out.push(<p key={i} className="text-sm text-genie-ink/75 mt-2 leading-relaxed">{stripBold(l)}</p>);
  });
  return <div>{out}</div>;
}
function stripBold(s) {
  // render **bold** as <strong>
  const parts = String(s).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  );
}

function FixCard({ fix, n }) {
  return (
    <div className="bg-white border border-genie-ink/10 rounded-2xl p-5 shadow-sm">
      <p className="font-semibold text-genie-ink">
        {n}. {fix.title}
      </p>
      {fix.whatItMeans && (
        <p className="mt-2 text-sm text-genie-ink/80">{fix.whatItMeans}</p>
      )}
      {fix.whatItCosts && (
        <p className="mt-2 text-sm text-genie-emerald font-medium">
          {fix.whatItCosts}
        </p>
      )}
      {fix.howToFix && (
        <p className="mt-2 text-sm text-genie-ink/60">
          <span className="font-medium text-genie-ink/80">How: </span>
          {fix.howToFix}
        </p>
      )}
    </div>
  );
}

function Chip({ children, tone = "default" }) {
  const tones = {
    default: "bg-genie-mist text-genie-ink/70 border-genie-ink/10",
    muted: "bg-genie-mist text-genie-ink/45 border-genie-ink/10",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span
      className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function difficultyTone(d) {
  if (d === "Easy") return "green";
  if (d === "Hard") return "red";
  return "amber";
}

function statusIcon(status) {
  if (status === "pass") return "✅";
  if (status === "warn") return "⚠️";
  return "❌";
}

function scoreLabel(v) {
  if (v >= 90) return { text: "Excellent", color: "#10B981" };
  if (v >= 75) return { text: "Good Progress", color: "#059669" };
  if (v >= 60) return { text: "Needs Attention", color: "#F59E0B" };
  if (v >= 40) return { text: "Significant Issues", color: "#F97316" };
  return { text: "Critical Problems", color: "#EF4444" };
}

function prettyHost(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}
