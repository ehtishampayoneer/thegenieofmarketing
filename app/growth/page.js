"use client";

// ── STAGE 3 — THE GROWTH COMMAND CENTER ──
// The daily ritual: "you have N taps today." Platform blocks show what Genie
// found and staged; one tap copies the draft + opens the exact thread; the
// keyword portfolio shows what Genie selected, each keyword's health, and which
// are winning vs. being pruned. This is where the real Genie becomes visible.

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hostOf, businessesFromScans } from "@/lib/business";
import AppShell from "@/components/shell/AppShell";
import ActivityFeed from "@/components/ActivityFeed";

const PLATFORM_META = {
  reddit: { label: "Reddit", icon: "R", tint: "text-orange-600 bg-orange-50 border-orange-200" },
  quora: { label: "Quora", icon: "Q", tint: "text-red-600 bg-red-50 border-red-200" },
  forum: { label: "Forums", icon: "F", tint: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  guest: { label: "Guest posts", icon: "G", tint: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  x: { label: "X", icon: "X", tint: "text-ink-900 bg-ink-900/[0.04] border-ink-900/[0.1]" },
  linkedin: { label: "LinkedIn", icon: "in", tint: "text-blue-600 bg-blue-50 border-blue-200" },
  medium: { label: "Medium", icon: "M", tint: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  wordpress: { label: "WordPress", icon: "W", tint: "text-blue-700 bg-blue-50 border-blue-200" },
};

const HEALTH_META = {
  strong: { label: "Strong", cls: "text-emerald-700 bg-emerald-50 border-emerald-200", bar: "#059669" },
  growing: { label: "Growing", cls: "text-blue-700 bg-blue-50 border-blue-200", bar: "#2563EB" },
  new: { label: "New", cls: "text-ink-600 bg-ink-900/[0.04] border-ink-900/[0.1]", bar: "#8B8FA3" },
  weak: { label: "Weak", cls: "text-amber-700 bg-amber-50 border-amber-200", bar: "#F59E0B" },
  retired: { label: "Retired", cls: "text-ink-400 bg-ink-900/[0.03] border-ink-900/[0.08]", bar: "#C9CBD6" },
};

export default function GrowthPage() {
  return (
    <Suspense fallback={null}>
      <Growth />
    </Suspense>
  );
}

function Growth() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState("loading");
  const [host, setHost] = useState("");
  const [ai, setAi] = useState(null);
  const [plan, setPlan] = useState({ blocks: [], totalTaps: 0, totalAuto: 0 });
  const [portfolio, setPortfolio] = useState(null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async (h) => {
    try {
      const [pRes, kRes] = await Promise.all([
        fetch(`/api/placements?host=${encodeURIComponent(h)}`),
        fetch(`/api/keywords?host=${encodeURIComponent(h)}`),
      ]);
      const pJson = await pRes.json();
      const kJson = await kRes.json();
      if (pJson.ok) { setPlan({ blocks: pJson.blocks || [], totalTaps: pJson.totalTaps || 0, totalAuto: pJson.totalAuto || 0 }); setResults(pJson.results || null); }
      if (kJson.ok) setPortfolio(kJson);
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      try {
        const res = await fetch("/api/scans");
        const j = await res.json();
        const scans = j.ok ? (j.scans || []) : [];
        const biz = businessesFromScans(scans);
        const wanted = searchParams.get("business");
        const pick = wanted && biz.find((b) => b.host === wanted) ? wanted : (biz[0]?.host || "");
        if (!active) return;
        setHost(pick);
        setAi(biz.find((b) => b.host === pick)?.latest?.ai || null);
        if (pick) await load(pick);
        setState("ready");
      } catch { if (active) setState("ready"); }
    })();
    return () => { active = false; };
  }, [router, searchParams, load]);

  async function deriveKeywords() {
    setBusy("keywords");
    try {
      const res = await fetch("/api/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, ai }) });
      const j = await res.json();
      if (j.ok) setPortfolio(j);
    } catch {}
    setBusy("");
  }

  async function runReddit() {
    setBusy("reddit");
    try {
      await fetch("/api/radar/reddit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, ai }) });
      await load(host);
    } catch {}
    setBusy("");
  }

  async function runAllRadars() {
    setBusy("all");
    // Run the three radars; refresh once at the end so all openings appear together.
    try {
      await Promise.allSettled([
        fetch("/api/radar/reddit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, ai }) }),
        fetch("/api/radar/quora", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, ai }) }),
        fetch("/api/radar/web", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, ai }) }),
      ]);
      await load(host);
    } catch {}
    setBusy("");
  }

  async function checkResults() {
    setBusy("results");
    try {
      await fetch("/api/engagement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, ai }) });
      await load(host);
    } catch {}
    setBusy("");
  }

  async function act(item, action) {
    // Optimistic: remove from the block.
    setPlan((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => ({ ...b, items: b.items.filter((x) => x.id !== item.id) })).filter((b) => b.items.length),
      totalTaps: action === "posted" || action === "skipped" ? Math.max(0, prev.totalTaps - (item.owned ? 0 : 1)) : prev.totalTaps,
    }));
    try {
      await fetch("/api/placements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, action }) });
    } catch {}
  }

  const taskCount = plan.totalTaps;
  const status = taskCount > 0
    ? { state: "pending_approval", message: `${taskCount} tap${taskCount > 1 ? "s" : ""} ready — Genie found the conversations.`, actionable: false }
    : { state: "idle", message: "No taps queued. Let Genie scan for openings.", actionable: false };
  const genie = { host, suggestionCount: taskCount, contextChips: [{ label: host || "business", active: true }], quickActions: [{ label: "What's my best keyword?", prompt: `What's my strongest keyword for ${host} and why?` }] };

  return (
    <AppShell nav="growth" taskCount={taskCount} businessName={host} status={status} genie={genie}>
      {state === "loading" && <p className="mt-10 text-center text-ink-400">Loading your growth engine…</p>}

      {state === "ready" && !host && (
        <div className="mt-8 bg-surface border border-ink-900/[0.06] rounded-2xl p-10 text-center shadow-sm">
          <p className="text-lg font-bold text-ink-900">Run a scan first</p>
          <p className="mt-1 text-sm text-ink-400">Genie needs to see your product before he can find where to grow it.</p>
          <a href="/" className="mt-4 inline-block grad-genie text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Scan my site →</a>
        </div>
      )}

      {state === "ready" && host && (
        <>
          {/* Header — the daily ritual */}
          <div className="rounded-3xl p-7 grad-genie text-white shadow-lg">
            <p className="text-xs uppercase tracking-widest text-white/60">Growth engine · {host}</p>
            <h1 className="mt-1 text-3xl font-extrabold">
              {taskCount > 0 ? <>You have <span className="font-mono">{taskCount}</span> tap{taskCount > 1 ? "s" : ""} today.</> : "You're all caught up."}
            </h1>
            <p className="mt-1 text-sm text-white/75">
              {plan.totalAuto > 0 && `${plan.totalAuto} publishing automatically · `}
              Genie finds the conversations, writes your reply, and stages it. You tap — it posts from your account.
            </p>
          </div>

          {/* Scan controls */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={runAllRadars} disabled={busy === "all" || !portfolio?.graded?.length} className="grad-genie text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
              {busy === "all" ? "Scanning everywhere…" : "🔍 Find openings everywhere"}
            </button>
            <button onClick={runReddit} disabled={busy || !portfolio?.graded?.length} className="bg-surface border border-ink-900/[0.1] text-ink-900 text-sm font-medium px-3 py-2.5 rounded-xl disabled:opacity-50">
              {busy === "reddit" ? "Reddit…" : "Reddit only"}
            </button>
            {!portfolio?.graded?.length && (
              <button onClick={deriveKeywords} disabled={busy === "keywords"} className="bg-surface border border-ink-900/[0.1] text-ink-900 text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                {busy === "keywords" ? "Thinking…" : "Derive my keywords first"}
              </button>
            )}
          </div>
          {busy === "all" && (
            <p className="mt-2 text-xs text-ink-400">Genie is searching Reddit, Quora, forums, listicles & guest-post openings for your strong keywords… this takes a moment.</p>
          )}

          {/* Live "Genie is working" feed — the wow */}
          <div className="mt-5">
            <ActivityFeed host={host} live={!!busy} />
          </div>

          {/* Tap blocks */}
          {plan.blocks.length === 0 ? (
            <div className="mt-6 bg-surface border border-ink-900/[0.06] rounded-2xl p-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-ink-900">No openings staged yet</p>
              <p className="mt-1 text-sm text-ink-400">Hit “Find openings everywhere” and Genie will surface live threads, questions, forums, listicles & guest-post spots where your product genuinely fits.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {plan.blocks.map((block) => (
                <PlatformBlock key={block.platform} block={block} onAct={act} />
              ))}
            </div>
          )}

          {/* What Genie already posted — and what he learned */}
          <ResultsSection results={results} onCheck={checkResults} busy={busy === "results"} />

          {/* Keyword portfolio */}
          <KeywordPortfolio portfolio={portfolio} onDerive={deriveKeywords} busy={busy === "keywords"} />
        </>
      )}
    </AppShell>
  );
}

