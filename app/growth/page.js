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
import { GenieSays } from "@/components/ui/GenieVoice";
import Icon from "@/components/ui/Icon";

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
  const [showKeywordIntro, setShowKeywordIntro] = useState(false);
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
        // Arriving fresh from setup → auto-build keywords with a narration.
        if (searchParams.get("fromsetup") && active) {
          const kr = await fetch(`/api/keywords?host=${encodeURIComponent(pick)}`).then((r) => r.json()).catch(() => ({}));
          if (!kr?.graded?.length) {
            setShowKeywordIntro(true);
            deriveKeywordsFor(pick, biz.find((b) => b.host === pick)?.latest?.ai || null);
          }
        }
      } catch { if (active) setState("ready"); }
    })();
    return () => { active = false; };
  }, [router, searchParams, load]);

  async function deriveKeywordsFor(h, aiCtx) {
    setBusy("keywords");
    try {
      const res = await fetch("/api/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: h, ai: aiCtx }) });
      const j = await res.json();
      if (j.ok) setPortfolio(j);
    } catch {}
    setBusy("");
  }

  async function deriveKeywords(productOverride) {
    const override = typeof productOverride === "string" ? productOverride : undefined;
    setBusy("keywords");
    try {
      const res = await fetch("/api/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, ai, productOverride: override }) });
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
    ? { state: "pending_approval", message: `${taskCount} tap${taskCount > 1 ? "s" : ""} ready. Genie found the conversations.`, actionable: false }
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
          {/* Header — the keyword command center */}
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-extrabold text-ink tracking-tight">Your keyword world</h1>
              <p className="text-sm text-ink-400 mt-1">These are the searches I'm ranking you for. Winners rise, dead ones get retired, fresh ones come in. This is your SEO engine.</p>
            </div>
          </div>

          {/* Keyword intro narration (from setup) */}
          {showKeywordIntro && portfolio?.graded?.length > 0 && (
            <div className="mt-5 card p-5 bg-accent-soft border-0 animate-rise">
              <p className="text-base font-medium text-ink">
                <GenieSays text={`Done. I found ${portfolio.graded.length} keywords for you. The strong ones up top can pull in real leads, and the medium and small ones we'll build over time. I weave these into your posts, blogs and emails so you climb Google. You can always manage them right here.`} />
              </p>
            </div>
          )}

          {!portfolio?.graded?.length ? (
            <div className="mt-8 card p-10 text-center">
              <div className="inline-flex text-ink mb-3"><Icon.target size={40} /></div>
              <p className="text-lg font-bold text-ink">Let's build your keyword strategy</p>
              <p className="mt-1 text-sm text-ink-400 max-w-md mx-auto">I'll read your product and find the exact searches to rank you for. No input needed from you.</p>
              <button onClick={deriveKeywords} disabled={busy === "keywords"} className="btn-ink px-6 py-3 mt-5 disabled:opacity-50">
                {busy === "keywords" ? "Thinking…" : "Build my keyword strategy"}
              </button>
            </div>
          ) : (
            <>
              <KeywordResearch host={host} ai={ai} />
              <KeywordPortfolio portfolio={portfolio} host={host} ai={ai} onDerive={deriveKeywords} busy={busy === "keywords"} />
            </>
          )}
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
          <p className="text-xs text-ink-400">{block.owned ? "Publishes automatically" : `${block.count} tap${block.count > 1 ? "s" : ""}, you post from your account`}</p>
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
            {copied ? "Copied. Paste & post" : "Copy & open thread"}
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
        <p className="mt-3 text-[11px] text-ink-400">Genie drafts follow-up taps for winning threads automatically. Look for the Follow-up cards above.</p>
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

function ProductCorrection({ onDerive, busy }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      {!open ? (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">Do these keywords match your product?</span> If Genie misread what you do, correct him in one line.
          </p>
          <button onClick={() => setOpen(true)} className="text-sm font-semibold text-amber-800 underline">Fix my keywords →</button>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-amber-900">Tell Genie exactly what your product is</p>
          <p className="text-xs text-amber-700 mt-0.5">One clear sentence about the benefit customers get, not the tech. Genie will rebuild the whole strategy.</p>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder="e.g. An online store where customers view products in AR inside their room before buying, like Amazon but you try items in your space first."
            className="mt-2 w-full rounded-xl border border-amber-300 bg-white p-3 text-sm text-ink-900 outline-none focus:ring-2 focus:ring-amber-300 min-h-[70px]"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => { if (text.trim()) onDerive(text.trim()); setOpen(false); }}
              disabled={busy || !text.trim()}
              className="grad-genie text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50">
              {busy ? "Rebuilding…" : "Rebuild my keywords →"}
            </button>
            <button onClick={() => setOpen(false)} className="text-sm text-amber-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddKeyword({ host, onAdded }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    if (!val.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/keywords", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, keyword: val.trim() }) });
      const j = await res.json();
      if (j.ok) { setVal(""); onAdded?.(j); }
    } catch {}
    setBusy(false);
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="Add your own keyword and Genie will work it into the rotation"
        className="flex-1 px-3 py-2 rounded-xl border border-hairline bg-panel text-ink text-sm outline-none focus:border-ink-300 transition"
      />
      <button onClick={add} disabled={busy || !val.trim()} className="btn-ink px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-1">
        <Icon.plus size={16} /> Add
      </button>
    </div>
  );
}

