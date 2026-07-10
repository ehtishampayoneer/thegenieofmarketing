"use client";

// ── WAVE 2D: THE DAILY RITUAL ──
// Genie walks the user through today's work ONE CHANNEL AT A TIME, in order:
//   1. Publish to YOUR OWN accounts first (X -> LinkedIn -> Reddit -> blog)
//   2. Join community conversations (Reddit/Quora/forums) one channel at a time
//   3. Send outreach emails (profile baked in)
// Each channel: "Found N on X - let's post them" -> tap each -> "Perfect, X done!"

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { businessesFromScans } from "@/lib/business";
import AppShell from "@/components/shell/AppShell";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { GenieSays } from "@/components/ui/GenieVoice";
import Icon from "@/components/ui/Icon";

const PLATFORM_LABEL = { x: "X", twitter: "X", linkedin: "LinkedIn", medium: "Medium", wordpress: "your blog", blog: "your blog", reddit: "Reddit", quora: "Quora", forum: "forums", guest: "guest sites" };
const DONE_LINES = ["Boom - {p} is done!", "Nailed it - {p} complete!", "{p} handled. You're on fire!"];

export default function TodayPage() {
  return <Suspense fallback={null}><Today /></Suspense>;
}

function Today() {
  const router = useRouter();
  const [state, setState] = useState("loading");
  const [host, setHost] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [emails, setEmails] = useState([]);
  const [stage, setStage] = useState(0);
  const [doneMap, setDoneMap] = useState({});

  const load = useCallback(async (h) => {
    try {
      const res = await fetch(`/api/placements${h ? `?host=${encodeURIComponent(h)}` : ""}`);
      const j = await res.json();
      if (j.ok) setBlocks(j.blocks || []);
    } catch {}
    try {
      const r = await fetch("/api/actions?status=proposed");
      const j = await r.json();
      const em = (j.actions || j.items || []).filter((a) => a.type === "outreach_email");
      setEmails(em);
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
        if (active && biz[0]) { setHost(biz[0].host); await load(biz[0].host); }
      } catch {}
      if (active) setState("ready");
    })();
    return () => { active = false; };
  }, [router, load]);

  const ownBlocks = blocks.filter((b) => b.owned);
  const communityBlocks = blocks.filter((b) => !b.owned);
  const channels = [
    ...ownBlocks.map((b) => ({ kind: "own", block: b })),
    ...communityBlocks.map((b) => ({ kind: "community", block: b })),
    { kind: "email", emails },
  ];
  const totalTaps = blocks.reduce((n, b) => n + b.count, 0) + emails.length;
  const current = channels[stage];

  function markDone(id) { setDoneMap((m) => ({ ...m, [id]: true })); }
  function nextChannel() { setStage((s) => Math.min(s + 1, channels.length)); }

  const status = totalTaps > 0
    ? { state: "pending_approval", message: `${totalTaps} things to do today.`, actionable: false }
    : { state: "idle", message: "All done for today.", actionable: false };

  return (
    <AppShell nav="tasks" taskCount={totalTaps} businessName={host} status={status}>
      {state === "loading" && <p className="mt-10 text-center text-ink-400">Loading today's plan...</p>}

      {state === "ready" && (
        <>
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold text-ink tracking-tight">Today's plan</h1>
            <p className="text-sm text-ink-400 mt-1">One channel at a time. I've done the finding and the writing - you just tap. Let's go.</p>
          </div>

          {channels.length > 0 && stage < channels.length && (
            <div className="flex items-center gap-1.5 mb-6">
              {channels.map((c, i) => (
                <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-ink-100">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: i < stage ? "100%" : i === stage ? "40%" : "0%", background: i < stage ? "#1E9E6A" : "#11202E" }} />
                </div>
              ))}
            </div>
          )}

          {channels.length === 0 && (
            <div className="card p-10 text-center">
              <div className="inline-flex mb-3 text-ink"><Icon.check size={40} /></div>
              <p className="text-lg font-bold text-ink">You're all caught up!</p>
              <p className="mt-1 text-sm text-ink-400 max-w-md mx-auto">Nothing to post right now. Genie works overnight to find fresh conversations - come back tomorrow, or run a scan on Growth to find openings now.</p>
              <a href="/growth" className="btn-ink inline-block mt-4 px-5 py-2.5">Find openings now</a>
            </div>
          )}

          {stage >= channels.length && channels.length > 0 && (
            <div className="card p-10 text-center animate-scale-in">
              <p className="text-2xl font-extrabold text-ink"><GenieSays text="That's a wrap - today's tasks are done!" /></p>
              <p className="mt-2 text-sm text-ink-500 max-w-md mx-auto">Beautiful work. I'll keep watching overnight and line up fresh conversations and leads for tomorrow. Go enjoy your day.</p>
              <a href="/dashboard" className="btn-ink inline-block mt-5 px-6 py-3">Back to home</a>
            </div>
          )}

          {current && current.kind !== "email" && (
            <ChannelStep key={stage} channel={current} doneMap={doneMap} onDone={markDone} onComplete={nextChannel} host={host} />
          )}
          {current && current.kind === "email" && (
            <EmailStep emails={current.emails} doneMap={doneMap} onDone={markDone} onComplete={nextChannel} />
          )}
        </>
      )}
    </AppShell>
  );
}

