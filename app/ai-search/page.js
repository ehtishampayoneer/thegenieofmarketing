"use client";

// ── AI SEARCH VISIBILITY (Operator surface, live) ──
// Reads stored AI-search gaps (from the Decision Ledger) via /api/ai-search and
// falls back to representative data for the preview. Each gap is an explainable
// OpportunityCard: discovered · why · recommendation · if approved · outcome.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Provenance } from "@/components/ui/v2/primitives";
import { OpportunityCard } from "@/components/ui/v2/OpportunityCard";
import { fetchLive } from "@/lib/live";

const FALLBACK = {
  score: 33,
  competitors: ["ARShop", "TryOn.io", "Vody"],
  opportunities: [
    {
      discovered: 'When buyers ask AI “best AR try-before-you-buy app,” you’re not mentioned',
      badges: [{ label: "Comparing", tone: "dawn" }, { label: "Intent 92", tone: "neutral" }, { label: "Not cited", tone: "danger" }],
      why: "ChatGPT and Perplexity recommend 3 competitors instead — you’re invisible at the exact moment of decision.",
      recommendation: 'Publish an AEO answer page: “Best AR try-before-you-buy apps (2026)” with a direct answer + comparison table.',
      ifApproved: "Genie writes it in your voice, structures it to be quoted by AI (direct answer, comparison table, FAQ schema), and publishes.",
      outcome: "Become citable for a decision-stage query AI answers thousands of times a month.",
      rationale: "Modelled the AI answer from the current top-ranking sources; your domain appears in none. AI cites sources with a clear, structured comparison answer — which none of your pages provide for this query.",
      sources: [{ title: "10 Best AR Shopping Apps — TechRadar", url: "#" }, { title: "AR try-on tools compared — Reddit", url: "#" }],
      confidence: 74, tint: "dawn",
    },
    {
      discovered: '“alternatives to ARShop” — AI lists 4 competitors, not you',
      badges: [{ label: "Comparing", tone: "dawn" }, { label: "Competitor query", tone: "info" }, { label: "Not cited", tone: "danger" }],
      why: "People searching for alternatives to your competitor are your warmest buyers — and AI is handing them to other options.",
      recommendation: 'Publish “ARShop alternatives: honest comparison” positioning your ‘no enterprise bill’ edge.',
      ifApproved: "Genie drafts the comparison, fact-checks claims, and adds you to the answer set AI draws from.",
      outcome: "Intercept competitor-alternative demand — the highest-converting AI query type.",
      rationale: "The competitor is cited in 4 of 4 modelled answers; you in 0. A fair comparison page is the fastest path into the citation set.",
      sources: [{ title: "ARShop alternatives — G2", url: "#" }],
      confidence: 81, tint: "dawn",
    },
    {
      discovered: '“is AR shopping worth it” — AI answers without naming a product',
      badges: [{ label: "Ready to buy", tone: "dawn" }, { label: "Open citation", tone: "live" }],
      why: "A decision-stage question with no clear winner yet — the citation is up for grabs, and you can own it first.",
      recommendation: 'Publish a proof-led answer: “Is AR shopping worth it? Data from 250k try-ons.”',
      ifApproved: "Genie writes the data-backed answer and structures it as the definitive AI-citable source.",
      outcome: "Own an uncontested, high-intent AI answer before a competitor does.",
      rationale: "No brand is consistently cited for this question — a rare open slot. First-mover, proof-heavy content tends to win the citation.",
      sources: [{ title: "Does AR reduce returns? — Shopify", url: "#" }],
      confidence: 69, tint: "emerald",
    },
  ],
};

export default function AiSearchPage() {
  const [d, setD] = useState(FALLBACK);
  const [live, setLive] = useState(false);
  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/ai-search");
      if (live && data) {
        setD({ score: data.score ?? 0, competitors: data.competitors || [], opportunities: data.opportunities || [] });
        setLive(true);
      }
    })();
  }, []);

  const pct = d.score ?? 0;
  const empty = live && d.opportunities.length === 0;
  return (
    <OperatorShell active="aisearch">
      <div className="mg-rise">
        <p className="flex items-center gap-2 text-[13px] font-medium mg-muted">
          <Icon.spark size={15} /> AI Search Visibility {!live && <Provenance kind="sample" />}
        </p>
        <h1 className="mt-2 text-[32px] leading-[1.08] font-extrabold tracking-tight" style={{ color: "var(--fg)" }}>
          Buyers are asking AI about you.<br />
          <span className="dawn-text">Right now, it’s recommending competitors instead.</span>
        </h1>
        <p className="mt-2.5 text-[15px] mg-muted">When someone asks ChatGPT, Perplexity, or Google’s AI a buying question in your space, Genie checks whether you’re the answer — and wins the ones you’re missing.</p>
      </div>

      {empty ? (
        <Card className="mt-6 p-12 text-center">
          <div className="inline-flex mb-3" style={{ color: "var(--accent-ink)" }}><Icon.spark size={38} /></div>
          <p className="text-[18px] font-bold" style={{ color: "var(--fg)" }}>Genie is still checking AI search</p>
          <p className="mt-1.5 text-[14px] mg-muted max-w-md mx-auto">Your first AI-search visibility report lands after tonight’s run — Genie models what ChatGPT, Perplexity, and Google’s AI recommend for your buyers, then finds the gaps.</p>
          <a href="/growth" className="mg-btn mg-btn--ghost inline-flex mt-5">Add keywords to speed it up</a>
        </Card>
      ) : (
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        <Card className="p-5 self-start">
          <div className="flex items-baseline gap-2">
            <span className="text-[44px] font-bold leading-none mg-num" style={{ color: "var(--fg)" }}>{pct}%</span>
            <span className="mg-estimated">AI-modelled</span>
          </div>
          <p className="mt-1 text-[13px] mg-muted">You’re cited in <span className="font-semibold" style={{ color: "var(--fg)" }}>{pct}%</span> of the buyer questions your customers ask AI.</p>
          <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-full rounded-full dawn-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--hair)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mg-subtle mb-2">AI recommends instead</p>
            <div className="flex flex-wrap gap-1.5">{d.competitors.map((c) => <span key={c} className="mg-pill mg-pill--danger">{c}</span>)}</div>
            <p className="mt-3 text-[12px] mg-muted">Approve the plays on the right and Genie closes these gaps — each becomes a piece of AI-citable content.</p>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Gaps to win</h2>
            <span className="mg-pill mg-pill--dawn">{d.opportunities.length} ready</span>
            <span className="ml-auto text-[12px] mg-subtle">ranked by buyer intent</span>
          </div>
          {d.opportunities.map((o, i) => <OpportunityCard key={i} {...o} primaryLabel="Approve & write it" onApprove={() => {}} />)}
        </div>
      </div>
      )}

      <p className="mt-8 mb-2 text-center text-[13px] mg-subtle">Genie re-checks AI search as your content publishes — and learns which plays win citations for you.</p>
    </OperatorShell>
  );
}
