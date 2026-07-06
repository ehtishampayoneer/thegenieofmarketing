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
  const [wp, setWp] = useState(null);

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
      try {
        const wRes = await fetch("/api/connect/wordpress");
        const wJson = await wRes.json();
        if (active) setWp(wJson);
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

  async function approveAction(id) {
    try {
      await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "approved" }),
      });
      setActions((a) => a.filter((x) => x.id !== id));
      setBanner("✓ Approved — it's in your publish queue.");
      setTimeout(() => setBanner(""), 2500);
    } catch {}
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
  // Operator-model rail: 6 items. Old views redirect to their new homes.
  const REDIRECTS = { actions: "/tasks", content: "/tasks", business: "/business", opportunities: "/dashboard?view=growth" };
  useEffect(() => {
    if (REDIRECTS[view]) router.replace(REDIRECTS[view]);
  }, [view, router]);
  const navMap = { home: "home", growth: "growth", history: "history", integrations: "connect", settings: "settings" };
  const navId = navMap[view] || "home";

  const pendingCount = bizActions.length;
  const status = pendingCount > 0
    ? { state: "pending_approval", message: `${pendingCount} thing${pendingCount > 1 ? "s" : ""} ready for your approval.`, actionable: false }
    : { state: "idle", message: "All caught up. Run a scan to give Genie more to do.", actionable: false };

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
      taskCount={pendingCount}
      businessName={host}
      status={status}
      genie={genieProps}
    >
      {view === "growth" && (
        <>
          <OpportunitiesView scans={scans} host={host} />
          <div className="mt-6">
            <CadencePlan cadence={cadence} onGenerate={generateCadence} busy={cadenceBusy} hasBusiness={!!host} />
          </div>
        </>
      )}
      {view === "history" && (
        <BusinessView
          host={host}
          hostScans={hostScans}
          scans={scans}
          deleting={deleting}
          onDelete={deleteScan}
        />
      )}
      {view === "integrations" && (
        <IntegrationsView conn={conn} onDisconnect={disconnectGoogle} banner={banner} />
      )}
      {view === "settings" && (
        <SettingsView email={email} onSignOut={signOut} />
      )}
      {view === "home" && scans.length === 0 && !loading && (
        <WelcomeEmptyState name={email ? email.split("@")[0] : ""} />
      )}
      {view === "home" && (scans.length > 0 || loading) && (
        <>
          <h1 className="text-2xl font-extrabold text-ink-900">
            Good morning{email ? `, ${email.split("@")[0]}` : ""}.
          </h1>

          {banner && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">
              {banner}
            </div>
          )}

          <MasterHealth hostScans={hostScans} host={host} wp={wp} actions={bizActions} />

          <PlatformGrid host={host} hostScans={hostScans} wp={wp} actions={bizActions} spendCap={0} />

          <TodaysFocus
            actions={sortByPrio(bizActions)}
            host={host}
            onDismiss={dismissAction}
            onApprove={approveAction}
          />

          <p className="mt-8 text-center text-sm text-ink-400">
            That's it for today. Come back tomorrow. ✨
          </p>
        </>
      )}
    </AppShell>
  );
}


