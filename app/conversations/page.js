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
import { Card, Pill } from "@/components/ui/v2/primitives";
import { DataStateBadge, EmptyState } from "@/components/ui/v2/DataState";
import { useLive } from "@/lib/useLive";

const PLATFORM = {
  reddit: "reddit", quora: "quora", forum: "forum", guest: "wordpress",
  x: "x", linkedin: "linkedin", medium: "medium", wordpress: "blog", blog: "blog",
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
  const { data: d, state } = useLive("/api/stories", (j) => !(j.stories?.length));
  const s = d?.summary || {};

  return (
    <OperatorShell active="conversations">
      <OperatorHeader
        icon={Icon.conversations}
        label="Conversations"
        provenance={<DataStateBadge state={state} />}
        title="Genie is out there"
        accent="talking to your market."
      />

      {state !== "real" ? (
        <EmptyState
          state={state === "disconnected" ? "disconnected" : "empty"}
          icon={Icon.conversations}
          title="No conversations yet"
          sub="Once I run your first scan, I hunt for openings across Reddit, Quora, forums and more. Each one becomes a living story here — from the moment I find it to every reply after you post."
        />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <SummaryTile n={s.total || 0} label="Conversations" iconKey="conversations" tint="dawn" />
            <SummaryTile n={s.live || 0} label="Live now" iconKey="live" tint="live" />
            <SummaryTile n={s.replies || 0} label="Replies waiting" iconKey="reply" tint="info" />
            <SummaryTile n={s.winning || 0} label="Winning" iconKey="growth" tint="live" />
          </div>
          <div className="mt-5 space-y-4">
            {(d.stories || []).map((story, i) => (
              <StoryCard key={story.id || i} story={story} delay={i * 55} />
            ))}
          </div>
        </>
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
