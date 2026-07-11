"use client";

// ── OPPORTUNITY CARD — the explainable unit of the whole product ──
// Every capability (AI-Search, Buyer-Intent, Competitor Intel, the Learning Loop)
// renders its findings into THIS one card, so users always get the same clear
// story: what Genie discovered, why it matters, what it recommends, what happens
// if they approve, and the expected business outcome — with a "Why?" that reveals
// the Decision-Ledger rationale. The UI compounds like the intelligence does.

import { useState } from "react";
import { Card, Button, Pill, Estimated } from "@/components/ui/v2/primitives";
import Icon from "@/components/ui/Icon";

export function OpportunityCard({
  icon: IconC = Icon.spark,
  tint = "dawn",
  discovered,
  badges = [],            // [{label, tone}]
  why,
  recommendation,
  ifApproved,
  outcome,
  rationale,              // the Decision-Ledger "why" (revealed on demand)
  sources = [],           // [{title, url}]
  confidence,             // 0-100
  primaryLabel = "Approve",
  onApprove,
  estimated = true,
}) {
  const [open, setOpen] = useState(false);
  const t = tintOf(tint);
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="mg-tile" style={{ width: 38, height: 38, background: t.bg, color: t.fg }}><IconC size={18} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold leading-snug" style={{ color: "var(--fg)" }}>{discovered}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {badges.map((b, i) => <Pill key={i} tone={b.tone || "neutral"}>{b.label}</Pill>)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
        <Field label="Why it matters" value={why} />
        <Field label="Genie recommends" value={recommendation} accent />
        <Field label="If you approve" value={ifApproved} />
        <Field label="Expected outcome" value={outcome} estimated={estimated} />
      </div>

      <div className="mt-4 flex items-center gap-2.5 flex-wrap">
        <Button variant="dawn" onClick={onApprove} style={{ fontSize: 12.5, padding: ".5rem .95rem" }}>{primaryLabel}</Button>
        <Button variant="ghost" onClick={() => setOpen((v) => !v)} style={{ fontSize: 12.5, padding: ".5rem .85rem" }}>
          {open ? "Hide reasoning" : "Why?"}
        </Button>
        {confidence != null && (
          <span className="ml-auto text-[11px] mg-subtle">Genie confidence · <span className="mg-num font-semibold" style={{ color: "var(--fg-muted)" }}>{confidence}%</span></span>
        )}
      </div>

      {open && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--hair)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mg-subtle mb-1.5">Genie’s reasoning</p>
          {rationale && <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>{rationale}</p>}
          {sources.length > 0 && (
            <div className="mt-2.5">
              <p className="text-[11px] mg-subtle mb-1">What Genie looked at:</p>
              <ul className="space-y-1">
                {sources.map((s, i) => (
                  <li key={i} className="text-[12px] truncate">
                    <a href={s.url} target="_blank" rel="noreferrer" className="mg-link" style={{ color: "var(--accent-ink)" }}>{s.title || s.url}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-2.5 text-[11px] mg-subtle">Logged to your Decision Ledger — Genie can always explain what it did and why.</p>
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, accent, estimated }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] mg-subtle flex items-center gap-1.5">
        {label}{estimated && <Estimated />}
      </p>
      <p className="mt-1 text-[13px] leading-snug" style={{ color: accent ? "var(--accent-ink)" : "var(--fg)" , fontWeight: accent ? 600 : 400 }}>{value}</p>
    </div>
  );
}

function tintOf(name) {
  switch (name) {
    case "emerald": return { bg: "var(--signal-live-soft)", fg: "var(--signal-live-ink)" };
    case "blue": return { bg: "var(--signal-info-soft)", fg: "var(--signal-info)" };
    case "dawn": return { bg: "var(--accent-quiet)", fg: "var(--accent-ink)" };
    default: return { bg: "var(--surface-sunken)", fg: "var(--fg-muted)" };
  }
}

export default OpportunityCard;