// ---------- Rail views ----------
function ActionRow({ a, host }) {
  const m = PRIO_META[a.priority] || PRIO_META.medium;
  const bizParam = host ? `?business=${encodeURIComponent(host)}` : "";
  return (
    <a
      href={`/dashboard/action/${a.id}${bizParam}`}
      className="flex items-center gap-3 bg-surface border border-ink-900/[0.06] rounded-xl px-3 py-3 hover:border-brand-violet/30 hover:shadow-sm transition"
    >
      <span className="text-lg">{actionIcon(a.type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-900 truncate">{a.title || a.type}</p>
        <p className="text-xs text-ink-400 capitalize">{String(a.type).replace(/_/g, " ")}</p>
      </div>
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${m.cls}`}>
        {m.icon} {m.label}
      </span>
    </a>
  );
}

function EmptyCard({ title, sub, cta, href }) {
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-2xl p-10 text-center shadow-sm">
      <div className="w-12 h-12 rounded-2xl grad-genie mx-auto" aria-hidden />
      <p className="mt-4 text-lg font-bold text-ink-900">{title}</p>
      <p className="mt-1 text-sm text-ink-400 max-w-sm mx-auto">{sub}</p>
      {cta && (
        <a href={href} className="mt-4 inline-block grad-genie text-white font-semibold px-5 py-2.5 rounded-xl">
          {cta}
        </a>
      )}
    </div>
  );
}

const ACTION_GROUPS = [
  ["article", "📝 Articles"],
  ["social_post", "📣 Social posts"],
  ["distribution", "🌐 Distribution"],
  ["outreach_email", "✉️ Outreach"],
  ["directory_submission", "📇 Directories & PR"],
  ["community_engagement", "💬 Community"],
  ["seo_fix", "🔧 SEO fixes"],
  ["ad_campaign", "📢 Ads"],
];
const TYPE_GROUPS = [
  ["article", "📝 Articles"],
  ["social_post", "📣 Social posts"],
  ["distribution", "🌐 Distribution"],
  ["outreach_email", "✉️ Outreach"],
  ["directory_submission", "📇 Directories & PR"],
  ["community_engagement", "💬 Community"],
  ["seo_fix", "🔧 SEO fixes"],
  ["ad_campaign", "📢 Ads"],
];

function ActionMiniCard({ a, host }) {
  const bizParam = host ? `?business=${encodeURIComponent(host)}` : "";
  const m = PRIO_META[a.priority] || PRIO_META.medium;
  return (
    <a href={`/dashboard/action/${a.id}${bizParam}`} className="bg-surface border border-ink-900/[0.06] rounded-xl p-3 shadow-xs hover:shadow-md hover:border-brand-violet/30 transition flex flex-col">
      <div className="flex items-center gap-2">
        <span className="text-lg">{actionIcon(a.type)}</span>
        <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${m.cls}`}>{m.icon}</span>
      </div>
      <p className="mt-1.5 text-xs font-medium text-ink-900 line-clamp-2 flex-1">{a.title || a.type}</p>
      <span className="mt-2 text-[11px] text-brand-violet font-medium">Open →</span>
    </a>
  );
}

function ActionsView({ actions, host }) {
  if (actions.length === 0) {
    return <EmptyCard title="No pending actions" sub="Generate content, opportunities, or a growth plan from any scan and Genie's proposed actions land here." cta="Run a scan →" href="/?app=1" />;
  }
  const groups = TYPE_GROUPS.map(([type, label]) => [label, actions.filter((a) => a.type === type)]).filter(([, list]) => list.length > 0);
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink-900">Actions{host ? ` · ${host}` : ""}</h1>
      <p className="mt-1 text-sm text-ink-400">{actions.length} proposed · grouped by type · approve inside each</p>
      {groups.map(([label, list]) => (
        <div key={label} className="mt-6">
          <p className="text-sm font-semibold text-ink-900 mb-2">{label} <span className="text-ink-400 font-mono">{list.length}</span></p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {list.map((a) => <ActionMiniCard key={a.id} a={a} host={host} />)}
          </div>
        </div>
      ))}
    </>
  );
}

