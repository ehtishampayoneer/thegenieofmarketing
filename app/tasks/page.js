"use client";

// ── GENIE CONSTITUTION (see lib/outcomes.js). This is the killer screen:
// one recommendation at a time (Focus Mode), outcome titles, one primary CTA.
// Stage A ships both modes functional; Stage C adds slide animation, keyboard
// shortcuts, and the celebration screen.

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hostOf } from "@/lib/business";
import { toOutcome, IMPACT_STYLES, sortByPriority } from "@/lib/outcomes";
import AppShell from "@/components/shell/AppShell";

const FILTERS = [
  ["all", "All"],
  ["article", "Articles"],
  ["social_post", "Social"],
  ["distribution", "Distribution"],
  ["outreach_email", "Outreach"],
  ["community_engagement", "Community"],
  ["directory_submission", "Directories"],
];

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <Tasks />
    </Suspense>
  );
}

function Tasks() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const business = searchParams.get("business") || "";
  const [state, setState] = useState("loading");
  const [actions, setActions] = useState([]);
  const [mode, setMode] = useState("focus"); // focus | list
  const [filter, setFilter] = useState("all");
  const [approvedToday, setApprovedToday] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      try {
        const res = await fetch("/api/actions?status=proposed");
        const j = await res.json();
        if (!active) return;
        let list = j.ok ? (j.actions || []) : [];
        if (business) list = list.filter((a) => hostOf(a.target?.host || "") === business || (a.target?.host || "") === business);
        setActions(sortByPriority(list));
        setState("ready");
      } catch { if (active) setState("ready"); }
    })();
    return () => { active = false; };
  }, [router, business]);

  async function decide(id, decision) {
    // optimistic remove
    setActions((prev) => prev.filter((a) => a.id !== id));
    if (decision === "approved") setApprovedToday((n) => n + 1);
    try {
      await fetch("/api/actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: decision }),
      });
    } catch {}
  }

  const filtered = filter === "all" ? actions : actions.filter((a) => a.type === filter);
  const taskCount = actions.length;

  const status = taskCount > 0
    ? { state: "pending_approval", message: `${taskCount} thing${taskCount > 1 ? "s" : ""} ready for your approval.`, actionable: false }
    : { state: "idle", message: "Inbox zero — Genie has nothing waiting.", actionable: false };

  const genie = {
    host: business,
    suggestionCount: taskCount,
    contextChips: [{ label: business || "All tasks", active: true }],
    quickActions: [{ label: "What should I approve first?", prompt: "Which of my pending tasks should I approve first and why?" }],
  };

  return (
    <AppShell nav="tasks" taskCount={taskCount} businessName={business} status={status} genie={genie}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-900">Tasks</h1>
          <p className="mt-0.5 text-sm text-ink-400">Approve one at a time. Genie handles the doing.</p>
        </div>
        <div className="flex items-center gap-1 bg-surface2 border border-ink-900/[0.06] rounded-xl p-1">
          <button onClick={() => setMode("focus")} className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${mode === "focus" ? "bg-surface shadow-sm text-ink-900" : "text-ink-400"}`}>Focus</button>
          <button onClick={() => setMode("list")} className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${mode === "list" ? "bg-surface shadow-sm text-ink-900" : "text-ink-400"}`}>List</button>
        </div>
      </div>

      {state === "loading" && <p className="mt-10 text-center text-ink-400">Loading your tasks…</p>}

      {state === "ready" && taskCount === 0 && (
        <div className="mt-8 bg-surface border border-ink-900/[0.06] rounded-2xl p-10 text-center shadow-sm">
          <div className="text-4xl">🎉</div>
          <p className="mt-3 text-lg font-bold text-ink-900">You're all caught up!</p>
          <p className="mt-1 text-sm text-ink-400">Genie will surface new tasks as you scan sites and generate content.</p>
          <a href="/dashboard" className="mt-4 inline-block grad-genie text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Back to Dashboard</a>
        </div>
      )}

      {state === "ready" && taskCount > 0 && mode === "focus" && (
        <FocusMode actions={filtered.length ? filtered : actions} total={taskCount} approvedToday={approvedToday} onDecide={decide} business={business} />
      )}

      {state === "ready" && taskCount > 0 && mode === "list" && (
        <>
          <div className="mt-4 flex gap-2 flex-wrap">
            {FILTERS.map(([id, label]) => {
              const n = id === "all" ? actions.length : actions.filter((a) => a.type === id).length;
              if (id !== "all" && n === 0) return null;
              return (
                <button key={id} onClick={() => setFilter(id)} className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${filter === id ? "bg-brand-violet text-white border-brand-violet" : "bg-surface text-ink-600 border-ink-900/[0.08] hover:border-brand-violet/30"}`}>
                  {label} {n > 0 && <span className="font-mono">{n}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((a) => <ListCard key={a.id} action={a} business={business} onApprove={() => decide(a.id, "approved")} onSkip={() => decide(a.id, "dismissed")} />)}
          </div>
        </>
      )}
    </AppShell>
  );
}

function ImpactBadge({ impact }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${IMPACT_STYLES[impact.tone]}`}>{impact.label}</span>;
}

function FocusMode({ actions, total, approvedToday, onDecide, business }) {
  const a = actions[0];
  if (!a) {
    return (
      <div className="mt-8 bg-surface border border-ink-900/[0.06] rounded-2xl p-10 text-center shadow-sm">
        <div className="text-4xl">🎉</div>
        <p className="mt-3 text-lg font-bold text-ink-900">You approved {approvedToday} task{approvedToday !== 1 ? "s" : ""} today!</p>
        <p className="mt-1 text-sm text-ink-400">Genie will handle publishing when integrations connect.</p>
        <a href="/dashboard" className="mt-4 inline-block grad-genie text-white text-sm font-semibold px-5 py-2.5 rounded-xl">Back to Dashboard</a>
      </div>
    );
  }
  const o = toOutcome(a);
  const done = total - actions.length + 1;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="mt-5">
      <div className="max-w-md mx-auto">
        <p className="text-center text-xs text-ink-400 font-mono">Task {done} of {total}</p>
        <div className="mt-1.5 h-1.5 rounded-full bg-ink-900/[0.06] overflow-hidden">
          <div className="h-full grad-genie rounded-full" style={{ width: `${pct}%`, transition: "width .4s ease" }} />
        </div>
      </div>

      <div className="mt-4 max-w-md mx-auto bg-surface border border-ink-900/[0.06] rounded-3xl p-7 shadow-lg">
        <div className="flex items-center justify-between">
          <ImpactBadge impact={o.impact} />
          <span className="text-xs text-ink-400">⏱ {o.secs} sec to approve</span>
        </div>
        <div className="mt-5 text-center">
          <div className="text-4xl">{o.icon}</div>
          <h2 className="mt-3 text-xl font-extrabold text-ink-900">{o.title}</h2>
          <p className="mt-1.5 text-sm text-ink-600">{o.value}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
          {o.categories.map((c) => <span key={c} className="text-[11px] bg-surface2 border border-ink-900/[0.06] text-ink-600 rounded-full px-2 py-0.5">{c}</span>)}
        </div>

        <FocusPreview action={a} />

        <div className="mt-6 space-y-2">
          <button onClick={() => onDecide(a.id, "approved")} className="w-full grad-genie text-white font-bold py-3.5 rounded-2xl active:scale-[0.99] transition">
            ✓ Approve &amp; Continue
          </button>
          <a href={`/dashboard/action/${a.id}${business ? `?business=${encodeURIComponent(business)}` : ""}`} className="block text-center text-sm text-brand-violet font-medium hover:underline">
            See full detail →
          </a>
          <button onClick={() => onDecide(a.id, "dismissed")} className="w-full text-ink-400 text-sm py-1.5 hover:text-ink-600">
            → Skip for now
          </button>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-ink-400">Approving queues it — Genie publishes when the integration connects. Community &amp; outreach you post yourself.</p>
    </div>
  );
}

function FocusPreview({ action }) {
  const p = action.payload || {};
  if (action.type === "article") {
    return (
      <div className="mt-4 bg-surface2 border border-ink-900/[0.06] rounded-2xl p-4">
        <p className="text-sm font-bold text-ink-900">{p.title}</p>
        <p className="mt-1 text-xs text-ink-600 line-clamp-3">{firstPara(p.body)}</p>
        {p.wordCount && <p className="mt-2 text-[11px] text-ink-400 font-mono">{p.wordCount} words</p>}
      </div>
    );
  }
  const draft = Array.isArray(p.draft) ? p.draft.join("\n\n") : (p.draft || p.text || "");
  if (draft) {
    return (
      <div className="mt-4 bg-surface2 border border-ink-900/[0.06] rounded-2xl p-4 max-h-40 overflow-y-auto thin-scroll">
        <p className="text-sm text-ink-900 whitespace-pre-wrap">{draft}</p>
      </div>
    );
  }
  return null;
}

function ListCard({ action, business, onApprove, onSkip }) {
  const o = toOutcome(action);
  return (
    <div className="bg-surface border border-ink-900/[0.06] rounded-2xl p-4 shadow-sm hover:shadow-md transition flex flex-col">
      <div className="flex items-center justify-between">
        <span className="text-xl">{o.icon}</span>
        <ImpactBadge impact={o.impact} />
      </div>
      <a href={`/dashboard/action/${action.id}${business ? `?business=${encodeURIComponent(business)}` : ""}`} className="mt-2 block flex-1">
        <p className="text-sm font-bold text-ink-900 line-clamp-2">{o.title}</p>
        <p className="mt-0.5 text-xs text-ink-600 line-clamp-2">{o.value}</p>
      </a>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={onApprove} className="flex-1 grad-genie text-white text-xs font-semibold py-2 rounded-lg hover:opacity-90">✓ Approve</button>
        <button onClick={onSkip} className="text-xs text-ink-400 px-2 hover:text-ink-600">Skip</button>
      </div>
    </div>
  );
}

function firstPara(body) {
  const t = String(body || "").split("\n").find((l) => l.trim() && !l.trim().startsWith("#"));
  return t || "";
}
