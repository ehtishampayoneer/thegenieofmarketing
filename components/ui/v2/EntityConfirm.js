"use client";

// ── ENTITY CONFIRMATION ──
// Genie infers what it's growing, but misclassification would misdirect the whole
// strategy — so a single, one-tap confirm. This is the moment the user teaches
// Genie who they are; every channel, content, and outreach decision adapts to it.

import { useState } from "react";
import { entityTypeOptions } from "@/lib/entity";
import { GenieMark } from "@/components/brand/GenieMark";
import { Button } from "@/components/ui/v2/primitives";

export function EntityConfirm({ entity, onConfirmed }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(entity?.type || "business");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const options = entityTypeOptions();
  const groups = options.reduce((a, o) => { (a[o.group] ||= []).push(o); return a; }, {});

  async function save(t) {
    setBusy(true);
    try {
      const res = await fetch("/api/entity", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: entity.host, type: t }),
      });
      const j = await res.json();
      if (j.ok) { setDone(true); onConfirmed?.(j.entity); }
    } catch {}
    setBusy(false);
  }

  if (done || !entity) return null;

  return (
    <div className="mg-surface p-4 mb-5 flex items-center gap-3.5 mg-rise" style={{ borderColor: "var(--accent)", boxShadow: "var(--shadow-dawn)" }}>
      <GenieMark size={36} live />
      <div className="flex-1 min-w-0">
        {!open ? (
          <>
            <p className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>
              I’m growing you as a <span className="dawn-text">{entity.label}</span> — is that right?
            </p>
            <p className="text-[12px] mg-muted mt-0.5">I tailor every channel, content plan, and outreach decision to this. One tap and I’m set.</p>
          </>
        ) : (
          <>
            <p className="text-[13px] font-semibold mb-1.5" style={{ color: "var(--fg)" }}>What are you growing?</p>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full max-w-sm text-[13px] rounded-lg px-3 py-2 mg-focus"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" }}>
              {Object.entries(groups).map(([g, items]) => (
                <optgroup key={g} label={g}>
                  {items.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!open ? (
          <>
            <Button variant="dawn" disabled={busy} onClick={() => save(entity.type)} style={{ fontSize: 12.5, padding: ".5rem .9rem" }}>Yes, that’s me</Button>
            <Button variant="ghost" onClick={() => setOpen(true)} style={{ fontSize: 12.5, padding: ".5rem .8rem" }}>Change</Button>
          </>
        ) : (
          <Button variant="dawn" disabled={busy} onClick={() => save(type)} style={{ fontSize: 12.5, padding: ".5rem .95rem" }}>{busy ? "Saving…" : "Save"}</Button>
        )}
      </div>
    </div>
  );
}

export default EntityConfirm;
