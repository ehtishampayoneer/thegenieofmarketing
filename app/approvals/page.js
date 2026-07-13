"use client";

// ── APPROVALS — the one interaction that matters ──
// Everything Genie drafted, in a single keyboard-driven queue: owned accounts
// first (auto-publish), then community taps. A = approve, E = edit, S = skip,
// ← → move. Reads /api/approvals; writes via /api/approvals/act (and the gated
// execute route for real WordPress/X publishing). Falls back to a demo queue on
// the public preview so it's always drivable.

import { useState, useEffect, useCallback } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Button, Pill, Kbd } from "@/components/ui/v2/primitives";
import { DataStateBadge, EmptyState } from "@/components/ui/v2/DataState";
import { useLive } from "@/lib/useLive";

export default function ApprovalsPage() {
  const { data: feed, state } = useLive("/api/approvals", (j) => !(j.items?.length));
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [done, setDone] = useState(0);
  const [drafting, setDrafting] = useState(false);

  // Ask Genie to draft your first publish-ready content right now (uses your
  // latest scan for context). Takes ~30–60s, then the queue fills.
  async function draftFirstContent() {
    setDrafting(true);
    try {
      const r = await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json());
      if (r.ok) { window.location.reload(); return; }
    } catch {}
    setDrafting(false);
  }

  useEffect(() => {
    if (Array.isArray(feed?.items)) { setItems(feed.items); setIdx(0); }
  }, [feed]);

  const current = items[idx] || null;
  const ownedCount = items.filter((i) => i.owned).length;

  const removeAt = useCallback((i) => {
    setItems((prev) => prev.filter((_, k) => k !== i));
    setIdx((k) => Math.max(0, Math.min(k, items.length - 2)));
    setEditing(false);
  }, [items.length]);

  async function fireApprove(item, draft) {
    try {
      if (item.source === "action" && item.executable) {
        await fetch(`/api/actions/${item.id}/execute`, { method: "POST" });
      } else {
        await fetch("/api/approvals/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, source: item.source, act: "approve", draft }) });
      }
    } catch {}
  }

  async function approveCurrent() {
    if (!current) return;
    const draft = editing ? editDraft : current.draft;
    // Community placements: copy the draft + open the exact thread to post.
    if (!current.owned && current.source === "placement") {
      try { await navigator.clipboard.writeText(draft || ""); } catch {}
      if (current.target_url && current.target_url !== "#") window.open(current.target_url, "_blank");
    }
    fireApprove(current, draft);
    setDone((d) => d + 1);
    removeAt(idx);
  }
  function skipCurrent() {
    if (!current) return;
    try { fetch("/api/approvals/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: current.id, source: current.source, act: "skip" }) }); } catch {}
    removeAt(idx);
  }
  function approveAllOwned() {
    const owned = items.filter((i) => i.owned);
    owned.forEach((it) => fireApprove(it, it.draft));
    setDone((d) => d + owned.length);
    setItems((prev) => prev.filter((i) => !i.owned));
    setIdx(0);
  }

  // Keyboard: the operator's hands never leave the keys.
  useEffect(() => {
    function onKey(e) {
      if (editing) { if (e.key === "Escape") setEditing(false); return; }
      if (!current) return;
      const k = e.key.toLowerCase();
      if (k === "a") { e.preventDefault(); approveCurrent(); }
      else if (k === "e") { e.preventDefault(); setEditDraft(current.draft); setEditing(true); }
      else if (k === "s") { e.preventDefault(); skipCurrent(); }
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, items.length - 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, editing, editDraft, items.length, idx]);

  return (
    <OperatorShell active="approvals">
      <OperatorHeader
        icon={Icon.tasks}
        label="Approvals"
        provenance={<DataStateBadge state={state} />}
        title={items.length > 0 ? <>Genie did the work. <span className="dawn-text">You just approve.</span></> : <>You’re all <span className="dawn-text">caught up.</span></>}
        action={ownedCount > 0 ? <Button variant="ghost" onClick={approveAllOwned}>Approve all {ownedCount} owned</Button> : null}
      />

      {state === "disconnected" ? (
        <EmptyState state="disconnected" icon={Icon.tasks} />
      ) : items.length > 0 && current ? (
        <>
          {/* progress */}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
              <div className="h-full rounded-full dawn-fill" style={{ width: `${(done / (done + items.length)) * 100}%`, transition: "width .4s var(--ease-out)" }} />
            </div>
            <span className="text-[12px] mg-subtle mg-num">{idx + 1} of {items.length}</span>
          </div>

          {/* the card */}
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
            <div className="mg-surface p-6">
              <div className="flex items-center gap-3">
                <BrandIcon brand={current.brand} size={20} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(current.tags || []).map((t, i) => <Pill key={i} tone={t.tone}>{t.label}</Pill>)}
                    {current.owned ? <Pill tone="live">Auto-publishes</Pill> : <Pill tone="dawn">You post it</Pill>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[17px] font-bold leading-none mg-num" style={{ color: current.impact >= 85 ? "var(--accent-ink)" : "var(--fg)" }}>{current.impact}</div>
                  <div className="text-[10px] mg-subtle">Impact</div>
                </div>
              </div>

              <h2 className="mt-3 text-[18px] font-bold tracking-tight" style={{ color: "var(--fg)" }}>{current.title}</h2>
              {current.outcome && <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--accent-ink)" }}>{current.outcome}</p>}

              {editing ? (
                <textarea
                  value={editDraft} onChange={(e) => setEditDraft(e.target.value)} autoFocus
                  className="mt-3 w-full rounded-xl p-3.5 text-[13.5px] leading-relaxed mg-focus"
                  style={{ minHeight: 200, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)", fontFamily: "var(--font-ui)" }}
                />
              ) : (
                current.draft && (
                  <div className="mt-3 rounded-xl p-4 text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--fg-muted)", maxHeight: 260, overflowY: "auto" }}>
                    {current.draft}
                  </div>
                )
              )}

              {current.why && <p className="mt-2.5 text-[12px] mg-subtle"><span className="font-semibold" style={{ color: "var(--fg-muted)" }}>Why this:</span> {current.why}</p>}

              <div className="mt-5 flex items-center gap-2.5 flex-wrap">
                {editing ? (
                  <>
                    <Button variant="dawn" onClick={approveCurrent}>Save &amp; approve</Button>
                    <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Button variant="dawn" onClick={approveCurrent}>
                      {current.owned ? "Approve & publish" : "Copy & open thread"} <span className="mg-kbd" style={{ marginLeft: 4 }}>A</span>
                    </Button>
                    <Button variant="ghost" onClick={() => { setEditDraft(current.draft); setEditing(true); }}>Edit <span className="mg-kbd" style={{ marginLeft: 4 }}>E</span></Button>
                    <Button variant="quiet" onClick={skipCurrent}>Skip <span className="mg-kbd" style={{ marginLeft: 4 }}>S</span></Button>
                    <span className="ml-auto text-[11px] mg-subtle hidden sm:flex items-center gap-1"><Kbd>←</Kbd> <Kbd>→</Kbd> move</span>
                  </>
                )}
              </div>
            </div>

            {/* up next */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mg-subtle mb-2">Up next</p>
              <div className="space-y-1.5">
                {items.map((it, i) => (
                  <button key={it.id} onClick={() => { setIdx(i); setEditing(false); }}
                    className="w-full text-left flex items-center gap-2.5 p-2.5 rounded-xl transition mg-focus"
                    style={{ background: i === idx ? "var(--accent-quiet)" : "var(--surface)", border: `1px solid ${i === idx ? "var(--accent)" : "var(--hair)"}` }}>
                    <BrandIcon brand={it.brand} size={15} />
                    <span className="flex-1 min-w-0 text-[12px] font-medium truncate" style={{ color: "var(--fg)" }}>{it.title}</span>
                    {it.owned && <span className="mg-live-dot" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-8 mg-surface p-12 text-center">
          <div className="inline-flex mb-3" style={{ color: "var(--signal-live-ink)" }}><Icon.check size={40} /></div>
          <p className="text-[18px] font-bold" style={{ color: "var(--fg)" }}>{done > 0 ? "That’s a wrap — beautiful work." : "Nothing in your queue yet."}</p>
          <p className="mt-1.5 text-[14px] mg-muted max-w-md mx-auto">{done > 0 ? "Genie is already lining up tomorrow’s work. Go enjoy your day." : "Have me draft your first publish-ready article and social posts right now — from what I already learned about you."}</p>
          <div className="mt-5 flex items-center justify-center gap-2.5">
            {done === 0 && <button onClick={draftFirstContent} disabled={drafting} className="mg-btn mg-btn--dawn disabled:opacity-60">{drafting ? "Genie is writing… (~30s)" : "Draft my first content →"}</button>}
            <a href={done > 0 ? "/today" : "/growth"} className="mg-btn mg-btn--ghost">{done > 0 ? "Back to Today" : "See opportunities"}</a>
          </div>
        </div>
      )}
    </OperatorShell>
  );
}
