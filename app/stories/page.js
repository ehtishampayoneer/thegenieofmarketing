"use client";

// ── THE PLACEMENT STORY (signature wow) ──
// Each conversation Genie runs, told as a living story: found → wrote → posted
// → traction → replies → watching. Built native in the light-premium system.
// This is the surface that makes users FEEL Genie is running their marketing.

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { businessesFromScans } from "@/lib/business";
import AppShell from "@/components/shell/AppShell";
import { Card, SectionHeader, Button, Badge, Stat, LiveDot, Skeleton } from "@/components/ui/kit";

const PLATFORM = {
  reddit: { label: "Reddit", dot: "#FF4500" }, quora: { label: "Quora", dot: "#B92B27" },
  forum: { label: "Forum", dot: "#4F46E5" }, guest: { label: "Guest", dot: "#059669" },
  x: { label: "X", dot: "#111827" }, linkedin: { label: "LinkedIn", dot: "#0A66C2" },
  medium: { label: "Medium", dot: "#059669" }, wordpress: { label: "Blog", dot: "#2563EB" },
};

export default function StoriesPage() {
  return <Suspense fallback={null}><Stories /></Suspense>;
}

function Stories() {
  const router = useRouter();
  const [state, setState] = useState("loading");
  const [host, setHost] = useState("");
  const [stories, setStories] = useState([]);
  const [summary, setSummary] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/stories");
      const j = await res.json();
      if (j.ok) { setStories(j.stories || []); setSummary(j.summary || {}); }
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
        if (active && biz[0]) setHost(biz[0].host);
      } catch {}
      await load();
      if (active) setState("ready");
    })();
    return () => { active = false; };
  }, [router, load]);

  const status = summary.replies > 0
    ? { state: "pending_approval", message: `${summary.replies} repl${summary.replies > 1 ? "ies" : "y"} in your conversations.`, actionable: false }
    : { state: "idle", message: "Genie is running your conversations.", actionable: false };

  return (
    <AppShell nav="stories" taskCount={summary.replies || 0} businessName={host} status={status}>
      {state === "loading" && (
        <div className="space-y-3 mt-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>
      )}

      {state === "ready" && (
        <>
          {/* Hero summary */}
          <div className="rounded-3xl p-6 aperture-grad text-white shadow-pop relative overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4), transparent 50%)" }} />
            <div className="relative">
              <div className="flex items-center gap-2 text-white/70 text-xs uppercase tracking-widest">
                <LiveDot tone="emerald" /> Live conversations · {host}
              </div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Every conversation Genie is running for you</h1>
              <p className="mt-1 text-sm text-white/80 max-w-lg">Genie found these, wrote your placements, and keeps watching for replies — so the conversation never goes cold.</p>
              <div className="mt-5 flex gap-6">
                <HeroStat value={summary.total || 0} label="Conversations" />
                <HeroStat value={summary.live || 0} label="Live now" />
                <HeroStat value={summary.replies || 0} label="Replies waiting" />
                <HeroStat value={summary.winning || 0} label="Winning" />
              </div>
            </div>
          </div>

          {stories.length === 0 ? (
            <Card className="mt-6 p-10 text-center">
              <p className="text-4xl mb-2">🌱</p>
              <p className="font-semibold text-ink-900">No conversations yet</p>
              <p className="mt-1 text-sm text-ink-400 max-w-md mx-auto">Head to Growth and let Genie find openings. Each one becomes a living story here — from the moment he finds it to every reply after you post.</p>
              <a href="/growth" className="btn-primary inline-block mt-4 px-5 py-2.5">Find openings →</a>
            </Card>
          ) : (
            <div className="mt-6 space-y-4">
              {stories.map((s, i) => <StoryCard key={s.id} story={s} delay={i * 60} onAction={load} />)}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function HeroStat({ value, label }) {
  return (
    <div>
      <p className="text-2xl font-bold font-mono leading-none">{value}</p>
      <p className="text-[11px] text-white/70 mt-0.5">{label}</p>
    </div>
  );
}

function StoryCard({ story, delay, onAction }) {
  const [expanded, setExpanded] = useState(story.replyCount > 0);
  const plat = PLATFORM[story.platform] || { label: story.platform, dot: "#7C3AED" };
  const live = story.status === "posted";
  const winning = story.performance === "winning";

  return (
    <Card rise className="overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      {/* Header */}
      <div className="p-5 flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-xs" style={{ background: plat.dot }}>
          {plat.label[0]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-ink-900 truncate">{story.title}</p>
            {live && <Badge tone="emerald"><LiveDot tone="emerald" /> Live</Badge>}
            {winning && <Badge tone="amber">📈 Winning</Badge>}
            {story.status === "ready" && <Badge tone="violet">Ready to post</Badge>}
            {story.replyCount > 0 && <Badge tone="blue">💬 {story.replyCount} repl{story.replyCount > 1 ? "ies" : "y"}</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-ink-400">{plat.label}</span>
            {story.keyword && <span className="text-xs text-brand-violet">· 🎯 {story.keyword}</span>}
          </div>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="text-xs text-brand-violet font-medium shrink-0">
          {expanded ? "Collapse" : "See story"}
        </button>
      </div>

      {/* Timeline */}
      {expanded && (
        <div className="px-5 pb-5">
          <div className="relative pl-7">
            <div className="absolute left-[11px] top-1 bottom-1 w-px timeline-line" />
            {story.steps.map((step, i) => (
              <TimelineStep key={i} step={step} last={i === story.steps.length - 1} onAction={onAction} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function TimelineStep({ step, last, onAction }) {
  const [copied, setCopied] = useState(false);
  const isReply = step.stage === "reply";
  const isReady = step.stage === "ready";

  async function act() {
    if (step.draft) { try { await navigator.clipboard.writeText(step.draft); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }
    if (step.url) window.open(step.url, "_blank");
    onAction?.();
  }

  const dotColor = {
    found: "#7C3AED", wrote: "#4F46E5", posted: "#059669", ready: "#7C3AED",
    traction: "#6B7280", winning: "#F59E0B", reply: "#2563EB", watching: "#9CA3AF",
  }[step.stage] || "#7C3AED";

  return (
    <div className={`relative ${last ? "" : "pb-4"} animate-rise`}>
      <span className="absolute -left-7 top-0.5 w-[22px] h-[22px] rounded-full bg-surface border-2 flex items-center justify-center text-[10px]" style={{ borderColor: dotColor }}>
        {step.icon}
      </span>
      <div className="ml-1">
        <p className="text-sm font-semibold text-ink-900">{step.title}</p>
        {step.meta && <p className="text-[11px] text-brand-violet">{step.meta}</p>}
        {step.detail && <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{step.detail}</p>}

        {/* Reply with Genie's drafted answer */}
        {isReply && step.draft && (
          <div className="mt-2 bg-surface2 border border-hairline rounded-xl p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-violet mb-1">Genie drafted your answer</p>
            <p className="text-sm text-ink-900 whitespace-pre-wrap line-clamp-3">{step.draft}</p>
            <Button size="sm" className="mt-2" onClick={act}>
              {copied ? "✓ Copied — paste & reply" : "📋 Copy & open thread"}
            </Button>
          </div>
        )}
        {isReply && !step.draft && step.url && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={act}>Open thread →</Button>
        )}
        {isReady && (
          <a href="/growth" className="btn-primary inline-block mt-2 px-3 py-1.5 text-xs">Go post it →</a>
        )}
      </div>
    </div>
  );
}