function PlatformBlock({ block, onAct }) {
  const m = PLATFORM_META[block.platform] || { label: block.platform, icon: "•", tint: "text-ink-600 bg-ink-900/[0.04] border-ink-900/[0.1]" };
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-sm ${m.tint}`}>{m.icon}</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-ink-900">{m.label}</p>
          <p className="text-xs text-ink-400">{block.owned ? "Publishes automatically" : `${block.count} tap${block.count > 1 ? "s" : ""} — you post from your account`}</p>
        </div>
        <span className="text-lg font-mono font-bold text-brand-violet">{block.count}</span>
      </div>
      <div className="mt-3 space-y-2">
        {block.items.map((item) => <PlacementCard key={item.id} item={item} owned={block.owned} onAct={onAct} />)}
      </div>
    </div>
  );
}

function PlacementCard({ item, owned, onAct }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function tapPost() {
    try { await navigator.clipboard.writeText(item.draft || ""); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
    if (item.target_url) window.open(item.target_url, "_blank");
    onAct(item, "posted"); // logs to memory + sets cooldown
  }

  return (
    <div className="border border-ink-900/[0.06] rounded-xl p-3 bg-surface2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-900 truncate">{item.target_title || item.target_url}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {item.keyword && <span className="text-[11px] bg-brand-violet/10 text-brand-violet rounded-full px-2 py-0.5">🎯 {item.keyword}</span>}
            <span className="text-[11px] bg-ink-900/[0.04] text-ink-600 rounded-full px-2 py-0.5 capitalize">{String(item.kind || "reply").replace("_", " ")}</span>
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-brand-violet font-medium shrink-0">{open ? "Hide" : "Preview"}</button>
      </div>

      {open && item.draft && (
        <div className="mt-2 text-xs text-ink-900 bg-surface rounded-lg p-3 whitespace-pre-wrap max-h-52 overflow-y-auto thin-scroll border border-ink-900/[0.06]">
          {item.draft}
        </div>
      )}
      {item.meta?.reason && <p className="mt-1.5 text-[11px] text-ink-400 italic">{item.meta.reason}</p>}

      <div className="mt-2.5 flex items-center gap-2">
        {owned ? (
          <button onClick={() => onAct(item, "posted")} className="grad-genie text-white text-xs font-semibold px-3 py-2 rounded-lg">✓ Approve & publish</button>
        ) : (
          <button onClick={tapPost} className="grad-genie text-white text-xs font-semibold px-3 py-2 rounded-lg">
            {copied ? "✓ Copied — paste & post" : "📋 Copy & open thread"}
          </button>
        )}
        <button onClick={() => onAct(item, "snoozed")} className="text-xs text-ink-400 hover:text-ink-600 px-2">Later</button>
        <button onClick={() => onAct(item, "skipped")} className="text-xs text-ink-400 hover:text-red-500 px-2">Skip</button>
      </div>
    </div>
  );
}

function ResultsSection({ results, onCheck, busy }) {
  if (!results || results.total === 0) return null;
  const { total, winning, flat, dud, pending, top } = results;
  return (
    <div className="mt-8 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-extrabold text-ink-900">What Genie posted · results</h2>
          <p className="text-sm text-ink-400">Genie tracks back every post, doubles down on winners, and bins the duds.</p>
        </div>
        <button onClick={onCheck} disabled={busy} className="text-xs bg-surface border border-ink-900/[0.1] text-ink-900 font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
          {busy ? "Checking…" : "↻ Check my results now"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="Posted" value={total} tint="text-ink-900" />
        <Stat label="Winning" value={winning} tint="text-emerald-600" />
        <Stat label="Flat" value={flat} tint="text-ink-600" />
        <Stat label="Duds (binned)" value={dud} tint="text-amber-600" />
        <Stat label="Still fresh" value={pending} tint="text-brand-violet" />
      </div>

      {top?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">🔥 Top performers</p>
          <div className="space-y-2">
            {top.map((t, i) => (
              <a key={i} href={t.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 bg-surface2 border border-ink-900/[0.06] rounded-xl px-3 py-2.5 hover:border-brand-violet/30 transition">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">{t.title}</p>
                  {t.keyword && <p className="text-[11px] text-brand-violet">🎯 {t.keyword}</p>}
                </div>
                {t.engagement && (
                  <div className="text-right text-[11px] text-ink-400 font-mono shrink-0">
                    {t.engagement.upvotes != null && <span className="text-emerald-600">▲ {t.engagement.upvotes}</span>}
                    {t.engagement.comments != null && <span className="ml-2">💬 {t.engagement.comments}</span>}
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
      {winning > 0 && (
        <p className="mt-3 text-[11px] text-ink-400">Genie drafts follow-up taps for winning threads automatically — look for “Follow-up” cards above.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tint }) {
  return (
    <div className="bg-surface2 border border-ink-900/[0.06] rounded-xl p-3 text-center">
      <p className={`text-2xl font-mono font-bold leading-none ${tint}`}>{value}</p>
      <p className="mt-1 text-[11px] text-ink-400">{label}</p>
    </div>
  );
}

function KeywordPortfolio({ portfolio, onDerive, busy }) {
  if (!portfolio || !portfolio.graded?.length) {
    return (
      <div className="mt-8 bg-surface border border-brand-violet/20 rounded-2xl p-6 text-center shadow-sm">
        <p className="text-lg font-bold text-ink-900">🎯 Genie builds your keyword strategy</p>
        <p className="mt-1 text-sm text-ink-600 max-w-md mx-auto">He reads your product and derives the keywords to rank for — no input from you. Then he manages them: keeping winners, pruning losers.</p>
        <button onClick={onDerive} disabled={busy} className="mt-4 grad-genie text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60">
          {busy ? "Genie is analyzing…" : "Build my keyword strategy →"}
        </button>
      </div>
    );
  }

  const { graded, counts = {}, portfolioScore } = portfolio;
  const active = graded.filter((k) => k.health !== "retired");
  const retired = graded.filter((k) => k.health === "retired");

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-extrabold text-ink-900">Keyword portfolio</h2>
          <p className="text-sm text-ink-400">Genie selected these and manages their health — winners stay, losers get retired.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-mono font-bold text-brand-violet leading-none">{portfolioScore}</p>
            <p className="text-[11px] text-ink-400">portfolio health</p>
          </div>
          <button onClick={onDerive} disabled={busy} className="text-xs text-brand-violet hover:underline disabled:opacity-50">{busy ? "…" : "+ Add fresh"}</button>
        </div>
      </div>

      {/* Tier summary */}
      <div className="mt-3 flex flex-wrap gap-2">
        {["strong", "growing", "new", "weak", "retired"].map((t) => (
          counts[t] ? (
            <span key={t} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${HEALTH_META[t].cls}`}>
              {HEALTH_META[t].label} <span className="font-mono">{counts[t]}</span>
            </span>
          ) : null
        ))}
      </div>

      {/* Active keywords */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        {active.map((k) => <KeywordRow key={k.id} k={k} />)}
      </div>

      {/* Retired (pruned) */}
      {retired.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-ink-400 hover:text-ink-600">Retired keywords ({retired.length}) — Genie stopped using these</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {retired.map((k) => <span key={k.id} className="text-xs text-ink-400 line-through bg-ink-900/[0.03] rounded-full px-2 py-0.5">{k.keyword}</span>)}
          </div>
        </details>
      )}
    </div>
  );
}

function KeywordRow({ k }) {
  const m = HEALTH_META[k.health] || HEALTH_META.new;
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-xl p-3 shadow-xs">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-ink-900 flex-1 truncate">{k.keyword}</p>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>
        <span className="text-sm font-mono font-bold text-ink-900">{k.score}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-ink-900/[0.06] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${k.score}%`, background: m.bar, transition: "width .6s ease" }} />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-400">
        <span>Potential {k.traffic_potential ?? "—"}</span>
        <span>Competition {k.competition ?? "—"}</span>
        <span>Coverage {k.coverage || 0}×</span>
        {(k.gsc_impressions || 0) > 0 && <span className="text-emerald-600">{k.gsc_clicks || 0} clicks (real)</span>}
      </div>
    </div>
  );
}