function SyncButton({ host }) {
  const [state, setState] = useState("idle"); // idle | syncing | done | nogoogle
  const [msg, setMsg] = useState("");
  async function sync() {
    setState("syncing"); setMsg("");
    try {
      const res = await fetch("/api/keywords/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }) });
      const j = await res.json();
      if (j.available) {
        setState("done");
        const bits = [];
        if (j.updated) bits.push(`${j.updated} updated`);
        if (j.added) bits.push(`${j.added} new`);
        if (j.killed) bits.push(`${j.killed} retired`);
        setMsg(bits.length ? bits.join(" · ") : "All current");
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setState("nogoogle");
        setMsg(j.reason === "not_connected" ? "Connect Google first" : "No Google data yet");
      }
    } catch { setState("idle"); }
  }
  return (
    <div className="text-right">
      <button onClick={sync} disabled={state === "syncing"} className="btn-ghost text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-50">
        {state === "syncing" ? "Syncing…" : "↻ Sync real Google data"}
      </button>
      {msg && <p className={`text-[10px] mt-0.5 ${state === "done" ? "accent-text" : "text-ink-400"}`}>{msg}</p>}
    </div>
  );
}

function KeywordResearch({ host, ai }) {
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState({});
  const [added, setAdded] = useState(false);
  const [open, setOpen] = useState(false);

  async function research() {
    if (!seed.trim()) return;
    setBusy(true); setResults(null); setAdded(false); setSelected({});
    try {
      const r = await fetch("/api/keywords/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed, productContext: ai?.whatTheySell || ai?.businessName }) });
      const j = await r.json();
      if (j.ok) { setResults(j.keywords || []); setNote(j.note || ""); }
    } catch {}
    setBusy(false);
  }

  async function addSelected() {
    const picks = (results || []).filter((k) => selected[k.keyword]);
    if (!picks.length) return;
    try {
      await fetch("/api/keywords/research", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, keywords: picks }) });
      setAdded(true);
      setTimeout(() => window.location.reload(), 900);
    } catch {}
  }

  const selCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="mb-8">
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full card card-hover p-5 flex items-center gap-3 text-left">
          <span className="w-11 h-11 rounded-xl bg-ink text-paper flex items-center justify-center shrink-0"><Icon.search size={22} /></span>
          <div className="flex-1">
            <p className="font-bold text-ink">Research new keywords</p>
            <p className="text-sm text-ink-400">Discover hundreds of real keywords to feed your marketing engine.</p>
          </div>
          <Icon.chevronRight size={20} />
        </button>
      ) : (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-ink text-lg">Keyword research</p>
              <p className="text-sm text-ink-400">Type a topic. Genie finds real keywords people search, then you add the good ones to grow.</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink"><Icon.x size={20} /></button>
          </div>

          <div className="flex gap-2">
            <input
              value={seed} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => e.key === "Enter" && research()}
              placeholder="e.g. hiking shoes, ar shopping, project management"
              className="flex-1 px-4 py-2.5 rounded-xl border border-hairline bg-paper text-ink outline-none focus:border-ink-300"
            />
            <button onClick={research} disabled={busy || !seed.trim()} className="btn-ink px-5 py-2.5 disabled:opacity-50">
              {busy ? "Researching…" : "Research"}
            </button>
          </div>

          {busy && <p className="mt-3 text-sm text-ink-400 animate-soft-pulse">Discovering real keywords from Google and estimating demand…</p>}

          {results && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-ink-500">{results.length} keywords found</p>
                {selCount > 0 && (
                  <button onClick={addSelected} className="btn-accent px-4 py-2 text-sm">
                    {added ? "Added!" : `Add ${selCount} to my keywords`}
                  </button>
                )}
              </div>
              {note && <p className="text-[11px] text-ink-400 mb-2">{note}</p>}

              <div className="border border-hairline rounded-xl overflow-hidden">
                <div className="grid grid-cols-[24px_1fr_80px_70px_80px] gap-2 px-3 py-2 bg-paper text-[11px] font-semibold text-ink-500 uppercase tracking-wide">
                  <span></span><span>Keyword</span><span className="text-right">Volume</span><span className="text-center">Trend</span><span className="text-right">Difficulty</span>
                </div>
                <div className="max-h-96 overflow-y-auto thin-scroll divide-y divide-hairline">
                  {results.map((k) => {
                    const diff = k.difficulty === "easy" ? "text-emerald-700" : k.difficulty === "hard" ? "text-red-600" : "text-amber-600";
                    const trend = k.trend === "up" ? "↑" : k.trend === "down" ? "↓" : "→";
                    const trendC = k.trend === "up" ? "text-emerald-600" : k.trend === "down" ? "text-red-500" : "text-ink-300";
                    return (
                      <label key={k.keyword} className="grid grid-cols-[24px_1fr_80px_70px_80px] gap-2 px-3 py-2 items-center hover:bg-paper cursor-pointer text-sm">
                        <input type="checkbox" checked={!!selected[k.keyword]} onChange={(e) => setSelected((s) => ({ ...s, [k.keyword]: e.target.checked }))} />
                        <span className="text-ink truncate">{k.keyword}</span>
                        <span className="text-right font-mono text-ink-600">{k.volume ? k.volume.toLocaleString() : "~"}</span>
                        <span className={`text-center ${trendC}`}>{trend}</span>
                        <span className={`text-right font-medium ${diff} capitalize`}>{k.difficulty}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-ink-400">Volumes are estimates. Connect Google Search Console for your real numbers.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KeywordPortfolio({ portfolio, host, ai, onDerive, busy }) {
  const [history, setHistory] = useState({});
  useEffect(() => {
    if (!host) return;
    (async () => {
      try { const r = await fetch(`/api/keywords/sync?host=${encodeURIComponent(host)}`); const j = await r.json(); if (j.ok) setHistory(j.series || {}); } catch {}
    })();
  }, [host]);
  if (!portfolio || !portfolio.graded?.length) {
    return (
      <div className="mt-8 bg-surface border border-brand-violet/20 rounded-2xl p-6 text-center shadow-sm">
        <p className="text-lg font-bold text-ink-900">🎯 Genie builds your keyword strategy</p>
        <p className="mt-1 text-sm text-ink-600 max-w-md mx-auto">He reads your product and derives the keywords to rank for, no input from you. Then he manages them, keeping winners and pruning losers.</p>
        <button onClick={onDerive} disabled={busy} className="mt-4 grad-genie text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60">
          {busy ? "Genie is analyzing…" : "Build my keyword strategy →"}
        </button>
      </div>
    );
  }

  const { graded, counts = {}, portfolioScore } = portfolio;
  const active = graded.filter((k) => k.health !== "retired");
  const retired = graded.filter((k) => k.health === "retired");
  const strongCount = (counts.strong || 0) + (counts.growing || 0);
  const easyCount = active.filter((k) => (k.competition ?? 50) < 40).length;
  const realCount = active.filter((k) => (k.gsc_impressions || 0) > 0).length;

  return (
    <div className="mt-6">
      <ProductCorrection onDerive={onDerive} busy={busy} />

      {/* Command-center stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-2xl font-mono font-bold text-ink">{active.length}</p>
          <p className="text-xs text-ink-400 mt-0.5">keywords tracked</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-mono font-bold text-ink">{portfolioScore}</p>
          <p className="text-xs text-ink-400 mt-0.5">portfolio health</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-mono font-bold accent-text">{easyCount}</p>
          <p className="text-xs text-ink-400 mt-0.5">easy wins</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-mono font-bold accent-text">{realCount}</p>
          <p className="text-xs text-ink-400 mt-0.5">bringing real traffic</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold text-ink">Top keywords</h2>
        <SyncButton host={host} />
      </div>

      {/* Add your own keyword */}
      <AddKeyword host={host} onAdded={(p) => window.location.reload()} />

      {/* Active keywords — high to low */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        {active.map((k) => <KeywordRow key={k.id} k={k} history={history[k.keyword]} />)}
      </div>

      {/* Retired (pruned) */}
      {retired.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-ink-400 hover:text-ink-600">Retired keywords ({retired.length}). Genie stopped using these.</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {retired.map((k) => <span key={k.id} className="text-xs text-ink-400 line-through bg-ink-50 rounded-full px-2 py-0.5">{k.keyword}</span>)}
          </div>
        </details>
      )}
    </div>
  );
}

function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const w = 60, h = 18;
  const vals = points.map((p) => p.clicks);
  const max = Math.max(...vals, 1);
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p.clicks / max) * h).toFixed(1)}`).join(" ");
  const rising = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={w} height={h} className="shrink-0">
      <path d={d} fill="none" stroke={rising ? "#1E9E6A" : "#E5484D"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KeywordRow({ k, history }) {
  const m = HEALTH_META[k.health] || HEALTH_META.new;
  // Difficulty from competition: low comp = easy to rank.
  const comp = k.competition ?? 50;
  const diff = comp < 40 ? { label: "Easy", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" }
    : comp < 65 ? { label: "Medium", cls: "text-amber-700 bg-amber-50 border-amber-200" }
    : { label: "Hard", cls: "text-red-600 bg-red-50 border-red-200" };
  // Expected traffic label from potential.
  const pot = k.traffic_potential ?? 0;
  const traffic = pot >= 60 ? "High traffic" : pot >= 40 ? "Medium traffic" : "Low traffic";
  return (
    <div className="bg-panel border border-hairline rounded-xl p-3.5 shadow-xs card-hover">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-ink flex-1 truncate">{k.keyword}</p>
        {history && history.length >= 2 && <Sparkline points={history} />}
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${diff.cls}`}>{diff.label}</span>
        <span className="text-sm font-mono font-bold text-ink">{k.score}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${k.score}%`, background: m.bar, transition: "width .8s cubic-bezier(0.2,0.8,0.2,1)" }} />
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-400">
        <span className="font-medium text-ink-500">{traffic}</span>
        <span>·</span>
        <span>Coverage {k.coverage || 0}×</span>
        {(k.gsc_impressions || 0) > 0 ? (
          <span className="accent-text font-medium">↑ {k.gsc_clicks || 0} real clicks · rank {k.gsc_position ? Math.round(k.gsc_position) : "—"}</span>
        ) : k.source === "gsc" ? (
          <span className="accent-text font-medium">real Google keyword</span>
        ) : null}
        {k.dead && <span className="text-red-500 font-medium">retired</span>}
      </div>
    </div>
  );
}
