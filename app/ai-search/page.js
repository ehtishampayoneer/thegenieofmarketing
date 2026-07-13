"use client";

// ── AI SEARCH VISIBILITY (Operator surface, live) ──
// Reads stored AI-search gaps (from the Decision Ledger) via /api/ai-search and
// falls back to representative data for the preview. Each gap is an explainable
// OpportunityCard: discovered · why · recommendation · if approved · outcome.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Provenance } from "@/components/ui/v2/primitives";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import { OpportunityCard } from "@/components/ui/v2/OpportunityCard";
import { DataStateBadge, EmptyState } from "@/components/ui/v2/DataState";
import { useLive } from "@/lib/useLive";

export default function AiSearchPage() {
  const { data: d, state } = useLive("/api/ai-search", (j) => !(j.opportunities?.length));
  const pct = d?.score ?? 0;
  return (
    <OperatorShell active="aisearch">
      <OperatorHeader
        icon={Icon.spark}
        label="AI Search Visibility"
        provenance={<DataStateBadge state={state} />}
        title={<>Buyers are asking AI about you.<br /><span className="dawn-text">Right now, it’s recommending competitors instead.</span></>}
      />

      {state === "disconnected" ? (
        <EmptyState state="disconnected" icon={Icon.spark} />
      ) : state !== "real" ? (
        <Card className="mt-6 p-12 text-center">
          <div className="inline-flex mb-3" style={{ color: "var(--accent-ink)" }}><Icon.spark size={38} /></div>
          <p className="text-[18px] font-bold" style={{ color: "var(--fg)" }}>I haven’t checked AI search yet</p>
          <p className="mt-1.5 text-[14px] mg-muted max-w-md mx-auto">After your first scan, I model what ChatGPT, Perplexity, and Google’s AI recommend for your buyers — then find the gaps where they cite competitors instead of you.</p>
          <a href="/welcome" className="mg-btn mg-btn--dawn inline-flex mt-5">Run my first scan →</a>
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