const CONTENT_TYPES = new Set(["article", "social_post", "distribution"]);
function ContentView({ actions, host }) {
  const content = actions.filter((a) => CONTENT_TYPES.has(a.type));
  if (content.length === 0) {
    return <EmptyCard title="No content yet" sub="Open any scan's Content tab and Genie writes articles, social posts, and distribution plans — they all show up here." cta="Run a scan →" href="/?app=1" />;
  }
  const cols = [
    ["📝 Articles", content.filter((a) => a.type === "article")],
    ["📣 Social", content.filter((a) => a.type === "social_post")],
    ["🌐 Distribution", content.filter((a) => a.type === "distribution")],
  ];
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink-900">Content{host ? ` · ${host}` : ""}</h1>
      <p className="mt-1 text-sm text-ink-400">Everything Genie has written, awaiting your approval.</p>
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {cols.map(([label, list]) => (
          <div key={label}>
            <p className="text-sm font-semibold text-ink-900 mb-2">{label} <span className="text-ink-400 font-mono">{list.length}</span></p>
            <div className="space-y-2">
              {list.length === 0 && <p className="text-xs text-ink-400 bg-surface border border-ink-900/[0.06] rounded-xl p-3">Nothing here yet.</p>}
              {list.map((a) => <ActionMiniCard key={a.id} a={a} host={host} />)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function OpportunitiesView({ scans, host }) {
  const latest = scans.find((s) => hostOf(s) === host) || scans[0];
  if (!latest) {
    return <EmptyCard title="No opportunities yet" sub="Scan a site first — then Genie maps keyword, competitor, content, and partnership opportunities." cta="Run a scan →" href="/" />;
  }
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink-900">Opportunities{host ? ` · ${host}` : ""}</h1>
      <p className="mt-1 text-sm text-ink-400">Opportunities live inside each scan's command center.</p>
      <div className="mt-5 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
        <p className="text-sm text-ink-600">
          Open your latest scan of <span className="font-medium text-ink-900">{hostOf(latest)}</span> and
          head to the <span className="font-medium text-ink-900">Opportunities tab</span> — growth
          opportunities, backlink outreach, directories & PR, and your community plan all live there.
        </p>
        <a
          href={`/dashboard/scan/${latest.id}`}
          className="mt-4 inline-block grad-genie text-white font-semibold px-5 py-2.5 rounded-xl"
        >
          Open latest scan →
        </a>
      </div>
    </>
  );
}

function IntegrationsView({ conn, onDisconnect, banner }) {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink-900">Integrations</h1>
      <p className="mt-1 text-sm text-ink-400">Connected accounts raise Genie's accuracy and let her publish for real.</p>
      {banner && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">{banner}</div>
      )}

      <p className="mt-6 text-sm font-semibold text-emerald-700">● Available now</p>
      <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ConnectionCard conn={conn} onDisconnect={onDisconnect} />
        <WordPressCard />
      </div>

      <p className="mt-8 text-sm font-semibold text-ink-400">○ Coming soon</p>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          ["📈", "Google Analytics", "Real visitor traffic · +15% accuracy"],
          ["⚫", "X / Twitter", "Auto-post approved threads & posts"],
          ["🔷", "LinkedIn", "Auto-post articles & updates"],
          ["🟢", "Medium", "Republish for reach (canonical)"],
          ["🛍️", "Shopify", "Auto-edit products & sales data"],
          ["✉️", "Email sending", "Auto-send approved outreach"],
          ["📢", "Google & Meta Ads", "Launch & manage campaigns"],
        ].map(([icon, name, desc]) => (
          <div key={name} className="flex items-center gap-3 bg-surface border border-ink-900/[0.06] rounded-2xl p-4 shadow-xs opacity-75">
            <span className="text-lg">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink-900 text-sm">{name}</p>
              <p className="text-xs text-ink-400">{desc}</p>
            </div>
            <span className="text-[11px] bg-ink-900/[0.05] text-ink-400 rounded-full px-2.5 py-1 whitespace-nowrap">Soon</span>
          </div>
        ))}
      </div>
    </>
  );
}

