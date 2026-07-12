"use client";

// ── CONVERSATIONS — the living work, told as stories ──
// Every conversation Genie is running for you, as a story: found → wrote →
// posted → traction → replies → watching. This is the surface that makes you
// FEEL an employee is out there talking to the market on your behalf. Reads
// /api/stories (real when signed in); representative sample for the preview.
// Migrated from the V1 /stories page into the Operator (Aperture) language.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Card, Pill, Provenance } from "@/components/ui/v2/primitives";
import { fetchLive } from "@/lib/live";

const PLATFORM = {
  reddit: "reddit", quora: "quora", forum: "forum", guest: "wordpress",
  x: "x", linkedin: "linkedin", medium: "medium", wordpress: "blog", blog: "blog",
};

const FALLBACK = {
  summary: { total: 8, live: 5, replies: 3, winning: 2 },
  stories: [
    {
      id: "s1", title: "How do you handle AR product returns at scale?", platform: "reddit",
      keyword: "ar try before you buy", status: "posted", performance: "winning", replyCount: 2,
      steps: [
        { stage: "found", title: "Found the conversation", meta: "r/ecommerce · high buyer intent", detail: "Someone comparing AR try-on tools and asking which actually reduces returns." },
        { stage: "wrote", title: "Wrote your reply", detail: "A specific, non-promotional answer that leads with the returns data." },
        { stage: "posted", title: "You posted it", meta: "3 hours ago" },
        { stage: "winning", title: "It's gaining traction", meta: "▲ 34 upvotes · top comment" },
        { stage: "reply", title: "Someone replied to you", detail: "“This is exactly the breakdown I needed — does it work for apparel?”", draft: "Yes — apparel is where try-before-you-buy pays off most, because fit is the #1 return reason. Here's how we approached sizing…", url: "https://reddit.com" },
      ],
    },
    {
      id: "s2", title: "Best AR shopping tools for small Shopify stores?", platform: "quora",
      keyword: "ar shopping tools", status: "posted", performance: "flat", replyCount: 0,
      steps: [
        { stage: "found", title: "Found the question", meta: "Quora · 2.1k views" },
        { stage: "wrote", title: "Wrote your answer", detail: "Framed around budget-first stores, mentions you as one of three options." },
        { stage: "posted", title: "You posted it", meta: "yesterday" },
        { stage: "watching", title: "Watching for engagement", meta: "Genie checks back daily" },
      ],
    },
    {
      id: "s3", title: "Guest post: 10 AR trends reshaping eCommerce in 2026", platform: "guest",
      keyword: "ar ecommerce trends", status: "ready", performance: null, replyCount: 0,
      steps: [
        { stage: "found", title: "Found a publisher accepting pitches", meta: "DR 68 · eCommerce audience" },
        { stage: "wrote", title: "Drafted the full article", detail: "1,400 words, ready to submit — links back to your trends page." },
        { stage: "ready", title: "Ready for you to send", detail: "Approve and Genie hands you the pitch + draft." },
      ],
    },
  ],
};

const STAGE = {
  found:   { icon: Icon.search,        tint: "dawn"  },
  wrote:   { icon: Icon.write,         tint: "info"  },
  posted:  { icon: Icon.check,         tint: "live"  },
  ready:   { icon: Icon.spark,         tint: "dawn"  },
  traction:{ icon: Icon.growth,        tint: "muted" },
  winning: { icon: Icon.growth,        tint: "live"  },
  reply:   { icon: Icon.reply,         tint: "info"  },
  watching:{ icon: Icon.eye || Icon.search, tint: "muted" },
};

