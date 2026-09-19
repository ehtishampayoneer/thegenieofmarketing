"use client";

// components/settings/StartFresh.js
// ── START FRESH, KEEPING THE SETUP ──
// Weeks of building leave an account carrying work that was never the owner's
// real history, and a number that isn't true poisons every number beside it.
// This clears everything Genie generated and keeps what was hard to set up:
// Google, the blog, sender details, and the list of people who opted out of
// email (which must never be cleared).
//
// It shows the real row counts BEFORE asking, and needs the words typed in full,
// because it cannot be undone and there is no backup.

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/v2/primitives";

export default function StartFresh() {
  const [plan, setPlan] = useState(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || plan) return;
    fetch("/api/reset", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j?.ok) setPlan(j); }).catch(() => {});
  }, [open, plan]);

  async function run() {
    setBusy(true); setErr("");
    try {
      const j = await fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: typed }) }).then((r) => r.json());
      if (j?.ok) {
        // Clear Genie's own browser storage too, so the front end is as new as
        // the data (dismissed banners, remembered tabs). Nothing outside the app.
        try { [localStorage, sessionStorage].forEach((s) => Object.keys(s).filter((k) => k.startsWith("mg-") || k.startsWith("mg_")).forEach((k) => s.removeItem(k))); } catch {}
        window.location.href = "/welcome";
        return;
      }
      setErr(j?.error || "That didn't go through. Try again.");
    } catch { setErr("That didn't go through. Try again."); }
    setBusy(false);
  }

  return (
    <Card className="lg:col-span-2 p-5">
      <h2 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Start fresh, keep my setup</h2>
      <p className="mt-1.5 text-[13px] mg-muted" style={{ lineHeight: 1.55, maxWidth: "var(--measure)" }}>
        Clears everything Genie has produced so every number starts from a true zero: drafts, published articles, keywords, buyers, crowd tests and history. <b style={{ color: "var(--fg)" }}>Keeps</b> your Google connection, Search Console, your blog setup and your sender details, so you do not redo any of it. Then you scan your site once and begin.
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} className="mg-btn mg-btn--ghost mt-3" style={{ fontSize: 13 }}>Show me what would be cleared</button>
      ) : (
        <div className="mt-4">
          {!plan ? <p className="text-[13px] mg-subtle">Counting…</p> : (
            <>
              <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
                {plan.total > 0 ? `${plan.total.toLocaleString()} records would be deleted` : "Nothing to clear: this account is already empty"}
              </p>
              {plan.rows.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {plan.rows.map((r) => (
                    <li key={r.table} className="text-[12.5px] flex gap-2" style={{ color: "var(--fg-muted)" }}>
                      <span className="mg-num font-bold" style={{ minWidth: 46, textAlign: "right", color: "var(--fg)" }}>{r.n.toLocaleString()}</span>
                      <span>{r.what}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--signal-live-ink)" }}>Kept, untouched</p>
              <ul className="mt-1 flex flex-col gap-1">
                {plan.keep.map((k) => <li key={k.table} className="text-[12.5px]" style={{ color: "var(--fg-muted)" }}>• {k.what}</li>)}
              </ul>

              {plan.total > 0 && (
                <div className="mt-4">
                  <p className="text-[12.5px] mg-muted">This cannot be undone. Type <b style={{ color: "var(--fg)" }}>START FRESH</b> to confirm.</p>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="START FRESH" className="mg-field mg-focus" style={{ fontSize: 13, maxWidth: 200 }} />
                    <button onClick={run} disabled={busy || typed.trim().toUpperCase() !== "START FRESH"} className="mg-btn disabled:opacity-40" style={{ fontSize: 13, color: "var(--signal-danger)", borderColor: "var(--signal-danger-soft)" }}>
                      {busy ? "Clearing…" : "Clear it all"}
                    </button>
                    <button onClick={() => { setOpen(false); setTyped(""); }} className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}>Cancel</button>
                  </div>
                </div>
              )}
              {err && <p className="mt-2 text-[12.5px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
