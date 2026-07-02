"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

  useEffect(() => {
    if (searchParams.get("connected")) setBanner("✓ Google Search Console connected.");
    else if (searchParams.get("connect_error"))
      setBanner("Couldn't complete the Google connection. Please try again.");
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
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [router]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
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
  const hostScans = scans
    .filter((s) => hostOf(s) === host)
    .slice()
    .reverse(); // oldest -> newest for the trend line

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center gap-2">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg genie-gradient" aria-hidden />
          <span className="font-bold tracking-tight text-genie-ink">Marketing Genie</span>
        </a>
        <div className="ml-auto flex items-center gap-4">
          <a href="/chat" className="text-sm text-genie-purple font-medium hover:underline">
            Ask Genie
          </a>
          <a href="/" className="text-sm text-genie-purple font-medium hover:underline">
            New scan
          </a>
          <span className="text-sm text-genie-ink/55 hidden sm:inline">{email}</span>
          <button onClick={signOut} className="text-sm text-genie-ink/55 hover:text-genie-ink">
            Sign out
          </button>
        </div>
      </header>

      <section className="flex-1 px-6 pb-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-extrabold text-genie-ink">Your scans</h1>

          {banner && (
            <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">
              {banner}
            </div>
          )}

          <ConnectionCard conn={conn} onDisconnect={disconnectGoogle} />

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
        </div>
      </section>
    </main>
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
