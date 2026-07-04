"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { businessesFromScans, businessName, hostOf as bHostOf } from "@/lib/business";
import AppShell from "@/components/shell/AppShell";

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState([]);
  const [host, setHost] = useState(null);
  const [email, setEmail] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [conn, setConn] = useState(null); // google connection status
  const [banner, setBanner] = useState("");
  const [actions, setActions] = useState([]);
  const [cadence, setCadence] = useState(null);
  const [cadenceBusy, setCadenceBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get("connected")) setBanner("✓ Google Search Console connected.");
    else if (searchParams.get("connect_error"))
      setBanner("Couldn't complete the Google connection. Please try again.");
  }, [searchParams]);

  // Preserve selected business from the URL (?business=host), e.g. returning
  // from an action detail page.
  useEffect(() => {
    const b = searchParams.get("business");
    if (b) setHost(b);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      if (active) setEmail(user.email || "");
      try {
        const res = await fetch("/api/scans");
        const j = await res.json();
        if (active && j.ok) {
          setScans(j.scans || []);
          const first = j.scans?.[0];
          if (first) setHost(hostOf(first));
        }
      } catch {}
      try {
        const cRes = await fetch("/api/connect/google");
        const cJson = await cRes.json();
        if (active) setConn(cJson);
      } catch {}
      try {
        const aRes = await fetch("/api/actions?status=proposed");
        const aJson = await aRes.json();
        if (active && aJson.ok) setActions(aJson.actions || []);
      } catch {}
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [router]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  // Load the cadence plan for the selected business.
  useEffect(() => {
    if (!host) { setCadence(null); return; }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/cadence?host=${encodeURIComponent(host)}`);
        const j = await res.json();
        if (active && j.ok) setCadence(j.plan);
      } catch {}
    })();
    return () => { active = false; };
  }, [host]);

  async function generateCadence() {
    if (!host || cadenceBusy) return;
    setCadenceBusy(true);
    const biz = businessesFromScans(scans).find((b) => b.host === host);
    try {
      const res = await fetch("/api/cadence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, ai: biz?.latest?.ai || null }),
      });
      const j = await res.json();
      if (j.ok) setCadence(j.plan);
    } catch {}
    setCadenceBusy(false);
  }

  async function dismissAction(id) {
    try {
      await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "dismissed" }),
      });
      setActions((a) => a.filter((x) => x.id !== id));
    } catch {}
  }

  async function disconnectGoogle() {
    if (!confirm("Disconnect Google Search Console? Genie will go back to estimated data.")) {
      return;
    }
    try {
      await fetch("/api/connect/google", { method: "DELETE" });
      setConn({ ok: true, connected: false });
      setBanner("Google disconnected.");
    } catch {
      alert("Couldn't disconnect. Try again.");
    }
  }

  async function deleteScan(id, label) {
    if (!confirm(`Delete this saved scan of ${label}? This can't be undone.`)) {
      return;
    }
    setDeleting(id);
    try {
      const res = await fetch(`/api/scans/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (j.ok) {
        const remaining = scans.filter((s) => s.id !== id);
        setScans(remaining);
        // If the selected site no longer has scans, switch to another.
        if (!remaining.some((s) => hostOf(s) === host)) {
          setHost(remaining[0] ? hostOf(remaining[0]) : null);
        }
      } else {
        alert("Couldn't delete that scan. Please try again.");
      }
    } catch {
      alert("Couldn't delete that scan. Please try again.");
    }
    setDeleting(null);
  }

  const hosts = [...new Set(scans.map(hostOf))];
  const businesses = businessesFromScans(scans);
  const selectedBiz = businesses.find((b) => b.host === host);
  const selectedScanIds = new Set(selectedBiz?.scanIds || []);

  // Actions belonging to the selected business (by linked scan or stored host).
  const bizActions = actions.filter(
    (a) => selectedScanIds.has(a.scan_id) || a.target?.host === host
  );
  // Actions we couldn't tie to any current business.
  const unassignedActions = actions.filter(
    (a) => !a.scan_id && !a.target?.host
  );

  const hostScans = scans
    .filter((s) => hostOf(s) === host)
    .slice()
    .reverse(); // oldest -> newest for the trend line

  const view = searchParams.get("view") || "home";
  const navMap = { home: "home", actions: "actions", content: "content", opportunities: "opportunities", integrations: "integrations", settings: "settings" };
  const navId = navMap[view] || "home";

  const pendingCount = bizActions.length;
  const status = pendingCount > 0
    ? { state: "pending_approval", message: `${pendingCount} item${pendingCount > 1 ? "s" : ""} waiting for your approval.`, actionable: false }
    : { state: "idle", message: "Genie is idle — run a new scan to give her work.", actionable: false };

  const genieProps = {
    host,
    suggestionCount: pendingCount,
    contextChips: [
      { label: host || "no business", active: true },
      { label: "Today", active: false },
    ],
    quickActions: [
      { label: "What should I do first?", prompt: `What should I do first for ${host || "my business"}?` },
      { label: "Summarize this business", prompt: `Give me a quick summary of ${host || "my business"} and its biggest opportunity.` },
    ],
  };

  return (
    <AppShell
      nav={navId}
      businesses={businesses}
      activeHost={host}
      onSelectBusiness={setHost}
      status={status}
      genie={genieProps}
    >
      {view !== "home" ? (
        <div className="bg-surface border border-ink-900/[0.06] rounded-2xl p-10 text-center shadow-sm">
          <div className="w-12 h-12 rounded-2xl grad-genie mx-auto" aria-hidden />
          <p className="mt-4 text-lg font-bold text-ink-900 capitalize">{view}</p>
          <p className="mt-1 text-sm text-ink-400">This section moves into the new command center next.</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold text-ink-900">
            {host ? `Genie's focus for ${host}` : "Your dashboard"}
          </h1>

          {banner && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">
              {banner}
            </div>
          )}

          <TodaysFocus actions={sortByPrio(bizActions)} host={host} onDismiss={dismissAction} />

          <CadencePlan cadence={cadence} onGenerate={generateCadence} busy={cadenceBusy} hasBusiness={!!host} />

          <ConnectionCard conn={conn} onDisconnect={disconnectGoogle} />

          {unassignedActions.length > 0 && (
            <PendingActions
              actions={unassignedActions}
              onDismiss={dismissAction}
              host={host}
              title="Unassigned actions"
            />
          )}

          {loading && (
            <p className="mt-8 text-center text-genie-ink/50">Loading your history…</p>
          )}

          {!loading && scans.length === 0 && (
            <div className="mt-8 bg-white border border-genie-ink/10 rounded-2xl p-10 text-center">
              <div className="w-14 h-14 rounded-2xl genie-gradient mx-auto" aria-hidden />
              <p className="mt-4 text-lg font-semibold text-genie-ink">
                Your growth history starts here
              </p>
              <p className="mt-1 text-sm text-genie-ink/55 max-w-sm mx-auto">
                Run a scan and it’ll be saved to your account. Scan the same site
                again over time and watch your score climb.
              </p>
              <a
                href="/"
                className="mt-5 inline-block genie-gradient text-white font-semibold px-5 py-3 rounded-xl"
              >
                Run your first scan →
              </a>
            </div>
          )}

          {!loading && scans.length > 0 && (
            <>
              {hosts.length > 1 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {hosts.map((h) => (
                    <button
                      key={h}
                      onClick={() => setHost(h)}
                      className={`text-sm px-3 py-1.5 rounded-full border transition ${
                        h === host
                          ? "genie-gradient text-white border-transparent"
                          : "bg-white text-genie-ink/70 border-genie-ink/15 hover:bg-genie-mist"
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-5 bg-white border border-genie-ink/10 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-genie-purple">
                    Score history · {host}
                  </p>
                  {hostScans.length > 0 && (
                    <span className="text-sm text-genie-ink/50">
                      {hostScans.length} scan{hostScans.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <TrendChart points={hostScans.map((s) => ({
                  score: s.overall_score ?? 0,
                  date: s.created_at,
                }))} />
                {hostScans.length === 1 && (
                  <p className="text-center text-sm text-genie-ink/50 mt-2">
                    Scan this site again later to see your trend line grow.
                  </p>
                )}
              </div>

              <div className="mt-6 space-y-2">
                {scans.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 bg-white border border-genie-ink/10 rounded-xl pr-2 hover:border-genie-purple/30 hover:shadow-sm transition"
                  >
                    <a
                      href={`/dashboard/scan/${s.id}`}
                      className="flex items-center gap-4 flex-1 min-w-0 px-4 py-3"
                    >
                      <ScoreBadge value={s.overall_score} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-genie-ink text-sm truncate">
                          {hostOf(s)}
                        </p>
                        <p className="text-xs text-genie-ink/50">{fmtDate(s.created_at)}</p>
                      </div>
                      {s.scores && (
                        <div className="hidden sm:flex gap-3 text-xs text-genie-ink/50">
                          <span>SEO {s.scores.seo ?? "–"}</span>
                          <span>Trust {s.scores.trust ?? "–"}</span>
                          <span>Speed {s.scores.speed ?? "–"}</span>
                        </div>
                      )}
                      <span className="text-genie-ink/30 text-sm hidden sm:inline">
                        View →
                      </span>
                    </a>
                    <button
                      onClick={() => deleteScan(s.id, hostOf(s))}
                      disabled={deleting === s.id}
                      aria-label="Delete scan"
                      className="p-2 rounded-lg text-genie-ink/30 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

function TrendChart({ points }) {
  if (!points || points.length === 0) return null;
  const w = 600, h = 170, pad = 26;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const xs =
    points.length === 1
      ? [w / 2]
      : points.map((_, i) => pad + (i * innerW) / (points.length - 1));
  const yOf = (score) => pad + innerH - (Math.max(0, Math.min(100, score)) / 100) * innerH;
  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${yOf(points[i].score)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full mt-3" style={{ maxHeight: 180 }}>
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={pad} x2={w - pad} y1={yOf(g)} y2={yOf(g)} stroke="#EEE" strokeWidth="1" />
          <text x={pad - 6} y={yOf(g) + 3} textAnchor="end" fontSize="9" fill="#9CA3AF">
            {g}
          </text>
        </g>
      ))}
      {points.length > 1 && (
        <path d={line} fill="none" stroke="#6B21A8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={yOf(points[i].score)} r="4" fill="#059669" />
          <text x={x} y={yOf(points[i].score) - 9} textAnchor="middle" fontSize="10" fontWeight="700" fill="#111827">
            {points[i].score}
          </text>
        </g>
      ))}
    </svg>
  );
}

const PRIO_ORDER = { high: 0, quick_win: 1, strategic: 2, medium: 3, low: 4 };
function sortByPrio(arr) {
  return [...arr].sort((a, b) => (PRIO_ORDER[a.priority] ?? 3) - (PRIO_ORDER[b.priority] ?? 3));
}
const PRIO_META = {
  high: { icon: "🔥", label: "High-impact", cls: "bg-red-50 text-red-600 border-red-200" },
  quick_win: { icon: "⚡", label: "Quick win", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  strategic: { icon: "🧠", label: "Strategic", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  low: { icon: "💤", label: "Low", cls: "bg-ink-900/[0.04] text-ink-400 border-ink-900/[0.08]" },
  medium: { icon: "", label: "Normal", cls: "bg-ink-900/[0.04] text-ink-600 border-ink-900/[0.08]" },
};
function actionIcon(t) {
  return t === "article" ? "📝" : t === "social_post" ? "📣" : t === "seo_fix" ? "🔧" :
    t === "outreach_email" ? "✉️" : t === "ad_campaign" ? "📢" : t === "distribution" ? "🌐" : t === "directory_submission" ? "📇" : "⚡";
}

function TodaysFocus({ actions, host, onDismiss }) {
  const [showAll, setShowAll] = useState(false);
  const bizParam = host ? `?business=${encodeURIComponent(host)}` : "";
  if (actions.length === 0) {
    return (
      <div className="mt-5 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
        <p className="text-sm font-semibold text-ink-900">Genie's Focus for Today</p>
        <p className="mt-1 text-sm text-ink-400">
          Nothing queued yet. Scan a site or generate content and Genie's top priorities show up here.
        </p>
      </div>
    );
  }
  const top = actions.slice(0, 3);
  const rest = actions.slice(3);
  const Row = (a) => {
    const m = PRIO_META[a.priority] || PRIO_META.medium;
    return (
      <a
        key={a.id}
        href={`/dashboard/action/${a.id}${bizParam}`}
        className="flex items-center gap-3 bg-surface2 border border-ink-900/[0.06] rounded-xl px-3 py-3 hover:border-brand-violet/30 hover:shadow-sm transition"
      >
        <span className="text-lg">{actionIcon(a.type)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-900 truncate">{a.title || a.type}</p>
          <p className="text-xs text-ink-400 capitalize">{String(a.type).replace("_", " ")}</p>
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${m.cls}`}>
          {m.icon} {m.label}
        </span>
        <span className="text-xs text-ink-400 hidden sm:inline">→</span>
      </a>
    );
  };
  return (
    <div className="mt-5 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-900">Genie's Focus for Today</p>
        <span className="text-xs text-ink-400">{actions.length} queued</span>
      </div>
      <div className="mt-3 space-y-2">
        {top.map(Row)}
        {showAll && rest.map(Row)}
      </div>
      {rest.length > 0 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-sm text-brand-violet font-medium hover:underline"
        >
          {showAll ? "Show less" : `See all ${actions.length} actions ▾`}
        </button>
      )}
    </div>
  );
}

function CadencePlan({ cadence, onGenerate, busy, hasBusiness }) {
  if (!hasBusiness) return null;
  if (!cadence) {
    return (
      <div className="mt-5 bg-surface border border-brand-violet/20 rounded-2xl p-6 shadow-sm text-center">
        <div className="w-12 h-12 rounded-2xl grad-genie mx-auto" aria-hidden />
        <p className="mt-3 text-lg font-bold text-ink-900">Let Genie propose a weekly rhythm</p>
        <p className="mt-1 text-sm text-ink-600 max-w-md mx-auto">
          Genie proposes a realistic weekly cadence for this business — articles, social, outreach,
          and more. A proposal you can adjust, not a commitment.
        </p>
        <button
          onClick={onGenerate}
          disabled={busy}
          className="mt-4 grad-genie text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-70"
        >
          {busy ? "Genie is planning…" : "Propose my weekly rhythm →"}
        </button>
      </div>
    );
  }
  return (
    <div className="mt-5 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-ink-900">Genie's proposed weekly rhythm</p>
        <div className="flex items-center gap-2">
          {cadence.stage && (
            <span className="text-[11px] bg-brand-violet/10 text-brand-violet rounded-full px-2 py-0.5 capitalize">
              {cadence.stage} stage
            </span>
          )}
          <button onClick={onGenerate} disabled={busy} className="text-xs text-brand-violet hover:underline disabled:opacity-50">
            {busy ? "…" : "Re-plan"}
          </button>
        </div>
      </div>
      {cadence.summary && <p className="mt-1 text-xs text-ink-400">{cadence.summary}</p>}
      <div className="mt-3 space-y-2">
        {(cadence.channels || []).map((c, i) => (
          <div key={i} className="flex items-start gap-3 bg-surface2 border border-ink-900/[0.06] rounded-xl px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-900">{c.channel}</p>
              {c.framing && <p className="text-xs text-ink-400">{c.framing}</p>}
            </div>
            <span className="text-sm font-mono text-brand-violet whitespace-nowrap">{c.cadence}</span>
          </div>
        ))}
      </div>
      {cadence.rationale && (
        <p className="mt-3 text-xs text-ink-600 bg-surface2 rounded-lg p-3">{cadence.rationale}</p>
      )}
      <p className="mt-3 text-[11px] text-ink-400">
        These are proposals you can adjust. Genie drafts outreach & community posts for you to review — it never auto-posts.
      </p>
    </div>
  );
}

function PendingActions({ actions, onDismiss, host, title }) {
  const icon = (t) =>
    t === "article" ? "📝" : t === "social_post" ? "📣" : t === "seo_fix" ? "🔧" :
    t === "outreach_email" ? "✉️" : t === "ad_campaign" ? "📢" : t === "distribution" ? "🌐" : t === "directory_submission" ? "📇" : "⚡";
  const bizParam = host ? `?business=${encodeURIComponent(host)}` : "";
  return (
    <div className="mt-5 bg-white border border-genie-purple/20 rounded-2xl p-5 shadow-sm">
      <p className="text-sm font-semibold text-genie-purple mb-1">
        {title} ({actions.length})
      </p>
      <p className="text-xs text-genie-ink/50 mb-3">
        Approve and Genie publishes them for you — auto-execution arrives with the publishing integrations.
      </p>
      <div className="space-y-2">
        {actions.map((a) => (
          <div key={a.id} className="flex items-center gap-3 border border-genie-ink/10 rounded-xl px-3 py-2.5 hover:border-genie-purple/30 transition">
            <a href={`/dashboard/action/${a.id}${bizParam}`} className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg">{icon(a.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-genie-ink truncate">{a.title || a.type}</p>
                <p className="text-xs text-genie-ink/45 capitalize">{a.type.replace("_", " ")} · proposed</p>
              </div>
              <span className="text-xs text-genie-ink/30 hidden sm:inline">View →</span>
            </a>
            <button
              onClick={() => onDismiss(a.id)}
              className="text-xs text-genie-ink/40 hover:text-red-500"
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionCard({ conn, onDisconnect }) {
  const connected = conn?.connected;
  return (
    <div className="mt-5 bg-white border border-genie-ink/10 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-genie-mist border border-genie-ink/10 flex items-center justify-center text-lg">
          🔍
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-genie-ink text-sm">Google Search Console</p>
          {connected ? (
            <p className="text-xs text-emerald-700 truncate">
              Connected{conn.email ? ` · ${conn.email}` : ""}
            </p>
          ) : (
            <p className="text-xs text-genie-ink/55">
              Connect to swap estimated keywords & traffic for real data (+15% accuracy).
            </p>
          )}
        </div>
        {connected ? (
          <button
            onClick={onDisconnect}
            className="text-sm text-genie-ink/55 hover:text-red-500 transition"
          >
            Disconnect
          </button>
        ) : (
          <a
            href="/api/connect/google/start"
            className="genie-gradient text-white text-sm font-semibold px-4 py-2 rounded-xl whitespace-nowrap"
          >
            Connect
          </a>
        )}
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ScoreBadge({ value }) {
  const v = value ?? 0;
  const color =
    v >= 75 ? "#059669" : v >= 60 ? "#F59E0B" : v >= 40 ? "#F97316" : "#EF4444";
  return (
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
      style={{ background: color }}
    >
      {value ?? "–"}
    </div>
  );
}

function hostOf(scan) {
  const u = scan.final_url || scan.url || "";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