function WordPressCard() {
  const [wp, setWp] = useState(null);          // {connected, siteUrl, username}
  const [form, setForm] = useState({ siteUrl: "", username: "", appPassword: "" });
  const [state, setState] = useState("idle");  // idle | connecting | error
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/connect/wordpress");
        const j = await res.json();
        if (active) setWp(j);
      } catch {}
    })();
    return () => { active = false; };
  }, []);

  async function connect() {
    setState("connecting");
    setErr("");
    try {
      const res = await fetch("/api/connect/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!j.ok) { setState("error"); setErr(j.error || "Couldn't connect."); return; }
      setWp({ ok: true, connected: true, siteUrl: j.siteUrl, username: j.username });
      setState("idle");
      setOpen(false);
    } catch { setState("error"); setErr("Couldn't connect."); }
  }

  async function disconnect() {
    if (!confirm("Disconnect WordPress? Genie won't be able to publish articles until you reconnect.")) return;
    try {
      await fetch("/api/connect/wordpress", { method: "DELETE" });
      setWp({ ok: true, connected: false });
    } catch {}
  }

  const connected = wp?.connected;
  return (
    <div className="mt-3 bg-surface border border-ink-900/[0.06] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface2 border border-ink-900/[0.06] flex items-center justify-center text-lg">📝</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink-900 text-sm">WordPress</p>
          {connected ? (
            <p className="text-xs text-emerald-700 truncate">Connected · {wp.siteUrl}</p>
          ) : (
            <p className="text-xs text-ink-400">Connect your site and approved articles publish for real.</p>
          )}
        </div>
        {connected ? (
          <button onClick={disconnect} className="text-sm text-ink-400 hover:text-red-500 transition">Disconnect</button>
        ) : (
          <button onClick={() => setOpen((v) => !v)} className="grad-genie text-white text-sm font-semibold px-4 py-2 rounded-xl whitespace-nowrap">
            {open ? "Close" : "Connect"}
          </button>
        )}
      </div>

      {!connected && open && (
        <div className="mt-4 border-t border-ink-900/[0.06] pt-4 space-y-2">
          <input
            value={form.siteUrl}
            onChange={(e) => setForm({ ...form, siteUrl: e.target.value })}
            placeholder="Site URL — e.g. https://myblog.com"
            className="w-full px-3.5 py-2.5 rounded-xl border border-ink-900/[0.1] bg-surface outline-none focus:ring-2 focus:ring-brand-violet/30 text-sm"
          />
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="WordPress username"
            className="w-full px-3.5 py-2.5 rounded-xl border border-ink-900/[0.1] bg-surface outline-none focus:ring-2 focus:ring-brand-violet/30 text-sm"
          />
          <input
            value={form.appPassword}
            onChange={(e) => setForm({ ...form, appPassword: e.target.value })}
            placeholder="Application password"
            type="password"
            className="w-full px-3.5 py-2.5 rounded-xl border border-ink-900/[0.1] bg-surface outline-none focus:ring-2 focus:ring-brand-violet/30 text-sm"
          />
          <button
            onClick={connect}
            disabled={state === "connecting"}
            className="grad-genie text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-60"
          >
            {state === "connecting" ? "Checking your site…" : "Connect WordPress"}
          </button>
          {state === "error" && <p className="text-xs text-amber-700">{err}</p>}
          <p className="text-[11px] text-ink-400">
            Needs a self-hosted WordPress (5.6+). Create the application password in
            wp-admin → Users → Profile → Application Passwords. WordPress.com free plans don't support this.
          </p>
        </div>
      )}
    </div>
  );
}

function DailyBriefCard() {
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [err, setErr] = useState("");
  async function sendTest() {
    setState("sending");
    setErr("");
    try {
      const res = await fetch("/api/brief", { method: "POST" });
      const j = await res.json();
      if (j.ok) setState("sent");
      else { setState("error"); setErr(j.error || "Couldn't send."); }
    } catch { setState("error"); setErr("Couldn't send."); }
  }
  return (
    <div className="mt-3 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-ink-400">Daily brief</p>
      <p className="mt-1 text-sm text-ink-600">
        Every morning (8am PKT), Genie emails you her plan for the day — your top actions, ready to approve.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={sendTest}
          disabled={state === "sending"}
          className="grad-genie text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : "Send me a test brief"}
        </button>
        {state === "sent" && <span className="text-sm text-emerald-600">✓ Sent — check your inbox</span>}
        {state === "error" && <span className="text-sm text-amber-700">{err}</span>}
      </div>
    </div>
  );
}