export default function ConversationsPage() {
  const [d, setD] = useState(FALLBACK);
  const [live, setLive] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/stories");
      if (live && data) { setD({ summary: data.summary || {}, stories: data.stories || [] }); setLive(true); }
    })();
  }, []);

  const s = d.summary || {};
  const hasStories = (d.stories || []).length > 0;

  return (
    <OperatorShell active="conversations">
      <OperatorHeader
        icon={Icon.conversations}
        label="Conversations"
        provenance={live ? (hasStories ? <Provenance kind="live">Running now</Provenance> : <Provenance kind="early" />) : <Provenance kind="sample" />}
        title="Genie is out there"
        accent="talking to your market."
      />

      {/* Summary strip */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <SummaryTile n={s.total || 0} label="Conversations" iconKey="conversations" tint="dawn" />
        <SummaryTile n={s.live || 0} label="Live now" iconKey="live" tint="live" />
        <SummaryTile n={s.replies || 0} label="Replies waiting" iconKey="reply" tint="info" />
        <SummaryTile n={s.winning || 0} label="Winning" iconKey="growth" tint="live" />
      </div>

      {!hasStories ? (
        <Card className="mt-5 p-10 text-center">
          <span className="mg-tile mx-auto" style={{ width: 44, height: 44, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.conversations size={20} /></span>
          <p className="mt-3 text-[16px] font-bold" style={{ color: "var(--fg)" }}>No conversations yet</p>
          <p className="mt-1 text-[13.5px] mg-muted max-w-md mx-auto">Genie is scanning for openings across Reddit, Quora, forums and more. Each one it finds becomes a living story here — from the moment it's found to every reply after you post.</p>
          <a href="/growth" className="mg-btn mg-btn--dawn mt-4 inline-flex" style={{ fontSize: 13 }}>See where Genie is growing you →</a>
        </Card>
      ) : (
        <div className="mt-5 space-y-4">
          {(d.stories || []).map((story, i) => (
            <StoryCard key={story.id || i} story={story} delay={i * 55} />
          ))}
        </div>
      )}
    </OperatorShell>
  );
}

function SummaryTile({ n, label, iconKey, tint }) {
  const t = tone(tint);
  const IconC = iconKey === "live" ? null : (Icon[iconKey] || Icon.spark);
  return (
    <Card className="p-4 flex items-center gap-3">
      <span className="mg-tile" style={{ width: 36, height: 36, background: t.bg, color: t.fg }}>
        {iconKey === "live" ? <span className="mg-live-dot" /> : <IconC size={16} />}
      </span>
      <div>
        <div className="mg-stat-num">{n}</div>
        <div className="mg-stat-label">{label}</div>
      </div>
    </Card>
  );
}

function StoryCard({ story, delay }) {
  const winning = story.performance === "winning";
  const posted = story.status === "posted";
  const ready = story.status === "ready";
  const [open, setOpen] = useState(story.replyCount > 0 || ready);

  return (
    <Card className="overflow-hidden mg-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className="p-5 flex items-start gap-3">
        <BrandIcon brand={PLATFORM[story.platform] || "blog"} size={20} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-bold truncate" style={{ color: "var(--fg)" }}>{story.title}</p>
            {posted && <Pill tone="live"><span className="mg-live-dot" /> Live</Pill>}
            {winning && <Pill tone="dawn">Winning</Pill>}
            {ready && <Pill tone="dawn">Ready to post</Pill>}
            {story.replyCount > 0 && <Pill tone="info">{story.replyCount} repl{story.replyCount > 1 ? "ies" : "y"}</Pill>}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[12px] mg-muted">
            <span className="capitalize">{story.platform}</span>
            {story.keyword && <><span>·</span><span style={{ color: "var(--accent-ink)" }}>{story.keyword}</span></>}
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="mg-btn mg-btn--quiet shrink-0" style={{ fontSize: 12 }}>
          {open ? "Collapse" : "See story"}
        </button>
      </div>

      {open && (
        <div className="px-5 pb-5">
          <div className="relative pl-8">
            <div className="absolute top-1 bottom-2" style={{ left: 14, width: 1, background: "var(--border)" }} />
            {(story.steps || []).map((step, i) => (
              <TimelineStep key={i} step={step} last={i === story.steps.length - 1} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function TimelineStep({ step, last }) {
  const [copied, setCopied] = useState(false);
  const meta = STAGE[step.stage] || STAGE.found;
  const IconC = meta.icon;
  const t = tone(meta.tint);
  const isReply = step.stage === "reply";
  const isReady = step.stage === "ready";

  async function act() {
    if (step.draft) { try { await navigator.clipboard.writeText(step.draft); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }
    if (step.url) window.open(step.url, "_blank");
  }

  return (
    <div className={`relative ${last ? "" : "pb-4"}`}>
      <span className="absolute rounded-full flex items-center justify-center" style={{ left: -32, top: 0, width: 28, height: 28, background: t.bg, color: t.fg, border: "1px solid var(--border)" }}>
        <IconC size={14} />
      </span>
      <div className="ml-1 pt-0.5">
        <p className="text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{step.title}</p>
        {step.meta && <p className="text-[11.5px] mt-0.5" style={{ color: "var(--accent-ink)" }}>{step.meta}</p>}
        {step.detail && <p className="text-[12.5px] mg-muted mt-0.5">{step.detail}</p>}

        {isReply && step.draft && (
          <div className="mt-2.5 mg-surface-quiet p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: "var(--accent-ink)" }}>Genie drafted your answer</p>
            <p className="text-[13px] whitespace-pre-wrap" style={{ color: "var(--fg-muted)" }}>{step.draft}</p>
            <button onClick={act} className="mg-btn mg-btn--dawn mt-2.5" style={{ fontSize: 12 }}>
              {copied ? "Copied — paste & reply" : "Copy & open thread"}
            </button>
          </div>
        )}
        {isReply && !step.draft && step.url && (
          <button onClick={act} className="mg-btn mg-btn--quiet mt-2" style={{ fontSize: 12 }}>Open thread →</button>
        )}
        {isReady && (
          <a href="/approvals" className="mg-btn mg-btn--dawn inline-flex mt-2" style={{ fontSize: 12 }}>Review & send →</a>
        )}
      </div>
    </div>
  );
}

function tone(name) {
  switch (name) {
    case "live": return { bg: "var(--signal-live-soft)", fg: "var(--signal-live-ink)" };
    case "info": return { bg: "var(--signal-info-soft)", fg: "var(--signal-info)" };
    case "dawn": return { bg: "var(--accent-quiet)", fg: "var(--accent-ink)" };
    default: return { bg: "var(--surface-sunken)", fg: "var(--fg-muted)" };
  }
}
