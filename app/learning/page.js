"use client";

// ── INTELLIGENCE (Operator surface, live) ──
// What Genie learned from real results, what it changed, and the Decision Ledger.
// Reads /api/learn (Growth Memory + decisions) with graceful fallback. The trust
// layer — competitors are black boxes; Genie shows its work.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Verified, Estimated } from "@/components/ui/v2/primitives";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import { DataStateBadge, EmptyState } from "@/components/ui/v2/DataState";
import { useLive } from "@/lib/useLive";
import { relTime } from "@/lib/live";

export default function LearningPage() {
  const { data: d, state } = useLive("/api/learn", (j) => !(j.learnings?.length) && !(j.ledger?.length));

  return (
    <OperatorShell active="analytics">
      <OperatorHeader
        icon={Icon.brain}
        label="Intelligence"
        provenance={<DataStateBadge state={state} />}
        title={<>Genie is getting <span className="dawn-text">smarter about you</span> every day.</>}
      />

      {state === "disconnected" ? (
        <EmptyState state="disconnected" icon={Icon.brain} />
      ) : state !== "real" ? (
        <Card className="mt-6 p-12 text-center">
          <div className="inline-flex mb-3" style={{ color: "var(--accent-ink)" }}><Icon.brain size={38} /></div>
          <p className="text-[18px] font-bold" style={{ color: "var(--fg)" }}>I haven’t learned anything yet</p>
          <p className="mt-1.5 text-[14px] mg-muted max-w-md mx-auto">As your first posts and content land, I distil what works into learnings you’ll see here — and start changing what I do next. Nothing is a black box.</p>
          <a href="/welcome" className="mg-btn mg-btn--dawn inline-flex mt-5">Run my first scan →</a>
        </Card>
      ) : (
      <>
      <div className="mt-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>What Genie learned</h2>
            <span className="mg-pill mg-pill--dawn">{d.learnings.length}</span>
          </div>
          <div className="space-y-2.5">
            {d.learnings.map((l, i) => (
              <Card key={i} className="p-4 flex items-start gap-3">
                <span className="mg-tile mt-0.5" style={{ width: 32, height: 32, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.spark size={15} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>{l.insight}</p>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    {l.changed && <span className="text-[12px] font-semibold flex items-center gap-1" style={{ color: "var(--accent-ink)" }}><Icon.arrowRight size={13} /> {l.changed}</span>}
                    {l.dim && <span className="mg-pill">{l.dim}</span>}
                    {l.verified ? <Verified>from real data</Verified> : <Estimated>modelled</Estimated>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

      </div>

      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>Decision Ledger</h2>
          <span className="mg-subtle text-[12.5px]">every choice Genie made — and why</span>
        </div>
        <Card className="overflow-hidden">
          {d.ledger.map((x, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-4" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
              <span className="mg-tile mt-0.5" style={{ width: 30, height: 30, background: outcomeTint(x.outcome).bg, color: outcomeTint(x.outcome).fg }}><Icon.check size={14} /></span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="mg-pill">{x.kind}</span>
                  <span className={`mg-pill ${outcomeClass(x.outcome)}`}>{x.outcome}</span>
                  <span className="ml-auto text-[11px] mg-subtle">{x.time || relTime(x.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{x.choice}</p>
                {x.why && <p className="text-[12.5px] mg-muted mt-0.5"><span className="font-medium" style={{ color: "var(--fg-muted)" }}>Why:</span> {x.why}</p>}
              </div>
            </div>
          ))}
        </Card>
        <p className="mt-3 text-center text-[13px] mg-subtle">Nothing Genie does is a black box. Ask “why?” anywhere — the answer is always here.</p>
      </div>
      </>
      )}
    </OperatorShell>
  );
}

function outcomeTint(o) {
  if (["winning", "applied", "published"].includes(o)) return { bg: "var(--signal-live-soft)", fg: "var(--signal-live-ink)" };
  if (o === "pending") return { bg: "var(--accent-quiet)", fg: "var(--accent-ink)" };
  return { bg: "var(--surface-sunken)", fg: "var(--fg-muted)" };
}
function outcomeClass(o) {
  if (["winning", "applied", "published"].includes(o)) return "mg-pill--live";
  if (o === "pending") return "mg-pill--dawn";
  return "";
}