function SettingsView({ email, onSignOut }) {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink-900">Settings</h1>
      <div className="mt-5 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-ink-400">Account</p>
        <p className="mt-1 text-sm font-medium text-ink-900">{email || "Signed in"}</p>
        <button
          onClick={onSignOut}
          className="mt-4 text-sm font-medium text-red-500 hover:text-red-600 border border-red-200 bg-red-50 rounded-xl px-4 py-2"
        >
          Sign out
        </button>
      </div>
      <DailyBriefCard />
      <SafetyCard />
      <div className="mt-3 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-ink-400">Onboarding</p>
        <a href="/welcome?replay=1" className="mt-1 inline-block text-sm font-medium text-brand-violet hover:underline">
          ✨ Watch Genie's intro again
        </a>
      </div>
      <div className="mt-3 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm opacity-80">
        <p className="text-xs uppercase tracking-wide text-ink-400">Plan</p>
        <p className="mt-1 text-sm text-ink-600">Free · plans & billing arrive with launch</p>
      </div>
    </>
  );
}


// ---------- Piece 4: simplified daily dashboard ----------
function computeHealth(hostScans, wp, actions) {
  const latest = hostScans[hostScans.length - 1];
  const prev = hostScans[hostScans.length - 2];
  const score = latest?.overall_score ?? null;
  const delta = score != null && prev?.overall_score != null ? score - prev.overall_score : null;
  return { score, delta };
}

