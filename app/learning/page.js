"use client";

// ── INTELLIGENCE (Operator surface) ──
// Where Genie's mind is visible: what it has learned from real results, how that
// changed its behavior, and the Decision Ledger — every choice + why + outcome.
// This is the trust layer. Competitors are black boxes; Genie shows its work.
// Representative data for the preview; wires to /api/learn + the decisions table.

import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Verified, Estimated } from "@/components/ui/v2/primitives";

const LEARNINGS = [
  { insight: "Reddit is one of your best channels (3 winning posts).", changed: "Now hunting Reddit first", weight: 4, dim: "Channel", verified: true },
  { insight: "“ar try before you buy” brings real, measured traffic.", changed: "Writing more content around it", weight: 3, dim: "Keyword", verified: true },
  { insight: "Comparison content is your biggest AI-search opening (5 gaps).", changed: "Prioritizing comparison pages", weight: 2, dim: "Content", verified: false },
  { insight: "Quora surfaces the most buyers for you.", changed: "Weighting Quora higher in the hunt", weight: 2, dim: "Buyer source", verified: false },
];

const CHANNELS = [
  { name: "Reddit", winning: 3, dud: 0, score: 88 },
  { name: "Quora", winning: 2, dud: 1, score: 64 },
  { name: "Blog", winning: 1, dud: 0, score: 58 },
  { name: "X", winning: 0, dud: 2, score: 22 },
];

const LEDGER = [
  { kind: "Buyer-intent pick", choice: "Reply to r/Entrepreneur — “best AR app for conversions”", why: "Comparison query, competitor mentioned, high intent (92).", outcome: "winning", metric: "34 upvotes · 11 replies", time: "2d ago" },
  { kind: "AI-search gap", choice: "Write “Best AR try-before-you-buy apps (2026)”", why: "AI cited 3 competitors, you in 0, for a decision-stage query.", outcome: "published", metric: "indexed · being re-checked", time: "1d ago" },
  { kind: "Learning synthesis", choice: "4 learnings from your results", why: "Reddit + Quora winning; comparison content wins AI citations.", outcome: "applied", metric: "behavior updated", time: "12h ago" },
  { kind: "Buyer-intent pick", choice: "Answer Quora — “alternatives to ARShop”", why: "Warmest buyer type: competitor-alternative seekers.", outcome: "pending", metric: "posted · watching", time: "6h ago" },
];

export default function LearningPage() {
  return (
    <OperatorShell active="analytics">
      <div className="mg-rise">
        <p className="flex items-center gap-2 text-[13px] font-medium mg-muted"><Icon.brain size={15} /> Intelligence</p>
        <h1 className="mt-2 text-[32px] leading-[1.08] font-extrabold tracking-tight" style={{ color: "var(--fg)" }}>
          Genie is getting <span className="dawn-text">smarter about you</span> every day.
        </h1>
        <p className="mt-2.5 text-[15px] mg-muted">Every result teaches Genie what works for your entity — and it’s already changing what it does next. Unlike a tool, it remembers.</p>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* What Genie learned */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>What Genie learned</h2>
            <span className="mg-pill mg-pill--dawn">{LEARNINGS.length}</span>
          </div>
          <div className="space-y-2.5">
            {LEARNINGS.map((l, i) => (
              <Card key={i} className="p-4 flex items-start gap-3">
                <span className="mg-tile mt-0.5" style={{ width: 32, height: 32, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.spark size={15} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>{l.insight}</p>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold flex items-center gap-1" style={{ color: "var(--accent-ink)" }}>
                      <Icon.arrowRight size={13} /> {l.changed}
                    </span>
                    <span className="mg-pill">{l.dim}</span>
                    {l.verified ? <Verified>from real data</Verified> : <Estimated>modelled</Estimated>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Channel performance */}
        <Card className="p-5 self-start">
          <h3 className="text-[13.5px] font-bold mb-3" style={{ color: "var(--fg)" }}>What’s winning</h3>
          <div className="space-y-3">
            {CHANNELS.map((c) => (
              <div key={c.name}>
                <div className="flex items-center justify-between text-[12.5px] mb-1">
                  <span style={{ color: "var(--fg)" }}>{c.name}</span>
                  <span className="mg-subtle mg-num">{c.winning}W · {c.dud}D</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                  <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: c.score >= 60 ? "var(--signal-live)" : c.score >= 40 ? "var(--accent)" : "var(--signal-danger)" }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11.5px] mg-subtle">Genie re-ranks where it hunts based on this — automatically.</p>
        </Card>
      </div>

      {/* Decision Ledger */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Decision Ledger</h2>
          <span className="mg-subtle text-[12.5px]">every choice Genie made — and why</span>
        </div>
        <Card className="overflow-hidden">
          {LEDGER.map((d, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-4" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
              <span className="mg-tile mt-0.5" style={{ width: 30, height: 30, background: outcomeTint(d.outcome).bg, color: outcomeTint(d.outcome).fg }}>
                <Icon.check size={14} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="mg-pill">{d.kind}</span>
                  <span className={`mg-pill ${outcomeClass(d.outcome)}`}>{d.outcome}</span>
                  <span className="ml-auto text-[11px] mg-subtle">{d.time}</span>
                </div>
                <p className="mt-1.5 text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{d.choice}</p>
                <p className="text-[12.5px] mg-muted mt-0.5"><span className="font-medium" style={{ color: "var(--fg-muted)" }}>Why:</span> {d.why}</p>
                <p className="text-[11.5px] mg-subtle mt-0.5">{d.metric}</p>
              </div>
            </div>
          ))}
        </Card>
        <p className="mt-3 text-center text-[13px] mg-subtle">Nothing Genie does is a black box. Ask “why?” anywhere — the answer is always here.</p>
      </div>
    </OperatorShell>
  );
}

function outcomeTint(o) {
  if (o === "winning" || o === "applied" || o === "published") return { bg: "var(--signal-live-soft)", fg: "var(--signal-live-ink)" };
  if (o === "pending") return { bg: "var(--accent-quiet)", fg: "var(--accent-ink)" };
  return { bg: "var(--surface-sunken)", fg: "var(--fg-muted)" };
}
function outcomeClass(o) {
  if (o === "winning" || o === "applied" || o === "published") return "mg-pill--live";
  if (o === "pending") return "mg-pill--dawn";
  return "";
}