function ChannelStep({ channel, doneMap, onDone, onComplete, host }) {
  const b = channel.block;
  const label = PLATFORM_LABEL[b.platform] || b.platform;
  const isOwn = channel.kind === "own";
  const remaining = b.items.filter((it) => !doneMap[it.id]).length;
  const allDone = remaining === 0;
  const intro = isOwn
    ? `First, let's post to ${label} - your own account. Getting active here builds your credibility so your community posts land better. I wrote ${b.count} for you.`
    : `Now let's join the conversation on ${label}. I found ${b.count} great spot${b.count > 1 ? "s" : ""} where your product genuinely fits - tap each to post your reply.`;
  const [showItems, setShowItems] = useState(false);

  return (
    <div className="animate-fade">
      <div className="flex items-center gap-3 mb-4">
        <BrandIcon brand={b.platform === "blog" ? "blog" : b.platform} size={22} />
        <div>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">{isOwn ? "Your account" : "Community"}</p>
          <p className="font-bold text-ink text-lg">{label}</p>
        </div>
        {allDone && <span className="ml-auto accent-soft text-xs font-semibold px-3 py-1 rounded-full">Done</span>}
      </div>

      <div className="card p-5 mb-4 bg-accent-soft border-0">
        <p className="text-base font-semibold text-ink">
          <GenieSays text={intro} onDone={() => setShowItems(true)} />
        </p>
      </div>

      <div className={`space-y-3 transition-opacity duration-500 ${showItems ? "opacity-100" : "opacity-40"}`}>
        {b.items.map((it) => (
          <PlacementTap key={it.id} placement={it} done={doneMap[it.id]} onDone={() => onDone(it.id)} host={host} />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-ink-400">{remaining > 0 ? `${remaining} left on ${label}` : `${label} complete!`}</p>
        <button onClick={onComplete} className={`px-6 py-3 flex items-center gap-2 rounded-xl ${allDone ? "btn-accent" : "btn-ghost"}`}>
          {allDone ? <>{DONE_LINES[0].replace("{p}", label)} Next <Icon.arrowRight size={18} /></> : <>Skip {label} for now</>}
        </button>
      </div>
    </div>
  );
}

function PlacementTap({ placement, done, onDone, host }) {
  const [copied, setCopied] = useState(false);
  async function post() {
    if (placement.draft) { try { await navigator.clipboard.writeText(placement.draft); setCopied(true); } catch {} }
    if (placement.target_url) window.open(placement.target_url, "_blank");
    try {
      await fetch("/api/placements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: placement.id, status: "posted", host }) });
    } catch {}
    onDone();
  }
  return (
    <div className={`card p-4 ${done ? "opacity-60" : "card-hover"}`}>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink text-sm truncate">{placement.target_title || placement.target_url}</p>
        {placement.keyword && <p className="text-[11px] accent-text">{placement.keyword}</p>}
        {placement.draft && <p className="mt-1.5 text-sm text-ink-600 line-clamp-2 bg-paper rounded-lg p-2 border border-hairline">{placement.draft}</p>}
      </div>
      <div className="mt-3">
        {done ? (
          <span className="text-sm accent-text font-semibold flex items-center gap-1"><Icon.check size={16} /> Posted{copied ? " . copied" : ""}</span>
        ) : (
          <button onClick={post} className="btn-ink px-4 py-2 text-sm flex items-center gap-1.5">
            <Icon.post size={16} /> Copy & open to post
          </button>
        )}
      </div>
    </div>
  );
}

function EmailStep({ emails, doneMap, onDone, onComplete }) {
  const [showItems, setShowItems] = useState(false);
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    (async () => { try { const r = await fetch("/api/outreach/campaign"); const j = await r.json(); if (j.ok) setStatus(j); } catch {} })();
  }, []);

  async function sendBatch() {
    setSending(true);
    try {
      const r = await fetch("/api/outreach/campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      setReport(j);
      const s = await fetch("/api/outreach/campaign").then((x) => x.json());
      if (s.ok) setStatus(s);
    } catch {}
    setSending(false);
  }

  const cap = status?.cap || 15;
  const remaining = status?.today?.remaining ?? cap;

  return (
    <div className="animate-fade">
      <div className="flex items-center gap-3 mb-4">
        <BrandIcon brand="mail" size={22} />
        <div>
          <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Outreach</p>
          <p className="font-bold text-ink text-lg">Email potential clients</p>
        </div>
        {status?.allTime?.sent > 0 && <span className="ml-auto text-xs text-ink-400">{status.allTime.sent} sent all-time · {status.allTime.replied} replied</span>}
      </div>

      <div className="card p-5 mb-4 bg-accent-soft border-0">
        <p className="text-base font-medium text-ink">
          <GenieSays text={`I know exactly who needs what you offer. I'll email ${remaining} fresh potential client${remaining !== 1 ? "s" : ""} today, each one personalized with your details, and follow up with anyone who doesn't reply. One tap and I'll handle the whole batch in the background.`} onDone={() => setShowItems(true)} />
        </p>
      </div>

      {report && (
        <div className="card p-4 mb-4">
          <p className="font-bold text-ink">{report.sent > 0 ? `${report.sent} emails sent` : "Batch complete"}</p>
          <p className="text-sm text-ink-500 mt-0.5">{report.message}</p>
        </div>
      )}

      <div className={`transition-opacity duration-500 ${showItems ? "opacity-100" : "opacity-40"}`}>
        <div className="card p-6 text-center">
          <p className="text-3xl font-mono font-bold text-ink">{remaining}</p>
          <p className="text-sm text-ink-400 mt-0.5">potential clients ready to reach today</p>
          <button onClick={sendBatch} disabled={sending || remaining === 0} className="btn-ink px-6 py-3 mt-4 disabled:opacity-50 inline-flex items-center gap-2">
            <Icon.mail size={18} /> {sending ? "Sending in background…" : remaining === 0 ? "Today's batch done" : `Send today's ${remaining} emails`}
          </button>
          <p className="text-[11px] text-ink-400 mt-2">Genie drips these out slowly so they land in inboxes, not spam.</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-ink-400">{status?.plan === "pro" ? "Pro" : "Free"} plan · up to {cap}/day</p>
        <button onClick={onComplete} className="btn-accent px-6 py-3 flex items-center gap-2 rounded-xl">
          Finish up <Icon.arrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

function EmailTap({ action, done, onDone }) {
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const p = action.payload || {};
  const to = p.to || p.recipient || action.target?.email || "";
  async function send() {
    setSending(true); setErr("");
    try {
      const res = await fetch("/api/outreach/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionId: action.id }) });
      const j = await res.json();
      if (j.ok) onDone();
      else setErr(j.error || "Couldn't send");
    } catch { setErr("Couldn't send"); }
    setSending(false);
  }
  return (
    <div className={`card p-4 ${done ? "opacity-60" : "card-hover"}`}>
      <p className="font-semibold text-ink text-sm">{action.title || "Outreach email"}</p>
      {to && <p className="text-[11px] text-ink-400">to {to}</p>}
      {p.draft && <p className="mt-1.5 text-sm text-ink-600 line-clamp-3 bg-paper rounded-lg p-2 border border-hairline">{Array.isArray(p.draft) ? p.draft.join("\n") : p.draft}</p>}
      <div className="mt-3">
        {done ? (
          <span className="text-sm accent-text font-semibold flex items-center gap-1"><Icon.check size={16} /> Sent</span>
        ) : (
          <button onClick={send} disabled={sending} className="btn-ink px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-50">
            <Icon.mail size={16} /> {sending ? "Sending..." : to ? "Send it" : "Open in email"}
          </button>
        )}
        {err && <p className="text-[11px] text-red-500 mt-1">{err}</p>}
      </div>
    </div>
  );
}
