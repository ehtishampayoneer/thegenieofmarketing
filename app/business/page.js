"use client";

// ── GENIE CONSTITUTION (see lib/outcomes.js). Screen 3: the consolidated
// business view. Stage A ships overview + history; Stage D adds the full
// Overview / SEO / Traffic / Integrations tabbed layout.

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hostOf, businessesFromScans } from "@/lib/business";
import AppShell from "@/components/shell/AppShell";

export default function BusinessPage() {
  return (
    <Suspense fallback={null}>
      <BusinessScreen />
    </Suspense>
  );
}

function BusinessScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wanted = searchParams.get("business") || "";
  const [state, setState] = useState("loading");
  const [scans, setScans] = useState([]);
  const [host, setHost] = useState("");
  const [taskCount, setTaskCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      try {
        const res = await fetch("/api/scans");
        const j = await res.json();
        if (!active) return;
        const list = j.ok ? (j.scans || []) : [];
        setScans(list);
        const biz = businessesFromScans(list);
        const pick = wanted && biz.find((b) => b.host === wanted) ? wanted : (biz[0]?.host || "");
        setHost(pick);
        setState("ready");
      } catch { if (active) setState("ready"); }
      try {
        const aRes = await fetch("/api/actions?status=proposed");
        const aJson = await aRes.json();
        if (active && aJson.ok) setTaskCount((aJson.actions || []).length);
      } catch {}
    })();
    return () => { active = false; };
  }, [router, wanted]);

  const hostScans = scans.filter((s) => hostOf(s) === host).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const latest = hostScans[hostScans.length - 1];
  const prev = hostScans[hostScans.length - 2];
  const score = latest?.overall_score ?? null;
  const delta = score != null && prev?.overall_score != null ? score - prev.overall_score : null;
  const name = latest?.ai?.businessName || host;
  const industry = latest?.ai?.industry || "";

  const status = { state: "idle", message: host ? `Everything about ${name}.` : "No business yet.", actionable: false };
  const genie = { host, suggestionCount: taskCount, contextChips: [{ label: name || "business", active: true }], quickActions: [{ label: "Biggest opportunity?", prompt: `What's the single biggest growth opportunity for ${name}?` }] };

  return (
    <AppShell nav="home" taskCount={taskCount} businessName={host} status={status} genie={genie}>
      {state === "loading" && <p className="mt-10 text-center text-ink-400">Loading…</p>}

      {state === "ready" && !host && (
        <div className="mt-8 bg-surface border border-ink-900/[0.06] rounded-2xl p-10 text-center shadow-sm">
          <p className="text-lg font-bold text-ink-900">No business yet</p>
          <p className="mt-1 text-sm text-ink-400">Run your first scan to set up your business profile.</p>
          <a href="/" className="mt-4 inline-block grad-genie text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Run a scan →</a>
        </div>
      )}

      {state === "ready" && host && (
        <>
          {/* Header */}
          <div className="rounded-3xl p-7 grad-genie text-white shadow-lg">
            <p className="text-xs uppercase tracking-widest text-white/60">{industry || "Business"}</p>
            <h1 className="mt-1 text-2xl font-extrabold">{name}</h1>
            <p className="text-sm text-white/70">{host}</p>
            {score != null && (
              <div className="mt-4 flex items-end gap-3">
                <span className="font-mono font-bold leading-none" style={{ fontSize: "48px" }}>{score}</span>
                <div className="mb-1.5">
                  <span className="text-white/70 text-sm">/ 100 Marketing Score</span>
                  {delta != null && delta !== 0 && (
                    <p className={`text-xs font-mono font-semibold ${delta > 0 ? "text-emerald-100" : "text-red-100"}`}>{delta > 0 ? "▲ +" : "▼ "}{delta} since last scan</p>
                  )}
                </div>
              </div>
            )}
            <a href="/" className="mt-4 inline-block bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">Run new scan →</a>
          </div>

          {/* Tabs placeholder — Stage D fills SEO / Traffic / Integrations */}
          <div className="mt-4 flex gap-2 text-sm">
            <span className="font-semibold text-ink-900 border-b-2 border-brand-violet pb-1">Overview</span>
            <span className="text-ink-400 pb-1">SEO · soon</span>
            <span className="text-ink-400 pb-1">Traffic · soon</span>
          </div>

          {/* Scan history */}
          <div className="mt-4">
            <p className="text-sm font-semibold text-ink-900">Scan history</p>
            <div className="mt-2 space-y-2">
              {hostScans.slice().reverse().map((s) => (
                <a key={s.id} href={`/dashboard/scan/${s.id}`} className="flex items-center gap-4 bg-surface border border-ink-900/[0.06] rounded-xl px-4 py-3 hover:border-brand-violet/30 hover:shadow-sm transition">
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center font-mono font-bold text-white ${scoreColor(s.overall_score)}`}>{s.overall_score ?? "—"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-900 truncate">{name}</p>
                    <p className="text-xs text-ink-400">{fmt(s.created_at)}</p>
                  </div>
                  <span className="text-ink-400/50 text-sm">View →</span>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function scoreColor(v) {
  if (v == null) return "bg-ink-400";
  if (v >= 75) return "bg-emerald-500";
  if (v >= 50) return "bg-amber-500";
  return "bg-red-500";
}
function fmt(d) { try { return new Date(d).toLocaleString(); } catch { return ""; } }
