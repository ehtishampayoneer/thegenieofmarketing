"use client";

// ── AI SEARCH VISIBILITY (Operator surface) ──
// The moment buyers ask ChatGPT / Perplexity / Google AI Overviews / Gemini a
// question, is Genie the answer? This surface shows exactly where the entity is
// invisible at the point of decision, who wins instead, and the content that
// captures the citation — each as an explainable OpportunityCard.
// Representative data for the preview; wires to /api/ai-search with the same shape.

import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { OpportunityCard } from "@/components/ui/v2/OpportunityCard";

const SCORE = { visible: 2, total: 6 };
const COMPETITORS = ["ARShop", "TryOn.io", "Vody"];

const OPPS = [
  {
    discovered: 'When buyers ask AI "best AR try-before-you-buy app," you’re not mentioned',
    badges: [{ label: "Comparing", tone: "dawn" }, { label: "Intent 92", tone: "neutral" }, { label: "Not cited", tone: "danger" }],
    why: "ChatGPT and Perplexity recommend 3 competitors instead — you’re invisible at the exact moment of decision, where buyers are choosing who to try.",
    recommendation: 'Publish an AEO answer page: “Best AR try-before-you-buy apps (2026)” with a direct answer + comparison table.',
    ifApproved: "Genie writes it in your voice, structures it to be quoted by AI (direct answer, comparison table, FAQ schema), and publishes to your blog.",
    outcome: "Become citable for a decision-stage query AI answers thousands of times a month.",
    rationale: "Modelled the AI answer from the current top-ranking sources; your domain appears in none. AI engines cite sources with a clear, structured, comparison-style answer — which none of your pages currently provide for this query.",
    sources: [{ title: "10 Best AR Shopping Apps — TechRadar", url: "#" }, { title: "AR try-on tools compared — Reddit r/ecommerce", url: "#" }],
    confidence: 74, tint: "dawn", icon: Icon.spark,
  },
  {
    discovered: '“alternatives to ARShop” — AI lists 4 competitors, not you',
    badges: [{ label: "Comparing", tone: "dawn" }, { label: "Competitor query", tone: "info" }, { label: "Not cited", tone: "danger" }],
    why: "People searching for alternatives to your competitor are your warmest buyers — and AI is handing them to other options.",
    recommendation: 'Publish “ARShop alternatives: honest comparison” positioning your ‘no enterprise bill’ edge.',
    ifApproved: "Genie drafts the comparison, fact-checks claims, and adds you to the answer set AI draws from.",
    outcome: "Intercept competitor-alternative demand — the highest-converting AI query type.",
    rationale: "The competitor is cited in 4 of 4 modelled answers; you in 0. A dedicated, fair comparison page is the fastest path into the citation set for alternative queries.",
    sources: [{ title: "ARShop alternatives — G2", url: "#" }],
    confidence: 81, tint: "dawn", icon: Icon.target,
  },
  {
    discovered: '“is AR shopping worth it” — AI answers without naming a product',
    badges: [{ label: "Ready to buy", tone: "dawn" }, { label: "Open citation", tone: "emerald" }],
    why: "A decision-stage question with no clear winner yet — the citation is up for grabs, and you can own it first.",
    recommendation: 'Publish a proof-led answer: “Is AR shopping worth it? Data from 250k try-ons.”',
    ifApproved: "Genie writes the data-backed answer and structures it as the definitive AI-citable source.",
    outcome: "Own an uncontested, high-intent AI answer before a competitor does.",
    rationale: "No brand is consistently cited for this question across modelled answers — a rare open slot. First-mover, proof-heavy content tends to become the cited source.",
    sources: [{ title: "Does AR reduce returns? — Shopify blog", url: "#" }],
    confidence: 69, tint: "emerald", icon: Icon.check,
  },
];

export default function AiSearchPage() {
  const pct = Math.round((SCORE.visible / SCORE.total) * 100);
  return (
    <OperatorShell active="aisearch">
      {/* Hero: the visibility picture */}
      <div className="mg-rise">
        <p className="flex items-center gap-2 text-[13px] font-medium mg-muted">
          <Icon.spark size={15} /> AI Search Visibility
        </p>
        <h1 className="mt-2 text-[32px] leading-[1.08] font-extrabold tracking-tight" style={{ color: "var(--fg)" }}>
          Buyers are asking AI about you.<br />
          <span className="dawn-text">Right now, it’s recommending {COMPETITORS.length} competitors instead.</span>
        </h1>
        <p className="mt-2.5 text-[15px] mg-muted">When someone asks ChatGPT, Perplexity, or Google’s AI a buying question in your space, Genie checks whether you’re the answer — and wins the ones you’re missing.</p>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* Visibility meter */}
        <Card className="p-5">
          <div className="flex items-baseline gap-2">
            <span className="text-[44px] font-bold leading-none mg-num" style={{ color: "var(--fg)" }}>{pct}%</span>
            <span className="mg-estimated">AI-modelled</span>
          </div>
          <p className="mt-1 text-[13px] mg-muted">You’re cited in <span className="font-semibold" style={{ color: "var(--fg)" }}>{SCORE.visible} of {SCORE.total}</span> buyer questions your customers ask AI.</p>
          <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-full rounded-full dawn-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--hair)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mg-subtle mb-2">AI recommends instead</p>
            <div className="flex flex-wrap gap-1.5">
              {COMPETITORS.map((c) => (
                <span key={c} className="mg-pill mg-pill--danger">{c}</span>
              ))}
            </div>
            <p className="mt-3 text-[12px] mg-muted">Approve the plays on the right and Genie closes these gaps — each becomes a piece of AI-citable content.</p>
          </div>
        </Card>

        {/* Opportunities */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Gaps to win</h2>
            <span className="mg-pill mg-pill--dawn">{OPPS.length} ready</span>
            <span className="ml-auto text-[12px] mg-subtle">ranked by buyer intent</span>
          </div>
          {OPPS.map((o, i) => (
            <OpportunityCard key={i} {...o} primaryLabel="Approve & write it" onApprove={() => {}} />
          ))}
        </div>
      </div>

      <p className="mt-8 mb-2 text-center text-[13px] mg-subtle">
        Genie re-checks AI search as your content publishes — and learns which plays win citations for you.
      </p>
    </OperatorShell>
  );
}