function MasterHealth({ hostScans, host, wp, actions }) {
  const { score, delta } = computeHealth(hostScans, wp, actions);
  const [showInfo, setShowInfo] = useState(false);
  if (score == null) {
    return (
      <div className="mt-5 bg-surface border border-ink-900/[0.06] rounded-2xl p-8 shadow-sm text-center">
        <p className="text-sm font-semibold text-ink-900">Growth Health</p>
        <p className="mt-1 text-sm text-ink-400">Run your first scan and Genie starts tracking your growth health.</p>
        <a href="/?app=1" className="mt-3 inline-block grad-genie text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Run a scan &rarr;</a>
      </div>
    );
  }
  const label = score >= 75 ? "Healthy" : score >= 50 ? "Growing" : "Needs urgent work";
  const oneLiner = wp?.connected
    ? `Blog publishing live${actions.length ? ` \u00b7 ${actions.length} action${actions.length>1?"s":""} waiting` : ""}. Connect X, LinkedIn & Medium to unlock reach.`
    : `Blog scanned${actions.length ? ` \u00b7 ${actions.length} action${actions.length>1?"s":""} waiting` : ""}. Connect publishing & platforms to start growing.`;
  return (
    <div className="mt-5 rounded-3xl p-8 md:p-10 shadow-lg grad-genie text-white relative overflow-hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/60">Growth Health &middot; {host}</p>
          <div className="mt-2 flex items-end gap-4 flex-wrap">
            <span className="font-mono font-bold leading-none" style={{ fontSize: "72px" }}>{score}</span>
            <div className="mb-2">
              <span className="text-white/70 text-lg">/ 100</span>
              <p className="text-sm font-semibold text-white/90">{label}</p>
            </div>
            {delta != null && delta !== 0 && (
              <span className={`mb-3 text-sm font-mono font-bold rounded-full px-3 py-1 ${delta > 0 ? "bg-emerald-400/20 text-emerald-50" : "bg-red-400/20 text-red-50"}`}>
                {delta > 0 ? "\u25b2 +" : "\u25bc "}{delta} this scan
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setShowInfo((v) => !v)} className="text-white/50 hover:text-white text-sm border border-white/20 rounded-full w-6 h-6 flex items-center justify-center shrink-0" title="How this is calculated">i</button>
      </div>
      <div className="mt-5 h-5 rounded-full bg-white/20 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: "linear-gradient(90deg,#fca5a5,#fcd34d,#6ee7b7)", transition: "width 1.1s cubic-bezier(.2,.8,.2,1)" }} />
      </div>
      <p className="mt-4 text-base text-white/85 font-medium">{oneLiner}</p>
      {showInfo && (
        <p className="mt-2 text-[11px] text-white/60 max-w-lg">
          Based on your latest scan score + which platforms are connected. Per-platform health (impressions, karma, views) deepens as each platform connects.
        </p>
      )}
    </div>
  );
}

const PLATFORMS = [
  { id: "blog", icon: "🔵", name: "Blog" },
  { id: "x", icon: "⚫", name: "X / Twitter" },
  { id: "linkedin", icon: "🔷", name: "LinkedIn" },
  { id: "reddit", icon: "🟠", name: "Reddit" },
  { id: "quora", icon: "🟣", name: "Quora" },
  { id: "medium", icon: "🟢", name: "Medium" },
  { id: "ads", icon: "🎯", name: "Ads" },
  { id: "backlinks", icon: "🔗", name: "Backlinks" },
];

function platformState(id, { score, wp, counts }) {
  switch (id) {
    case "blog":
      if (wp?.connected && score != null) return { bar: score, badge: score >= 75 ? "Healthy ✅" : "Needs attention ⚠️", metric: `score ${score}`, cta: ["Details →", "/dashboard?view=business"] };
      if (score != null) return { bar: score, badge: "Scanned · publish not connected ⚠️", metric: `score ${score}`, cta: ["Connect →", "/dashboard?view=integrations"] };
      return { bar: 0, badge: "Not scanned 🔒", metric: "—", cta: ["Scan →", "/"] };
    case "x":
    case "linkedin":
    case "medium":
      return { bar: 0, badge: "Not connected 🔒", metric: "—", cta: ["Coming soon", null] };
    case "reddit": {
      const n = counts.community;
      return n > 0
        ? { bar: 25, badge: "Building 🟠", metric: `${n} draft${n > 1 ? "s" : ""} ready`, cta: ["Post drafts →", "/dashboard?view=actions"] }
        : { bar: 0, badge: "Not started 🔒", metric: "—", cta: ["Find communities →", "/dashboard?view=opportunities"] };
    }
    case "quora": {
      const n = counts.communityQuora;
      return n > 0
        ? { bar: 25, badge: "Building 🟠", metric: `${n} draft${n > 1 ? "s" : ""} ready`, cta: ["Post drafts →", "/dashboard?view=actions"] }
        : { bar: 0, badge: "Not started 🔒", metric: "—", cta: ["Find questions →", "/dashboard?view=opportunities"] };
    }
    case "ads":
      return { bar: 0, badge: "Locked 🔒 · $0 cap", metric: "no spend allowed", cta: ["Set cap →", "/dashboard?view=settings"] };
    case "backlinks": {
      const n = counts.outreach;
      return n > 0
        ? { bar: 20, badge: "Building 🟠", metric: `${n} outreach draft${n > 1 ? "s" : ""}`, cta: ["Send outreach →", "/dashboard?view=actions"] }
        : { bar: 0, badge: "Not started 🔒", metric: "—", cta: ["Build plan →", "/dashboard?view=opportunities"] };
    }
    default:
      return { bar: 0, badge: "—", metric: "—", cta: [null, null] };
  }
}

function PlatformGrid({ host, hostScans, wp, actions }) {
  const latest = hostScans[hostScans.length - 1];
  const score = latest?.overall_score ?? null;
  const counts = {
    community: actions.filter((a) => a.type === "community_engagement" && !String(a.title || "").toLowerCase().includes("quora")).length,
    communityQuora: actions.filter((a) => a.type === "community_engagement" && String(a.title || "").toLowerCase().includes("quora")).length,
    outreach: actions.filter((a) => a.type === "outreach_email" || a.type === "directory_submission").length,
  };
  return (
    <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
      {PLATFORMS.map((p) => {
        const st = platformState(p.id, { score, wp, counts });
        const val = st.bar;
        const barColor = val >= 70 ? "linear-gradient(90deg,#34d399,#059669)" : val >= 40 ? "linear-gradient(90deg,#fcd34d,#f59e0b)" : val > 0 ? "linear-gradient(90deg,#fb923c,#ef4444)" : "#E5E7EB";
        const pill = val >= 70 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : val >= 40 ? "bg-amber-50 text-amber-700 border-amber-200" : val > 0 ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-ink-900/[0.04] text-ink-400 border-ink-900/[0.08]";
        return (
          <div key={p.id} className="bg-surface border border-ink-900/[0.06] rounded-2xl p-5 shadow-sm flex flex-col hover:scale-[1.02] hover:shadow-md transition-transform">
            <div className="flex items-center justify-between">
              <span className="text-xl">{p.icon}</span>
              <span className="font-mono font-bold text-ink-900" style={{ fontSize: "30px", lineHeight: 1 }}>{val > 0 ? val : "\u2014"}</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-ink-900">{p.name}</p>
            <div className="mt-2 h-3 rounded-full bg-ink-900/[0.06] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(val, 3)}%`, background: barColor, transition: "width 1s ease" }} />
            </div>
            <span className={`mt-2.5 inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${pill}`}>{st.badge}</span>
            <p className="mt-1 text-[11px] text-ink-400 font-mono">{st.metric}</p>
            <div className="mt-auto pt-3">
              {st.cta[1] ? (
                <a href={st.cta[1]} className="text-xs font-semibold text-brand-violet hover:underline">{st.cta[0]}</a>
              ) : (
                <span className="text-xs text-ink-400/60">{st.cta[0]}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BusinessView({ host, hostScans, scans, deleting, onDelete }) {
  const list = scans.filter((s) => hostOf(s) === host);
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink-900">{host || "Business"}</h1>
      <p className="mt-1 text-sm text-ink-400">Scan history & score trend.</p>
      {hostScans.length > 0 && (
        <div className="mt-5 bg-surface border border-ink-900/[0.06] rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-ink-900">Score history · {host}</p>
          <TrendChart points={hostScans.map((s) => ({ score: s.overall_score ?? 0, date: s.created_at }))} />
          {hostScans.length === 1 && (
            <p className="mt-2 text-center text-xs text-ink-400">Scan this site again later to see your trend line grow.</p>
          )}
        </div>
      )}
      <div className="mt-4 space-y-2">
        {list.map((s) => (
          <div key={s.id} className="flex items-center gap-3 bg-surface border border-ink-900/[0.06] rounded-xl pr-2 hover:border-brand-violet/30 hover:shadow-sm transition">
            <a href={`/dashboard/scan/${s.id}`} className="flex items-center gap-4 flex-1 min-w-0 px-4 py-3">
              <ScoreBadge value={s.overall_score} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink-900 text-sm truncate">{hostOf(s)}</p>
                <p className="text-xs text-ink-400">{fmtDate(s.created_at)}</p>
              </div>
              <span className="text-ink-400/50 text-sm hidden sm:inline">View →</span>
            </a>
            <button
              onClick={() => onDelete(s.id, hostOf(s))}
              disabled={deleting === s.id}
              aria-label="Delete scan"
              className="p-2 rounded-lg text-ink-400/50 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-50"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
      <a href="/" className="mt-5 inline-block grad-genie text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Run a new scan →</a>
    </>
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
    t === "outreach_email" ? "✉️" : t === "ad_campaign" ? "📢" : t === "distribution" ? "🌐" : t === "directory_submission" ? "📇" : t === "community_engagement" ? "💬" : "⚡";
}

function TodaysFocus({ actions, host, onDismiss, onApprove }) {
  const [showAll, setShowAll] = useState(false);
  const bizParam = host ? `?business=${encodeURIComponent(host)}` : "";
  if (actions.length === 0) {
    return (
      <div className="mt-6 bg-surface border border-ink-900/[0.06] rounded-2xl p-6 shadow-sm">
        <p className="text-sm font-semibold text-ink-900">Genie's Focus for Today</p>
        <p className="mt-1 text-sm text-ink-400">Nothing queued yet. Scan a site or generate content and Genie's top priorities show up here.</p>
      </div>
    );
  }
  const shown = showAll ? actions : actions.slice(0, 3);
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold text-ink-900">Today's Actions</p>
        <span className="text-xs text-ink-400 font-mono">{actions.length} queued</span>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map((a) => {
          const m = PRIO_META[a.priority] || PRIO_META.medium;
          return (
            <div key={a.id} className="bg-surface border border-ink-900/[0.06] rounded-2xl p-4 shadow-sm hover:shadow-md transition flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xl">{actionIcon(a.type)}</span>
                <span className={`ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full border ${m.cls}`}>{m.icon} {m.label}</span>
              </div>
              <a href={`/dashboard/action/${a.id}${bizParam}`} className="mt-2 block flex-1">
                <p className="text-sm font-semibold text-ink-900 line-clamp-2">{a.title || a.type}</p>
                <p className="mt-0.5 text-xs text-ink-400 capitalize">{String(a.type).replace(/_/g, " ")}</p>
              </a>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => onApprove?.(a.id)} className="flex-1 text-xs font-semibold text-white grad-genie rounded-lg py-2 hover:opacity-90">✓ Approve</button>
                <a href={`/dashboard/action/${a.id}${bizParam}`} className="text-xs font-medium text-brand-violet px-3 py-2 hover:underline">Open</a>
              </div>
            </div>
          );
        })}
      </div>
      {actions.length > 3 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm text-brand-violet font-medium hover:underline">
          {showAll ? "Show less" : `See all ${actions.length} actions ▾`}
        </button>
      )}
    </div>
  );
}

function WelcomeEmptyState({ name }) {
  const [url, setUrl] = useState("");
  function go() {
    const clean = url.trim();
    if (!clean) return;
    const withProto = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    window.location.href = `/?scan=${encodeURIComponent(withProto)}`;
  }
  return (
    <div className="mt-6 text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-3xl grad-genie mx-auto shadow-lg" style={{ boxShadow: "0 0 40px rgba(124,58,237,0.35)" }} aria-hidden />
      <h1 className="mt-5 text-2xl font-extrabold text-ink-900">
        Good morning{name ? `, ${name}` : ""} 👋
      </h1>
      <p className="mt-2 text-ink-600">
        Let's get started. Give me your website and I'll show you exactly how to grow it — in about 30 seconds.
      </p>
      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="yourwebsite.com"
          className="flex-1 px-5 py-3.5 rounded-xl border border-ink-900/[0.1] bg-surface outline-none focus:ring-2 focus:ring-brand-violet/30 text-center sm:text-left"
        />
        <button onClick={go} className="grad-genie text-white font-bold px-7 py-3.5 rounded-xl active:scale-95 transition whitespace-nowrap">
          Scan my site →
        </button>
      </div>
      <p className="mt-4 text-xs text-ink-400">🔒 Private · No credit card · You'll see everything before Genie does anything</p>
    </div>
  );
}

function WeekStrip({ channels }) {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Rough activity heat: more channels with high cadence => busier week. We mark
  // weekdays busier than weekends as a simple, honest visual proposal.
  const weekdayLoad = Math.min(channels.length, 5);
  return (
    <div className="mt-3 flex gap-1.5">
      {DAYS.map((d, i) => {
        const weekend = i >= 5;
        const active = weekend ? weekdayLoad >= 4 : i < weekdayLoad + 2;
        return (
          <div key={d} className="flex-1 text-center">
            <div className={`h-10 rounded-lg flex items-center justify-center ${active ? "grad-genie" : "bg-ink-900/[0.05]"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : "bg-ink-200"}`} />
            </div>
            <span className="mt-1 block text-[10px] text-ink-400">{d}</span>
          </div>
        );
      })}
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
      <WeekStrip channels={cadence.channels || []} />
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
    t === "outreach_email" ? "✉️" : t === "ad_campaign" ? "📢" : t === "distribution" ? "🌐" : t === "directory_submission" ? "📇" : t === "community_engagement" ? "💬" : "⚡";
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
