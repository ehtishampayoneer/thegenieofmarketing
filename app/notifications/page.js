"use client";

// ── STAGE 8 — THE NOTIFICATION CENTER ──
// One organized place so the user never misses a reply or opportunity.
// Replies come with Genie's drafted answer, ready to tap into the thread.
// This is the engine of sustained engagement: post → get replies → answer
// every one → conversation builds → real traction.

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { businessesFromScans } from "@/lib/business";
import AppShell from "@/components/shell/AppShell";

const KIND_META = {
  reply: { label: "Reply", icon: "💬", tint: "bg-brand-violet/10 text-brand-violet" },
  opportunity: { label: "Opportunity", icon: "🎯", tint: "bg-emerald-50 text-emerald-700" },
  traction: { label: "Hot", icon: "🔥", tint: "bg-orange-50 text-orange-700" },
  cooling: { label: "Cooling", icon: "❄️", tint: "bg-blue-50 text-blue-700" },
  published: { label: "Published", icon: "✅", tint: "bg-emerald-50 text-emerald-700" },
};

export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <Notifications />
    </Suspense>
  );
}

function Notifications() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState("loading");
  const [host, setHost] = useState("");
  const [ai, setAi] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const j = await res.json();
      if (j.ok) { setItems(j.notifications || []); setCounts(j.counts || {}); }
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
        const biz = businessesFromScans(j.ok ? j.scans || [] : []);
        if (active && biz[0]) { setHost(biz[0].host); setAi(biz[0].latest?.ai || null); }
      } catch {}
      await load();
      if (active) setState("ready");
    })();
    return () => { active = false; };
  }, [router, load]);

  async function scanNow() {
    setBusy(true);
    try {
      await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, ai }) });
      await load();
    } catch {}
    setBusy(false);
  }

  async function mark(id, status) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)).filter((n) => status !== "dismissed" || n.id !== id));
    try { await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); } catch {}
  }
  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, status: n.status === "unread" ? "read" : n.status })));
    try { await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: "read" }) }); } catch {}
  }

  const filtered = filter === "all" ? items : items.filter((n) => n.kind === filter);
  const replyCount = counts.replies || 0;
  const status = replyCount > 0
    ? { state: "pending_approval", message: `${replyCount} repl${replyCount > 1 ? "ies" : "y"} waiting — Genie drafted your answers.`, actionable: false }
    : { state: "idle", message: "You're all caught up.", actionable: false };

  return (
    <AppShell nav="notifications" taskCount={replyCount} businessName={host} status={status}>
      {state === "loading" && <p className="mt-10 text-center text-ink-400">Loading your inbox…</p>}

      {state === "ready" && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-ink-900">Inbox</h1>
              <p className="text-sm text-ink-400">Every reply and opportunity in one place — so you never miss engagement.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={scanNow} disabled={busy} className="grad-genie text-white text-sm font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                {busy ? "Checking…" : "↻ Check for replies"}
              </button>
              {items.some((n) => n.status === "unread") && (
                <button onClick={markAllRead} className="text-xs text-ink-400 hover:text-ink-600">Mark all read</button>
              )}
            </div>
          </div>

          {/* Filter chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {[["all", "All"], ["reply", `Replies${counts.replies ? " · " + counts.replies : ""}`], ["opportunity", "Opportunities"], ["traction", "Hot"]].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${filter === k ? "grad-genie text-white border-transparent" : "bg-surface border-ink-900/[0.1] text-ink-600 hover:border-brand-violet/30"}`}>
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="mt-8 bg-surface border border-ink-900/[0.06] rounded-2xl p-10 text-center shadow-sm">
              <p className="text-4xl mb-2">📭</p>
              <p className="text-sm font-semibold text-ink-900">Nothing here yet</p>
              <p className="mt-1 text-sm text-ink-400">Once Genie posts and people reply, their responses land here with your answer pre-written. Hit “Check for replies” anytime.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-2.5">
              {filtered.map((n) => <NotificationCard key={n.id} n={n} onMark={mark} />)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function NotificationCard({ n, onMark }) {
  const m = KIND_META[n.kind] || KIND_META.opportunity;
  const [copied, setCopied] = useState(false);
  const unread = n.status === "unread";

  async function reply() {
    if (n.draft) { try { await navigator.clipboard.writeText(n.draft); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {} }
    if (n.action_url) window.open(n.action_url, "_blank");
    onMark(n.id, "actioned");
  }

  return (
    <div className={`bg-surface border rounded-2xl p-4 shadow-sm transition ${unread ? "border-brand-violet/30" : "border-ink-900/[0.06]"}`}>
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${m.tint}`}>{m.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-ink-900">{n.title}</p>
            {unread && <span className="w-2 h-2 rounded-full bg-brand-violet shrink-0" />}
          </div>
          {n.body && <p className="mt-0.5 text-sm text-ink-600 line-clamp-2">{n.body}</p>}

          {/* Genie's drafted reply */}
          {n.draft && (
            <div className="mt-2 bg-surface2 border border-ink-900/[0.06] rounded-xl p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-violet mb-1">Genie drafted your reply</p>
              <p className="text-sm text-ink-900 whitespace-pre-wrap line-clamp-4">{n.draft}</p>
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            {n.kind === "reply" && n.action_url && (
              <button onClick={reply} className="grad-genie text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                {copied ? "✓ Copied — paste & reply" : n.draft ? "📋 Copy reply & open thread" : "Open thread →"}
              </button>
            )}
            {n.kind !== "reply" && n.action_url && (
              <a href={n.action_url} target="_blank" rel="noreferrer" onClick={() => onMark(n.id, "actioned")} className="grad-genie text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Open →</a>
            )}
            {unread && <button onClick={() => onMark(n.id, "read")} className="text-xs text-ink-400 hover:text-ink-600 px-2">Mark read</button>}
            <button onClick={() => onMark(n.id, "dismissed")} className="text-xs text-ink-400 hover:text-red-500 px-2">Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  );
}
