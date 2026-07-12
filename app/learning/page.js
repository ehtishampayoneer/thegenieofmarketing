"use client";

// ── INTELLIGENCE (Operator surface, live) ──
// What Genie learned from real results, what it changed, and the Decision Ledger.
// Reads /api/learn (Growth Memory + decisions) with graceful fallback. The trust
// layer — competitors are black boxes; Genie shows its work.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Verified, Estimated, Provenance } from "@/components/ui/v2/primitives";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import { fetchLive, relTime } from "@/lib/live";

const FALLBACK = {
  learnings: [
    { insight: "Reddit is one of your best channels (3 winning posts).", changed: "Now hunting Reddit first", dim: "Channel", verified: true },
    { insight: "“ar try before you buy” brings real, measured traffic.", changed: "Writing more content around it", dim: "Keyword", verified: true },
    { insight: "Comparison content is your biggest AI-search opening (5 gaps).", changed: "Prioritizing comparison pages", dim: "Content", verified: false },
    { insight: "Quora surfaces the most buyers for you.", changed: "Weighting Quora higher in the hunt", dim: "Buyer source", verified: false },
  ],
  ledger: [
    { kind: "Buyer-intent pick", choice: "Reply to r/Entrepreneur — “best AR app for conversions”", why: "Comparison query, competitor mentioned, high intent (92).", outcome: "winning", time: "2d" },
    { kind: "AI-search gap", choice: "Write “Best AR try-before-you-buy apps (2026)”", why: "AI cited 3 competitors, you in 0, for a decision-stage query.", outcome: "published", time: "1d" },
    { kind: "Learning synthesis", choice: "4 learnings from your results", why: "Reddit + Quora winning; comparison content wins AI citations.", outcome: "applied", time: "12h" },
    { kind: "Buyer-intent pick", choice: "Answer Quora — “alternatives to ARShop”", why: "Warmest buyer type: competitor-alternative seekers.", outcome: "pending", time: "6h" },
  ],
};

const CHANNELS = [
  { name: "Reddit", winning: 3, dud: 0, score: 88 },
  { name: "Quora", winning: 2, dud: 1, score: 64 },
  { name: "Blog", winning: 1, dud: 0, score: 58 },
  { name: "X", winning: 0, dud: 2, score: 22 },
];

export default function LearningPage() {
  const [d, setD] = useState(FALLBACK);
  const [live, setLive] = useState(false);
  useEffect(() => {
    (async () => {
      const { data, live } = await fetchLive("/api/learn");
      if (live && data) { setD({ learnings: data.learnings || [], ledger: data.ledger || [] }); setLive(true); }
    })();
  }, []);

  const empty = live && !d.learnings.length && !d.ledger.length;

  return (
    <OperatorShell active="analytics">
      <OperatorHeader
        icon={Icon.brain}
        label="Intelligence"
        provenance={!live ? <Provenance kind="sample" /> : null}
        title={<>Genie is getting <span className="dawn-text">smarter about you</span> every day.</>}
      />

      {empty ? (
        <Card className="mt-6 p-12 text-center">
          <div className="inline-flex mb-3" style={{ color: "var(--accent-ink)" }}><Icon.brain size={38} /></div>
          <p className="text-[18px] font-bold" style={{ color: "var(--fg)" }}>Genie is still learning about you</p>
          <p className="mt-1.5 text-[14px] mg-muted max-w-md mx-auto">As your first posts and content land, Genie distills what works into learnings you’ll see here — and starts changing what it does next. Nothing is a black box.</p>
          <a href="/approvals" className="mg-btn mg-btn--ghost inline-flex mt-5">Approve Genie’s first work</a>
        </Card>
      ) : (
      <>
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
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
