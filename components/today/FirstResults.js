"use client";

// components/today/FirstResults.js
// ── YOUR FIRST RESULTS ──
// Genie can be completely built and still earn nothing, because a handful of
// steps turn drafts into results: publish on your own domain, approve an
// article, let Genie see real rankings, set sender details, send the first
// pitches. This card carries those steps with their REAL state (read from the
// database by /api/launchpad) and disappears once they are all done, so it is a
// runway, not permanent furniture.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/v2/primitives";
import Icon from "@/components/ui/Icon";

export default function FirstResults() {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/launchpad", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (alive && j?.ok) setD(j); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Nothing to nag about once every step is done.
  if (!d || d.complete) return null;
  const next = d.steps.find((s) => !s.done);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="mg-klabel">Your first results</p>
        <span className="mg-num text-[12.5px]" style={{ color: "var(--fg-subtle)" }}>{d.done} of {d.total}</span>
      </div>
      <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
        <div className="h-1.5 rounded-full" style={{ width: `${(d.done / d.total) * 100}%`, background: "var(--accent)" }} />
      </div>
      <p className="mt-3 text-[13px]" style={{ color: "var(--fg-muted)", lineHeight: 1.5 }}>
        Genie is built and running. These are the steps that turn its work into real customers.
      </p>

      <div className="mt-4 flex flex-col">
        {(open ? d.steps : [next]).map((s, i) => (
          // The number is the step's real place in the list, even when collapsed.
          <div key={s.id} className="py-3 flex items-start gap-3" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
            <span className="shrink-0 flex items-center justify-center" style={{ width: 22, height: 22, borderRadius: 999, marginTop: 1, background: s.done ? "var(--signal-live-soft)" : "var(--surface-2)", color: s.done ? "var(--signal-live-ink)" : "var(--fg-subtle)" }}>
              {s.done ? <Icon.check size={13} /> : <span className="mg-num text-[11px] font-bold">{d.steps.indexOf(s) + 1}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold leading-snug" style={{ color: s.done ? "var(--fg-muted)" : "var(--fg)", textDecoration: s.done ? "line-through" : "none" }}>{s.t}</p>
              {!s.done && <p className="mt-0.5 text-[12px]" style={{ color: "var(--fg-subtle)", lineHeight: 1.45 }}>{s.why}</p>}
              <p className="mt-1 text-[12px]" style={{ color: s.done ? "var(--signal-live-ink)" : "var(--fg-muted)" }}>{s.state}</p>
              {!s.done && (
                <a href={s.href} className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>
                  {s.cta} <Icon.chevronRight size={13} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setOpen((v) => !v)} className="mt-1 text-[12px] font-semibold" style={{ color: "var(--fg-subtle)", background: "none", border: 0, padding: 0, cursor: "pointer" }}>
        {open ? "Show only what's next" : `Show all ${d.total} steps`}
      </button>
    </Card>
  );
}
