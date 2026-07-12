"use client";

// ── THE OPERATOR HEADER — the one voice, on every screen ──
// Replaces the per-page "eyebrow + H1 + explanatory paragraph" (which read as a
// stack of SaaS pages) with a single, atmospheric header: a quiet label, one
// confident display line, and an optional right-side action. Light has a source
// here (the dawn ambient), so every screen shares the same premium presence.
// No explanatory paragraph — an employee doesn't hand you a memo about the page.

import Icon from "@/components/ui/Icon";

export default function OperatorHeader({
  icon,            // Icon component (e.g. Icon.growth)
  label,           // short eyebrow label
  provenance,      // optional <Provenance/> chip
  title,           // the display line (string)
  accent,          // optional trailing phrase, rendered in dawn
  kicker,          // optional single short line under the title (use sparingly)
  action,          // optional right-side node (button/link)
  large = false,   // Today uses the larger display size
}) {
  const IconC = icon;
  return (
    <div className="mg-ambient mg-rise flex items-end justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <p className="mg-eyebrow">
          {IconC && <IconC size={14} />}
          {label}
          {provenance}
        </p>
        <h1 className={`${large ? "mg-display-lg" : "mg-display"} mt-2.5`}>
          {title}{accent ? <> <span className="dawn-text">{accent}</span></> : null}
        </h1>
        {kicker && <p className="mg-lede mt-2">{kicker}</p>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

// A compact live presence chip — "Genie is working" — for headers that want to
// show the employee is actively on the job. Uses the live dot, not another gem.
export function WorkingChip({ label = "Genie is working" }) {
  return (
    <span className="mg-eyebrow" style={{ gap: ".4rem" }}>
      <span className="mg-live-dot" /> {label}
    </span>
  );
}
