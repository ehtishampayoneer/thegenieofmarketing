"use client";

// ── KEYWORD RESEARCH (the merged keyword page) ──
// Auto-loads the keywords Genie already picked for the product, in a full pro
// table (volume, difficulty, CPC, trend sparkline, ranking, view). Also lets
// the user research fresh topics. Matches the reference design exactly.

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { businessesFromScans } from "@/lib/business";
import AppShell from "@/components/shell/AppShell";
import Icon from "@/components/ui/Icon";

export default function ResearchPage() {
  return <Suspense fallback={null}><Research /></Suspense>;
}

function Research() {
  const router = useRouter();
  const [state, setState] = useState("loading");
  const [host, setHost] = useState("");
  const [ai, setAi] = useState(null);
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState(false);
  const [keywords, setKeywords] = useState([]);
  const [tab, setTab] = useState("all");
  const [selected, setSelected] = useState({});
  const [added, setAdded] = useState(0);
  const [note, setNote] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      try {
        const res = await fetch("/api/scans");
        const j = await res.json();
        const biz = businessesFromScans(j.ok ? j.scans || [] : []);
        if (active && biz[0]) {
          setHost(biz[0].host); setAi(biz[0].latest?.ai || null);
          // Auto-load the keywords Genie already picked.
          const kr = await fetch(`/api/keywords/research?host=${encodeURIComponent(biz[0].host)}`).then((r) => r.json()).catch(() => ({}));
          if (active && kr.ok) setKeywords(kr.keywords || []);
        }
      } catch {}
      if (active) setState("ready");
    })();
    return () => { active = false; };
  }, [router]);

  const research = useCallback(async (q) => {
    const term = (q ?? seed).trim();
    if (!term) return;
    setBusy(true); setAdded(0); setSelected({}); setShowAdd(false);
    try {
      const r = await fetch("/api/keywords/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: term, productContext: ai?.whatTheySell || ai?.businessName }) });
      const j = await r.json();
      if (j.ok) { setKeywords(j.keywords || []); setNote(j.note || ""); }
    } catch {}
    setBusy(false);
  }, [seed, ai]);

  async function addKeywords(picks) {
    if (!picks.length || !host) return;
    try {
      const r = await fetch("/api/keywords/research", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, keywords: picks }) });
      const j = await r.json();
      if (j.ok) { setAdded(j.added || picks.length); setSelected({}); }
    } catch {}
  }

  const easyWins = keywords.filter((k) => k.easyWin);
  const highPotential = keywords.filter((k) => k.highPotential);
  const questions = keywords.filter((k) => k.isQuestion);
  const shown = tab === "high" ? highPotential : tab === "easy" ? easyWins : tab === "questions" ? questions : keywords;

  const totalVolume = keywords.reduce((n, k) => n + (k.volume || 0), 0);
  const avgDiff = keywords.length ? Math.round(keywords.reduce((n, k) => n + k.competition, 0) / keywords.length) : 0;
  const selCount = Object.values(selected).filter(Boolean).length;

  return (
    <AppShell nav="research" businessName={host} status={{ state: "idle", message: "Keyword research", actionable: false }}>
      {state === "loading" && <p className="mt-10 text-center text-ink-400">Loading your keywords...</p>}

      {state === "ready" && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-ink tracking-tight">Keyword Research</h1>
              <p className="text-sm text-ink-400 mt-1">Discover high-value keywords to grow your traffic.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  value={seed} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => e.key === "Enter" && research()}
                  placeholder="Search keywords..."
                  className="w-56 pl-9 pr-3 py-2.5 rounded-xl border border-hairline bg-panel text-ink text-sm outline-none focus:border-ink-300"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><Icon.search size={16} /></span>
              </div>
              <button onClick={() => research()} disabled={busy || !seed.trim()} className="btn-ink px-4 py-2.5 text-sm disabled:opacity-50 flex items-center gap-1.5">
                <Icon.plus size={16} /> {busy ? "..." : "Add Keyword"}
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Keywords" value={keywords.length} sub={added > 0 ? `+${added} added` : "in your engine"} icon={<Icon.target size={20} />} />
            <StatCard label="Total Search Volume" value={fmtK(totalVolume)} sub="estimated monthly" icon={<Icon.growth size={20} />} />
            <StatCard label="Avg Difficulty" value={avgDiff} sub={avgDiff < 40 ? "Easy" : avgDiff <= 65 ? "Moderate" : "Hard"} icon={<Icon.bolt size={20} />} />
            <StatCard label="Top Opportunities" value={highPotential.length} sub="high potential" icon={<Icon.spark size={20} />} accent />
          </div>

          {busy && <div className="card p-12 text-center mt-6"><p className="text-sm text-ink-400 animate-soft-pulse">Discovering real keywords and picking your best opportunities...</p></div>}

          {!busy && keywords.length === 0 && (
            <div className="card p-12 text-center mt-6">
              <div className="inline-flex text-ink mb-3"><Icon.search size={40} /></div>
              <p className="text-lg font-bold text-ink">Let Genie find your winning keywords</p>
              <p className="mt-1 text-sm text-ink-400 max-w-md mx-auto">Search a topic above and I'll discover real keywords, then pick the ones that get you traffic fast and win long-term.</p>
            </div>
          )}

          {!busy && keywords.length > 0 && (
            <div className="mt-6">
              {/* Tabs */}
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div className="flex items-center gap-1 border-b border-hairline">
                  {[["all", "All Keywords", keywords.length], ["high", "High Potential", highPotential.length], ["easy", "Easy Wins", easyWins.length], ["questions", "Questions", questions.length]].map(([k, label, count]) => (
                    <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${tab === k ? "border-ink text-ink" : "border-transparent text-ink-400 hover:text-ink-600"}`}>
                      {label} <span className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${tab === k ? "bg-ink text-paper" : "bg-ink-50 text-ink-400"}`}>{count}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {selCount > 0 && <button onClick={() => addKeywords(shown.filter((k) => selected[k.keyword]))} className="btn-accent px-4 py-2 text-sm">Add {selCount} selected</button>}
                  <button onClick={() => addKeywords(keywords.filter((k) => (k.easyWin || k.highPotential) && !k.inPortfolio).slice(0, 25))} className="btn-ink px-4 py-2 text-sm flex items-center gap-1.5"><Icon.spark size={15} /> Let Genie pick the best</button>
                </div>
              </div>
              {added > 0 && <p className="text-sm accent-text font-medium mb-2">Added {added} keywords to your marketing engine. Genie is now growing them everywhere.</p>}
              {note && <p className="text-[11px] text-ink-400 mb-2">{note}</p>}

              {/* Table */}
              <div className="card overflow-hidden">
                <div className="grid grid-cols-[28px_1fr_90px_100px_70px_90px_90px_60px] gap-2 px-4 py-2.5 bg-paper border-b border-hairline text-[11px] font-semibold text-ink-500 uppercase tracking-wide">
                  <span></span><span>Keyword</span><span className="text-right">Volume</span><span className="text-center">Difficulty</span><span className="text-right">CPC</span><span className="text-center">Trend</span><span className="text-center">Ranking</span><span className="text-center">Action</span>
                </div>
                <div className="divide-y divide-hairline">
                  {shown.map((k) => <KwRow key={k.keyword} k={k} checked={!!selected[k.keyword]} onToggle={(v) => setSelected((s) => ({ ...s, [k.keyword]: v }))} />)}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-ink-400">Volume, difficulty, CPC and ranking are estimates. Connect Google Search Console for your real numbers and live rankings.</p>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function StatCard({ label, value, sub, icon, accent }) {
  return (
    <div className="card p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-ink-400">{label}</p>
        <p className="text-2xl font-bold font-mono text-ink mt-0.5">{value}</p>
        <p className={`text-[11px] mt-0.5 ${accent ? "accent-text font-medium" : "text-ink-400"}`}>{sub}</p>
      </div>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent ? "accent-soft" : "bg-ink-50 text-ink-500"}`}>{icon}</span>
    </div>
  );
}

function KwRow({ k, checked, onToggle }) {
  const diffCls = k.difficulty === "easy" ? "text-emerald-700 bg-emerald-50" : k.difficulty === "hard" ? "text-red-600 bg-red-50" : "text-amber-700 bg-amber-50";
  const diffLabel = k.difficulty.charAt(0).toUpperCase() + k.difficulty.slice(1);
  return (
    <div className="grid grid-cols-[28px_1fr_90px_100px_70px_90px_90px_60px] gap-2 px-4 py-2.5 items-center hover:bg-paper text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
      <div className="min-w-0">
        <span className="text-ink truncate block font-medium">{k.keyword}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {k.easyWin && <span className="text-[10px] accent-soft px-1.5 rounded-full">Easy win</span>}
          {k.highPotential && !k.easyWin && <span className="text-[10px] bg-ink-50 text-ink-500 px-1.5 rounded-full">High potential</span>}
          {k.real && <span className="text-[10px] accent-text font-medium">real data</span>}
        </div>
      </div>
      <span className="text-right font-mono text-ink-700">{k.volume ? fmtK(k.volume) : "~"}</span>
      <span className="text-center flex items-center justify-center gap-1">
        <span className="font-mono text-ink-600 text-xs">{k.competition}</span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${diffCls}`}>{diffLabel}</span>
      </span>
      <span className="text-right font-mono text-ink-500">{k.cpc ? `$${k.cpc.toFixed(2)}` : "~"}</span>
      <span className="flex justify-center"><Spark points={k.spark} up={k.trend === "up"} down={k.trend === "down"} /></span>
      <span className="text-center font-mono">
        {k.ranking ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-ink font-bold">{k.ranking}</span>
            {k.rankChange > 0 && <span className="text-emerald-600 text-[11px]">▲{k.rankChange}</span>}
            {k.rankChange < 0 && <span className="text-red-500 text-[11px]">▼{Math.abs(k.rankChange)}</span>}
          </span>
        ) : <span className="text-ink-300">—</span>}
      </span>
      <span className="text-center">
        <button className="btn-ghost px-3 py-1 text-xs">View</button>
      </span>
    </div>
  );
}

function Spark({ points, up, down }) {
  if (!points || points.length < 2) return <span className="text-ink-300">—</span>;
  const w = 64, h = 22;
  const max = Math.max(...points), min = Math.min(...points), range = max - min || 1;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((p - min) / range) * h).toFixed(1)}`).join(" ");
  const color = up ? "#1E9E6A" : down ? "#E5484D" : "#4A5561";
  return <svg width={w} height={h}><path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function fmtK(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}
