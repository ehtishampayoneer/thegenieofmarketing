"use client";

// ── APPROVALS — the one interaction that matters ──
// Everything Genie drafted, in a single keyboard-driven queue: owned accounts
// first (auto-publish), then community taps. A = approve, E = edit, S = skip,
// ← → move. Reads /api/approvals; writes via /api/approvals/act (and the gated
// execute route for real WordPress/X publishing). Honest empty states — a
// brand-new account shows a real "nothing yet" until the first content is drafted.

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
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 5000); return () => clearTimeout(t); }, [toast]);

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
        return await fetch(`/api/actions/${item.id}/execute`, { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false }));
      }
      await fetch("/api/approvals/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, source: item.source, act: "approve", draft }) }).catch(() => {});
      return { ok: true, acted: true };
    } catch { return { ok: false }; }
  }

  async function approveCurrent() {
    if (!current || working) return;
    const item = current;
    const draft = editing ? editDraft : current.draft;

    // Anything not on your own site (X, Reddit, Quora…) → draft-and-you-post:
    // copy it + open the platform's own composer; YOU tap post. Keeps your
    // accounts safe — we never auto-post to platforms that ban automation.
    if (!item.owned) {
      try { await navigator.clipboard.writeText(draft || ""); } catch {}
      if (item.target_url && item.target_url !== "#") window.open(item.target_url, "_blank");
      fireApprove(item, draft);
      setToast("Opened it with your post ready — just review and tap post. (I never auto-post to your social accounts.)");
      setDone((d) => d + 1); removeAt(idx);
      return;
    }

    // Owned content (article → your blog, or post → X): publish for real, and be
    // honest about the outcome instead of pretending it worked.
    setWorking(true);
    setToast(item.kind === "article" ? "Publishing to your blog…" : "Posting…");
    const r = await fireApprove(item, draft);
    setWorking(false);
    if (r?.ok && r?.result?.url) {
      setToast(`Published ✓ ${r.result.channel === "x" ? "on X" : "to your blog"}`);
      setDone((d) => d + 1); removeAt(idx);
    } else if (r?.needsConnection) {
      try { await navigator.clipboard.writeText(draft || ""); } catch {}
      setToast(item.kind === "article"
        ? "I wrote it and copied it to your clipboard. Connect WordPress on Connections and I’ll publish automatically next time."
        : "Connect that account on Connections and I’ll post it for you — I copied the draft for now.");
      setDone((d) => d + 1); removeAt(idx);
    } else if (r?.blocked) {
      setToast("I held this back to protect your brand. Press E to edit, then re-approve.");
    } else {
      setToast(r?.error || "That didn’t publish — try again in a moment.");
    }
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
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-5 items-start">
            <div className="mg-surface" style={{ overflow: "hidden" }}>
              {/* meta chrome — one quiet line, so the work below is the star */}
              <div className="flex items-center gap-2 px-6 pt-5">
                <BrandIcon brand={current.brand} size={17} />
                {current.owned ? <Pill tone="live">Auto-publishes</Pill> : <Pill tone="dawn">You post it</Pill>}
                {(current.tags || []).map((t, i) => <Pill key={i} tone={t.tone}>{t.label}</Pill>)}
                <span className="ml-auto text-[11px] mg-subtle mg-num" title="Genie’s impact estimate">Impact {current.impact}</span>
              </div>

              {/* the work */}
              <div className="px-6 pt-3.5">
                <h2 className="text-[21px] font-bold tracking-tight leading-snug" style={{ color: "var(--fg)" }}>{current.title}</h2>
                {current.outcome && <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--accent-ink)" }}>{current.outcome}</p>}
              </div>

              <div className="px-6 pt-4">
                {editing ? (
                  <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} autoFocus
                    className="mg-field mg-focus" style={{ minHeight: "40vh", lineHeight: 1.68, fontSize: 14.5 }} />
                ) : (
                  current.draft && <div className="mg-draft thin-scroll">{current.draft}</div>
                )}
                {current.why && <p className="mt-3 text-[12px] mg-subtle"><span className="font-semibold" style={{ color: "var(--fg-muted)" }}>Why this:</span> {current.why}</p>}
              </div>

              {/* action bar — separated, so approving feels decisive */}
              <div className="flex items-center gap-2.5 px-6 py-4 mt-4" style={{ borderTop: "1px solid var(--hair)", background: "var(--surface-2)" }}>
                {editing ? (
                  <>
                    <Button variant="dawn" onClick={approveCurrent}>Save &amp; approve</Button>
                    <Button variant="ghost" onClick={() => setEditing(false)}>Cancel <span className="mg-kbd" style={{ marginLeft: 4 }}>Esc</span></Button>
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

            {/* up next — the queue, so you feel the leverage of clearing it fast */}
            <div className="lg:sticky lg:top-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mg-subtle mb-2 px-1">Up next</p>
              <div className="space-y-1">
                {items.map((it, i) => (
                  <button key={it.id} onClick={() => { setIdx(i); setEditing(false); }}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-[10px] mg-focus transition"
                    style={{ background: i === idx ? "var(--surface-2)" : "transparent", boxShadow: i === idx ? "inset 2px 0 0 var(--accent)" : "none", color: "var(--fg)" }}>
                    <BrandIcon brand={it.brand} size={15} />
                    <span className="flex-1 min-w-0 text-[12px] font-medium truncate text-left" style={{ color: i === idx ? "var(--fg)" : "var(--fg-muted)" }}>{it.title}</span>
                    {it.owned && <span className="mg-live-dot" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-8 mg-surface mg-ambient p-12 text-center">
          <span className="mg-tile mx-auto" style={{ width: 62, height: 62, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><Icon.check size={30} /></span>
          <p className="mt-4 mg-title" style={{ fontSize: 21 }}>{done > 0 ? <>Cleared. <span className="mg-num">{done}</span> {done === 1 ? "decision" : "decisions"} approved.</> : "Nothing in your queue yet."}</p>
          <p className="mt-1.5 text-[14px] mg-muted max-w-md mx-auto">{done > 0 ? "Genie is already lining up tomorrow’s work. Go enjoy your day." : "Have me draft your first publish-ready article and social posts right now — from what I already learned about you."}</p>
          <div className="mt-5 flex items-center justify-center gap-2.5">
            {done === 0 && <button onClick={draftFirstContent} disabled={drafting} className="mg-btn mg-btn--dawn disabled:opacity-60">{drafting ? "Genie is writing… (~30s)" : "Draft my first content →"}</button>}
            <a href={done > 0 ? "/today" : "/growth"} className="mg-btn mg-btn--ghost">{done > 0 ? "Back to Today" : "See opportunities"}</a>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 z-50" style={{ bottom: 24, transform: "translateX(-50%)" }}>
          <div className="mg-surface px-4 py-2.5 text-[13px] mg-rise" style={{ boxShadow: "var(--shadow-3)", color: "var(--fg)", borderColor: "var(--border-strong)", maxWidth: "90vw" }}>{toast}</div>
        </div>
      )}
    </OperatorShell>
  );
}
