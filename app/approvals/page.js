"use client";

// ── APPROVALS — the review station ──
// Genie did the marketing work; you review it and decide: approve, edit, or skip.
// One approval dominates the page (type, why Genie chose it, SEO targets, and a
// real formatted preview of what will be published), with the up-next queue beside
// it. Owned content (article → your blog) auto-publishes for real; social is
// draft-and-you-post (we never auto-post to accounts that ban automation).
// A = approve, E = edit, S = skip, ← → move. Reads /api/approvals; writes via
// /api/approvals/act and the gated execute route. Honest empty + zero states.

import { useState, useEffect, useCallback, useMemo } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { BrandIcon } from "@/components/ui/BrandIcon";
import { Pill, Kbd, Provenance } from "@/components/ui/v2/primitives";
import { EmptyState } from "@/components/ui/v2/DataState";
import { useLive } from "@/lib/useLive";
import { markdownToHtml, deDash } from "@/lib/markdown";

const TYPE_OPTS = [
  { id: "all", label: "All types" },
  { id: "blog", label: "Blog articles" },
  { id: "social", label: "Social posts" },
  { id: "email", label: "Email" },
  { id: "other", label: "Other" },
];
const IMPACT_OPTS = [
  { id: "all", label: "All impacts" },
  { id: "high", label: "High impact" },
  { id: "medium", label: "Medium impact" },
  { id: "low", label: "Low impact" },
];

const approxWords = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const fmt = (n) => { try { return Number(n).toLocaleString(); } catch { return String(n); } };

function impactMeta(impact) {
  const n = Number(impact) || 0;
  if (n >= 85) return { label: "High", tier: "high", dot: "var(--signal-live)", pill: "dawn" };
  if (n >= 65) return { label: "Medium", tier: "medium", dot: "var(--accent)", pill: "info" };
  return { label: "Low", tier: "low", dot: "var(--fg-subtle)", pill: "neutral" };
}
function typeLabel(it) {
  if (!it) return "";
  if (it.source === "placement" || /community|reply/.test(it.kind || "")) return `${it.platform ? plat(it.platform) : "Community"} reply`.toUpperCase();
  if (it.isCarousel) return `${plat(it.platform || "Instagram")} carousel`.toUpperCase();
  if (it.platform === "gbp") return "GOOGLE BUSINESS POST";
  if (it.platform === "review_request") return "REVIEW REQUEST";
  if (it.platform === "pinterest") return "PINTEREST PIN";
  return ({ article: "BLOG ARTICLE", social_post: "SOCIAL POST", outreach_email: "EMAIL", seo_fix: "SEO FIX", ad_campaign: "AD CAMPAIGN", distribution: "DISTRIBUTION" })[it.kind] || String(it.kind || "recommendation").replace(/_/g, " ").toUpperCase();
}
function cap(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
const PLATFORM_NAME = { x: "X", twitter: "X", linkedin: "LinkedIn", reddit: "Reddit", instagram: "Instagram", facebook: "Facebook", medium: "Medium", quora: "Quora", tiktok: "TikTok", youtube: "YouTube", pinterest: "Pinterest", gbp: "Google Business", review_request: "Google review" };
function plat(p) { return PLATFORM_NAME[String(p || "").toLowerCase()] || cap(p); }
function matchesType(it, f) {
  if (f === "all") return true;
  if (f === "blog") return it.kind === "article";
  if (f === "social") return it.kind === "social_post" || it.source === "placement" || /community|reply/.test(it.kind || "");
  if (f === "email") return it.kind === "outreach_email";
  return !(it.kind === "article" || it.kind === "social_post" || it.kind === "outreach_email" || it.source === "placement");
}
function matchesImpact(it, f) { return f === "all" || impactMeta(it.impact).tier === f; }

// Helpers for editing a branded card's overlay hook + underlying photo in place.
function isCardUrl(u) { try { return new URL(u, location.origin).pathname.endsWith("/api/card"); } catch { return false; } }
function cardTitleOf(u) { try { const x = new URL(u, location.origin); return x.pathname.endsWith("/api/card") ? (x.searchParams.get("title") || "") : ""; } catch { return ""; } }
function rebuildCard(u, { title, img }) { try { const x = new URL(u, location.origin); if (title != null) x.searchParams.set("title", title); if (img != null) x.searchParams.set("img", img); return x.href; } catch { return u; } }

export default function ApprovalsPage() {
  const { data: feed, state } = useLive("/api/approvals", (j) => !(j.items?.length));
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [done, setDone] = useState(0);
  const [working, setWorking] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [toast, setToast] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [impactFilter, setImpactFilter] = useState("all");
  const [openMenu, setOpenMenu] = useState(null); // 'type' | 'impact' | 'more' | null
  const [expandReason, setExpandReason] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [saved, setSaved] = useState(() => new Set());
  // ── editing image + text ──
  const [editHook, setEditHook] = useState("");
  const [editImage, setEditImage] = useState(null);
  const [editImageRaw, setEditImageRaw] = useState(null);
  const [editBranded, setEditBranded] = useState(false);
  const [editSource, setEditSource] = useState(null);
  const [editCredit, setEditCredit] = useState(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapOpts, setSwapOpts] = useState([]);
  const [swapLoading, setSwapLoading] = useState(false);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 5000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (Array.isArray(feed?.items)) { setItems(feed.items); setIdx(0); } }, [feed]);

  // Close any open menu on a click outside the menu + its trigger.
  useEffect(() => {
    if (!openMenu) return;
    const onDoc = (e) => { if (e.target.closest?.(".mg-menu, .mg-filter, [data-menu-trigger]")) return; setOpenMenu(null); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openMenu]);

  const view = useMemo(() => items.filter((it) => matchesType(it, typeFilter) && matchesImpact(it, impactFilter)), [items, typeFilter, impactFilter]);
  useEffect(() => { setIdx((i) => Math.max(0, Math.min(i, view.length - 1))); }, [view.length]);
  const current = view[idx] || null;
  useEffect(() => { setExpandReason(false); setEditing(false); }, [current?.id]);

  const total = done + view.length;
  const estMin = Math.max(1, Math.round(view.length * 0.3));
  const progressPct = total > 0 ? (done / total) * 100 : 0;
  const highOwned = view.filter((i) => impactMeta(i.impact).label === "High" && i.owned);

  const removeById = useCallback((id) => { setItems((prev) => prev.filter((i) => i.id !== id)); setEditing(false); }, []);

  async function draftFirstContent() {
    setDrafting(true);
    try { const r = await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json()); if (r.ok) { window.location.reload(); return; } } catch {}
    setDrafting(false);
  }

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

    // Not on your own site (X, Reddit, Quora…) → draft-and-you-post: copy it +
    // open the platform's own composer; YOU tap post. Keeps your accounts safe.
    if (!item.owned) {
      try { await navigator.clipboard.writeText(draft || ""); } catch {}
      if (item.target_url && item.target_url !== "#") window.open(item.target_url, "_blank");
      fireApprove(item, draft);
      setToast("Opened it with your post ready. Review and tap post. (I never auto-post to your social accounts.)");
      setDone((d) => d + 1); removeById(item.id);
      return;
    }

    // Owned content → publish for real, and be honest about the outcome.
    setWorking(true);
    setToast(item.kind === "article" ? "Publishing to your blog…" : "Posting…");
    const r = await fireApprove(item, draft);
    setWorking(false);
    if (r?.ok && r?.result?.url) {
      setToast(`Published ✓ ${r.result.channel === "x" ? "on X" : "to your blog"}`);
      setDone((d) => d + 1); removeById(item.id);
    } else if (r?.needsConnection) {
      try { await navigator.clipboard.writeText(draft || ""); } catch {}
      setToast(item.kind === "article"
        ? "I wrote it and copied it to your clipboard. Connect WordPress on Connections and I’ll publish automatically next time."
        : "Connect that account on Connections and I’ll post it for you. I copied the draft for now.");
      setDone((d) => d + 1); removeById(item.id);
    } else if (r?.blocked) {
      setToast("I held this back to protect your brand. Press E to edit, then re-approve.");
    } else {
      setToast(r?.error || "That didn’t publish. Try again in a moment.");
    }
  }

  function skipCurrent() {
    if (!current) return;
    try { fetch("/api/approvals/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: current.id, source: current.source, act: "skip" }) }); } catch {}
    removeById(current.id);
  }

  function runBulk() {
    highOwned.forEach((it) => fireApprove(it, it.draft));
    const ids = new Set(highOwned.map((i) => i.id));
    setDone((d) => d + highOwned.length);
    setItems((prev) => prev.filter((i) => !ids.has(i.id)));
    setIdx(0); setConfirmBulk(false);
    setToast(`Approving ${highOwned.length} high-impact ${highOwned.length === 1 ? "article" : "articles"}. I’ll publish them to your blog now.`);
  }

  function toggleSave(id) { setSaved((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  // ── EDIT IMAGE + TEXT ──
  function startEdit(cur) {
    if (!cur) return;
    setEditDraft(cur.draft || "");
    setEditImage(cur.image || null);
    setEditImageRaw(cur.imageBranded ? (cur.imageRaw || null) : (cur.image || null));
    setEditBranded(!!cur.imageBranded);
    setEditSource(cur.imageSource || null);
    setEditCredit(cur.imageCredit || null);
    setEditHook(cur.imageBranded ? (cardTitleOf(cur.image) || cur.cardHeadline || "") : "");
    setSwapOpen(false); setSwapOpts([]);
    setEditing(true);
  }
  function onSetHook(v) { setEditHook(v); setEditImage((img) => (editBranded && img && isCardUrl(img)) ? rebuildCard(img, { title: v }) : img); }
  async function openSwap(topic) {
    const next = !swapOpen; setSwapOpen(next);
    if (next && swapOpts.length === 0) {
      setSwapLoading(true);
      try {
        const j = await fetch(`/api/media/options?topic=${encodeURIComponent(topic || "")}`, { cache: "no-store" }).then((r) => r.json());
        if (j?.ok) setSwapOpts([...(j.site || []).map((o) => ({ ...o, source: "site" })), ...(j.stock || []).map((o) => ({ ...o, source: "stock" }))]);
      } catch {}
      setSwapLoading(false);
    }
  }
  function pickSwap(o) {
    setEditImageRaw(o.url);
    setEditSource(o.source);
    setEditCredit(o.source === "stock" ? (o.credit || "Pexels") : null);
    setEditImage((img) => (editBranded && img && isCardUrl(img)) ? rebuildCard(img, { img: o.url, title: editHook }) : o.url);
    setSwapOpen(false);
  }
  // Upload the user's OWN photo → store it → use it exactly like a swapped image.
  async function uploadImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setToast("Please choose an image file."); return; }
    setSwapLoading(true); setSwapOpen(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const j = await fetch("/api/upload/image", { method: "POST", body: fd }).then((r) => r.json());
      if (j?.ok && j.url) { pickSwap({ url: j.url, source: "upload" }); setToast("Your image is in. Save to keep it."); }
      else setToast(j?.error || "Couldn’t upload that image.");
    } catch { setToast("Couldn’t upload that image."); }
    setSwapLoading(false);
  }
  async function persistEdits(cur) {
    try { await fetch("/api/approvals/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cur.id, source: cur.source, act: "edit", draft: editDraft, image: editImage, imageRaw: editImageRaw, hook: editHook, imageSource: editSource, imageCredit: editCredit, branded: editBranded }) }); } catch {}
    setItems((prev) => prev.map((it) => it.id === cur.id ? { ...it, draft: editDraft, image: editImage, imageRaw: editImageRaw, imageSource: editSource, imageCredit: editCredit, imageBranded: editBranded, cardHeadline: editHook } : it));
  }
  async function saveEdit(cur, approveAfter) {
    await persistEdits(cur);
    if (approveAfter) approveCurrent();
    else { setEditing(false); setToast("Saved."); }
  }

  // Keyboard: the operator's hands never leave the keys.
  useEffect(() => {
    function onKey(e) {
      if (openMenu || confirmBulk) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (editing || tag === "textarea" || tag === "input") { if (e.key === "Escape") setEditing(false); return; }
      if (!current) return;
      const k = e.key.toLowerCase();
      if (k === "a") { e.preventDefault(); approveCurrent(); }
      else if (k === "e") { e.preventDefault(); startEdit(current); }
      else if (k === "s") { e.preventDefault(); skipCurrent(); }
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, view.length - 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, editing, editDraft, view.length, idx, openMenu, confirmBulk, working]);

  const loading = state === "loading";
  const empty = !loading && state !== "disconnected" && view.length === 0;

  return (
    <OperatorShell active="approvals">
      {/* ── HEADER: breadcrumb · title · filters · bulk approve ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="mg-eyebrow"><Icon.tasks size={14} /> Approvals <span className="mg-subtle">›</span> {state === "real" ? <Provenance kind="live">Live data</Provenance> : <Provenance kind="sample">Preview</Provenance>}</p>
          <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(24px,2.6vw,32px)" }}>
            {loading ? <>Opening your <span className="dawn-text">queue…</span></> : view.length > 0 ? <>Genie did the work. <span className="dawn-text">You just approve.</span></> : <>You’re all <span className="dawn-text">caught up.</span></>}
          </h1>
        </div>
        {state === "real" && items.length > 0 && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <FilterMenu label="Filter" value={typeFilter} opts={TYPE_OPTS} open={openMenu === "type"} onToggle={() => setOpenMenu(openMenu === "type" ? null : "type")} onPick={(v) => { setTypeFilter(v); setOpenMenu(null); }} />
            <FilterMenu label="Filter" value={impactFilter} opts={IMPACT_OPTS} open={openMenu === "impact"} onToggle={() => setOpenMenu(openMenu === "impact" ? null : "impact")} onPick={(v) => { setImpactFilter(v); setOpenMenu(null); }} />
            {highOwned.length > 0 && (
              <button onClick={() => setConfirmBulk(true)} className="mg-btn mg-btn--dawn" style={{ fontSize: 13 }}>Approve all high-impact ({highOwned.length}) →</button>
            )}
          </div>
        )}
      </div>

      {state === "disconnected" ? (
        <div className="mt-8"><EmptyState state="disconnected" icon={Icon.tasks} title="I can’t reach your queue" sub="Sign in and I’ll show you everything I’ve drafted." /></div>
      ) : loading ? (
        <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
          <div className="mg-surface p-6" style={{ minHeight: 320 }}><div className="mg-skel" style={{ height: 18, width: "40%" }} /><div className="mg-skel mt-4" style={{ height: 240 }} /></div>
          <div className="mg-surface p-6" style={{ minHeight: 160 }}><div className="mg-skel" style={{ height: 16, width: "60%" }} /><div className="mg-skel mt-3" style={{ height: 90 }} /></div>
        </div>
      ) : empty ? (
        <AllClear done={done} drafting={drafting} onDraft={draftFirstContent} filtered={items.length > 0} onClear={() => { setTypeFilter("all"); setImpactFilter("all"); }} />
      ) : (
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 items-start">
          {/* ── LEFT: progress + the current approval ── */}
          <div className="min-w-0">
            {/* progress */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                <div className="h-full rounded-full dawn-fill" style={{ width: `${progressPct}%`, transition: "width .5s var(--ease-out)" }} />
              </div>
              <span className="text-[12px] mg-subtle shrink-0"><span className="mg-num" style={{ color: "var(--fg-muted)", fontWeight: 600 }}>{done} of {total}</span> reviewed <span className="mx-1">·</span> Est. {estMin} min to finish</span>
            </div>

            {current && <CurrentApproval
              key={current.id}
              item={current}
              editing={editing} editDraft={editDraft} setEditDraft={setEditDraft}
              onEdit={() => startEdit(current)} onCancelEdit={() => { setEditing(false); setSwapOpen(false); }}
              onApprove={approveCurrent} onSkip={skipCurrent} working={working}
              edit={{ hook: editHook, setHook: onSetHook, image: editImage, branded: editBranded, swapOpen, swapOpts, swapLoading, openSwap: () => openSwap(current.keyword || current.title), pickSwap, upload: uploadImage, save: () => saveEdit(current, false), saveApprove: () => saveEdit(current, true) }}
              expandReason={expandReason} setExpandReason={setExpandReason}
              saved={saved.has(current.id)} onToggleSave={() => toggleSave(current.id)}
              openMore={openMenu === "more"} onToggleMore={() => setOpenMenu(openMenu === "more" ? null : "more")}
              idx={idx} count={view.length} onPrev={() => setIdx((i) => Math.max(0, i - 1))} onNext={() => setIdx((i) => Math.min(view.length - 1, i + 1))}
            />}
          </div>

          {/* ── RIGHT: the up-next queue ── */}
          <ApprovalQueue view={view} idx={idx} onPick={(i) => { setIdx(i); setEditing(false); }} />
        </div>
      )}

      {confirmBulk && (
        <Modal onClose={() => setConfirmBulk(false)}>
          <p className="mg-title" style={{ fontSize: 18 }}>Approve {highOwned.length} high-impact {highOwned.length === 1 ? "article" : "articles"}?</p>
          <p className="mt-2 text-[13.5px] mg-muted leading-snug">These are the recommendations I currently believe will have the highest expected impact. I’ll publish each to your blog.</p>
          <div className="mt-5 flex items-center gap-2.5">
            <button onClick={runBulk} className="mg-btn mg-btn--dawn">Approve {highOwned.length} →</button>
            <button onClick={() => setConfirmBulk(false)} className="mg-btn mg-btn--ghost">Review individually</button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="fixed left-1/2 z-50" style={{ bottom: 24, transform: "translateX(-50%)" }}>
          <div className="mg-surface px-4 py-2.5 text-[13px] mg-rise" style={{ boxShadow: "var(--shadow-3)", color: "var(--fg)", borderColor: "var(--border-strong)", maxWidth: "90vw" }}>{toast}</div>
        </div>
      )}
    </OperatorShell>
  );
}

// ── THE CURRENT APPROVAL — the dominant card ────────────────────────────────
function CurrentApproval({ item, editing, editDraft, setEditDraft, onEdit, onCancelEdit, onApprove, onSkip, working, expandReason, setExpandReason, saved, onToggleSave, openMore, onToggleMore, idx, count, onPrev, onNext, edit }) {
  const im = impactMeta(item.impact);
  const words = approxWords(item.draft);
  const isArticle = item.kind === "article";
  const reasoning = item.why || defaultReasoning(item);
  const longReason = (reasoning || "").length > 210;

  return (
    <div className="mt-4 mg-surface mg-approve-in" style={{ overflow: "hidden" }}>
      {/* header chrome */}
      <div className="flex items-center gap-2.5 px-6 pt-5 flex-wrap">
        <BrandIcon brand={item.brand} size={16} />
        <span className="text-[11.5px] font-bold tracking-[0.08em]" style={{ color: "var(--fg-muted)" }}>{typeLabel(item)}</span>
        <span className="mg-subtle">|</span>
        {item.owned ? <Pill tone="live">Auto-publishes</Pill> : <Pill tone="dawn">You post it</Pill>}
        <Pill tone={im.pill}>{im.label} impact</Pill>
        {item.isRefresh && <Pill tone="info">Refresh</Pill>}
        {item.isCarousel ? <Pill tone="live">{(item.images?.length || 0)} slides</Pill> : item.image && <Pill tone="neutral"><Icon.eye size={11} /> Image</Pill>}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onToggleSave} className="mg-focus p-1.5 rounded-lg" style={{ color: saved ? "var(--accent-ink)" : "var(--fg-subtle)", background: "none", border: "none", cursor: "pointer" }} aria-label="Save" title="Save for later">
            <Bookmark filled={saved} />
          </button>
          <div className="relative">
            <button onClick={onToggleMore} data-menu-trigger className="mg-focus p-1.5 rounded-lg" style={{ color: "var(--fg-subtle)", background: "none", border: "none", cursor: "pointer" }} aria-label="More actions"><Dots /></button>
            {openMore && (
              <div className="mg-menu" style={{ right: 0, top: "calc(100% + 4px)" }}>
                <button className="mg-menu-item" onClick={() => { navigator.clipboard?.writeText(item.draft || ""); onToggleMore(); }}><Icon.write size={15} /> Copy draft</button>
                {item.target_url && item.target_url !== "#" && <a className="mg-menu-item" href={item.target_url} target="_blank" rel="noreferrer" onClick={onToggleMore}><Icon.link size={15} /> Open destination</a>}
                <button className="mg-menu-item" onClick={() => { onSkip(); onToggleMore(); }} style={{ color: "var(--signal-danger)" }}><Icon.x size={15} /> Remove from queue</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* upper: title + impact + why  ·  why Genie chose this */}
      <div className="px-6 pt-4 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold tracking-tight leading-snug" style={{ color: "var(--fg)" }}>{item.title}</h2>
          <p className="mt-2.5 text-[13.5px]">
            <span className="mg-subtle">Impact Score:</span> <span className="mg-num font-bold" style={{ color: "var(--fg)" }}>{Number(item.impact) || 0}/100</span> <span style={{ color: "var(--accent-ink)", fontWeight: 700 }}>({im.label})</span>
          </p>
          <WhyRow item={item} />
        </div>

        <div className="rounded-2xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
          <p className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: "var(--fg)" }}><Icon.spark size={13} style={{ color: "var(--accent-ink)" }} /> Why Genie chose this</p>
          <p className="mt-2 text-[12.5px] mg-muted leading-relaxed" style={longReason && !expandReason ? { display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>{reasoning}</p>
          {longReason && (
            <button onClick={() => setExpandReason((v) => !v)} className="mt-2 flex items-center gap-1 text-[12px] font-semibold mg-focus" style={{ color: "var(--accent-ink)", background: "none", border: "none", cursor: "pointer" }}>
              {expandReason ? "Show less" : "Show more reasoning"} <Icon.chevronRight size={13} style={{ transform: expandReason ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform .2s" }} />
            </button>
          )}
        </div>
      </div>

      {/* lower: targets  ·  preview */}
      <div className="px-6 pt-5 grid grid-cols-1 lg:grid-cols-[268px_1fr] gap-5 items-start">
        <LeftPanel item={item} isArticle={isArticle} />
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--hair)" }}>
          <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--hair)" }}>
            <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] mg-subtle"><Icon.eye size={13} /> PREVIEW <span className="font-medium normal-case tracking-normal" style={{ textTransform: "none" }}>(as it will publish)</span></span>
            <span className="text-[11.5px] mg-subtle mg-num">{words ? `${fmt(words)} words` : ""}</span>
          </div>
          <div className="thin-scroll" style={{ maxHeight: 360, overflowY: "auto", padding: "18px 20px", background: "var(--surface)" }}>
            {!editing && item.images && item.images.length > 1 ? (
              <figure style={{ margin: "0 0 14px" }}>
                <div className="thin-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
                  {item.images.map((src, i) => (
                    <img key={i} src={src} alt="" loading="lazy" style={{ height: 220, width: 220, objectFit: "cover", borderRadius: 12, border: "1px solid var(--hair)", flex: "none", background: "var(--surface-2)" }} />
                  ))}
                </div>
                <figcaption className="flex items-center gap-1.5" style={{ fontSize: 10.5, color: "var(--fg-subtle)", padding: "5px 2px" }}>
                  <span style={{ fontWeight: 700, color: "var(--signal-live-ink)" }}>Carousel</span>
                  <span>· {item.images.length} slides · swipe to preview · upload all when you post</span>
                </figcaption>
              </figure>
            ) : item.image && !editing && (
              <figure style={{ margin: "0 0 14px", borderRadius: 12, overflow: "hidden", border: "1px solid var(--hair)" }}>
                <img src={item.image} alt={item.imageAlt || ""} loading="lazy" style={{ display: "block", width: "100%", maxHeight: 240, objectFit: "cover", background: "var(--surface-2)" }} />
                <figcaption className="flex items-center gap-1.5" style={{ fontSize: 10.5, color: "var(--fg-subtle)", padding: "5px 9px", background: "var(--surface-2)" }}>
                  <span style={{ fontWeight: 700, color: (item.imageSource === "site" || item.imageSource === "upload") ? "var(--signal-live-ink)" : "var(--fg-muted)" }}>{item.imageBranded ? "Designed card" : item.imageSource === "upload" ? "Your upload" : item.imageSource === "site" ? "Your image" : "Free stock"}</span>
                  <span>· {item.imageBranded ? `built from ${item.imageSource === "site" ? "your photo" : "a free stock photo"}` : item.imageCredit}</span>
                </figcaption>
              </figure>
            )}
            {editing ? (
              <div className="flex flex-col gap-3">
                {edit.image && (
                  <div>
                    <img src={edit.image} alt="" style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 10, border: "1px solid var(--hair)", background: "var(--surface-2)" }} />
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={edit.openSwap} className="mg-btn mg-btn--quiet" style={{ fontSize: 12 }}><Icon.eye size={13} /> Swap photo</button>
                      <label className="mg-btn mg-btn--quiet" style={{ fontSize: 12, cursor: "pointer" }}>
                        <Icon.plus size={13} /> Upload yours
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; edit.upload?.(f); }} />
                      </label>
                      {edit.branded && (
                        <input value={edit.hook} onChange={(e) => edit.setHook(e.target.value)} placeholder="Hook shown on the image" className="mg-field mg-focus" style={{ flex: 1, minWidth: 170, fontSize: 13 }} />
                      )}
                    </div>
                    {edit.swapOpen && (
                      <div className="mt-2">
                        {edit.swapLoading ? <p className="text-[12px] mg-subtle px-1 py-2">Finding photos…</p> : edit.swapOpts.length ? (
                          <div className="grid grid-cols-4 gap-2">
                            {edit.swapOpts.slice(0, 12).map((o, i) => (
                              <button key={i} type="button" onClick={() => edit.pickSwap(o)} className="mg-focus" title={o.source === "stock" ? "Free stock" : "Your image"} style={{ padding: 0, border: "1px solid var(--hair)", borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "var(--surface-2)" }}>
                                <img src={o.url} alt="" loading="lazy" style={{ display: "block", width: "100%", height: 54, objectFit: "cover" }} />
                              </button>
                            ))}
                          </div>
                        ) : <p className="text-[12px] mg-subtle px-1 py-2">No other photos found. Add a Pexels key for stock options.</p>}
                      </div>
                    )}
                  </div>
                )}
                <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} autoFocus className="mg-field mg-focus" style={{ minHeight: edit.image ? 150 : 280, lineHeight: 1.68, fontSize: 14 }} />
              </div>
            ) : item.draft ? (
              <div className="mg-article" dangerouslySetInnerHTML={{ __html: markdownToHtml(deDash(item.draft)) }} />
            ) : (
              <p className="text-[13px] mg-subtle">This one has no body to preview.</p>
            )}
          </div>
        </div>
      </div>

      {/* action bar */}
      <div className="flex items-center gap-2.5 px-6 py-4 mt-5 flex-wrap" style={{ borderTop: "1px solid var(--hair)", background: "var(--surface-2)" }}>
        {editing ? (
          <>
            <button className="mg-btn mg-btn--dawn" onClick={edit.saveApprove} disabled={working}>Save & approve</button>
            <button className="mg-btn mg-btn--ghost" onClick={edit.save}>Save</button>
            <button className="mg-btn mg-btn--quiet" onClick={onCancelEdit}>Cancel <span className="mg-kbd" style={{ marginLeft: 4 }}>Esc</span></button>
          </>
        ) : (
          <>
            <button className="mg-btn mg-btn--dawn" onClick={onApprove} disabled={working}>{working ? "Publishing…" : item.owned ? "Approve & publish" : item.platform === "pinterest" ? "Save to Pinterest" : "Copy & open"} <span className="mg-kbd" style={{ marginLeft: 4 }}>A</span></button>
            <button className="mg-btn mg-btn--ghost" onClick={onEdit}>Edit <span className="mg-kbd" style={{ marginLeft: 4 }}>E</span></button>
            <button className="mg-btn mg-btn--quiet" onClick={onSkip}>Skip <span className="mg-kbd" style={{ marginLeft: 4 }}>S</span></button>
            <div className="ml-auto flex items-center gap-2">
              <button className="mg-btn mg-btn--quiet" onClick={onPrev} disabled={idx === 0} style={{ fontSize: 12.5 }}>← Previous</button>
              <button className="mg-btn mg-btn--ghost" onClick={onNext} disabled={idx >= count - 1} style={{ fontSize: 12.5 }}>Next →</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// The "Why:" metadata row — built only from what's real for this item.
function WhyRow({ item }) {
  const chips = [];
  if (item.keyword) chips.push(<><span className="font-semibold" style={{ color: "var(--fg-muted)" }}>Targets</span> <span style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{item.keyword}</span></>);
  (item.tags || []).slice(0, 2).forEach((t) => chips.push(<span>{t.label}</span>));
  if (!chips.length && item.outcome) chips.push(<span>{item.outcome}</span>);
  if (!chips.length) return null;
  return (
    <p className="mt-2 text-[12.5px] mg-subtle flex items-center gap-2 flex-wrap">
      <span className="font-semibold" style={{ color: "var(--fg-muted)" }}>Why:</span>
      {chips.map((c, i) => <span key={i} className="flex items-center gap-2">{i > 0 && <span className="mg-subtle">·</span>}{c}</span>)}
    </p>
  );
}

// Left lower panel — SEO targets + publishing for articles; destination for the rest.
function LeftPanel({ item, isArticle }) {
  const secondary = Array.isArray(item.relatedKeywords) ? item.relatedKeywords.filter(Boolean).slice(0, 3) : [];
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] mg-subtle"><Icon.target size={13} style={{ color: "var(--accent-ink)" }} /> {isArticle ? "SEO TARGETS" : "WHERE THIS GOES"}</p>

      {item.keyword ? (
        <div className="mt-3">
          <p className="text-[10.5px] font-semibold mg-subtle tracking-wide">PRIMARY</p>
          <p className="mt-0.5 text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{item.keyword}</p>
        </div>
      ) : null}

      {secondary.length > 0 && (
        <div className="mt-3">
          <p className="text-[10.5px] font-semibold mg-subtle tracking-wide">SECONDARY</p>
          <ul className="mt-1 space-y-1">
            {secondary.map((k, i) => (
              <li key={i} className="text-[12.5px] mg-muted flex items-center gap-1.5"><span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--fg-subtle)" }} /> {typeof k === "string" ? k : (k.keyword || k.kw)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mg-seam my-3.5" />

      <dl className="space-y-2.5">
        <PubRow icon={Icon.globe} label="Publishing to" value={item.owned ? (isArticle ? "your blog" : "your account") : plat(item.platform || item.brand || "the thread")} />
        {isArticle && <PubRow icon={Icon.clock} label="Expected indexing" value="3 to 6 hours" />}
        {isArticle && <PubRow icon={Icon.growth} label="Expected ranking" value="Top 20 in 30 days" />}
        {!isArticle && item.target_url && item.target_url !== "#" && <PubRow icon={Icon.link} label="Destination" value="Opens on approve" />}
      </dl>
    </div>
  );
}
function PubRow({ icon: I, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <I size={14} style={{ color: "var(--fg-subtle)", marginTop: 1, flexShrink: 0 }} />
      <div className="min-w-0">
        <dt className="text-[11px] mg-subtle leading-tight">{label}</dt>
        <dd className="text-[12.5px] font-semibold leading-tight" style={{ color: "var(--fg)" }}>{value}</dd>
      </div>
    </div>
  );
}

// ── THE QUEUE — up next, compact, always visible ────────────────────────────
function ApprovalQueue({ view, idx, onPick }) {
  const upNext = view.filter((_, i) => i !== idx);
  return (
    <div className="xl:sticky xl:top-4">
      <div className="flex items-center justify-between mb-2.5 px-1">
        <p className="mg-klabel">Up next ({upNext.length})</p>
        <div className="flex items-center gap-1">
          <button onClick={() => onPick(Math.max(0, idx - 1))} className="mg-focus" style={{ color: "var(--fg-subtle)", background: "none", border: "none", cursor: "pointer", padding: 2 }} aria-label="Previous"><Icon.chevronRight size={15} style={{ transform: "rotate(180deg)" }} /></button>
          <button onClick={() => onPick(Math.min(view.length - 1, idx + 1))} className="mg-focus" style={{ color: "var(--fg-subtle)", background: "none", border: "none", cursor: "pointer", padding: 2 }} aria-label="Next"><Icon.chevronRight size={15} /></button>
        </div>
      </div>
      <div className="mg-surface p-2 space-y-0.5" style={{ maxHeight: "calc(100vh - 160px)", overflowY: "auto" }}>
        {view.map((it, i) => {
          const im = impactMeta(it.impact);
          return (
            <button key={it.id} onClick={() => onPick(i)} className="mg-qrow mg-focus" data-active={i === idx}>
              <BrandIcon brand={it.brand} size={13} />
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-semibold truncate" style={{ color: i === idx ? "var(--fg)" : "var(--fg-muted)" }}>{queueTitle(it)}</span>
                <span className="block text-[10.5px] mg-subtle">{im.label} impact</span>
              </span>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: im.dot, flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
      <a href="/tasks" className="mt-2.5 mg-btn mg-btn--ghost w-full" style={{ fontSize: 12.5 }}>View all queue ({view.length}) →</a>
    </div>
  );
}
function queueTitle(it) {
  if (it.kind === "article") return "Publish a blog article";
  if (it.isCarousel) return `${plat(it.platform || "Instagram")} carousel`;
  if (it.platform === "gbp") return "Post to Google Business";
  if (it.platform === "review_request") return "Ask for a review";
  if (it.platform === "pinterest") return "Pin to Pinterest";
  if (it.source === "placement" || /community|reply/.test(it.kind || "")) return `Reply on ${plat(it.platform || "community")}`;
  if (it.kind === "outreach_email") return "Send an outreach email";
  if (it.platform) return `Post to ${plat(it.platform)}`;
  return it.title || "Recommendation";
}

// ── ALL CLEAR / EMPTY ───────────────────────────────────────────────────────
function AllClear({ done, drafting, onDraft, filtered, onClear }) {
  return (
    <div className="mt-8 mg-surface mg-ambient p-12 text-center">
      <span className="mg-tile mx-auto" style={{ width: 62, height: 62, background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}><Icon.check size={30} /></span>
      <p className="mt-4 mg-title" style={{ fontSize: 21 }}>{done > 0 ? <>Cleared. <span className="mg-num">{done}</span> {done === 1 ? "decision" : "decisions"} approved.</> : filtered ? "Nothing matches these filters." : "Nothing in your queue yet."}</p>
      <p className="mt-1.5 text-[14px] mg-muted max-w-md mx-auto">{done > 0 ? "I’m already lining up tomorrow’s work. Go enjoy your day." : filtered ? "Try widening the filters to see the rest of your queue." : "Have me draft your first publish-ready article and social posts right now, from what I already learned about you."}</p>
      <div className="mt-5 flex items-center justify-center gap-2.5">
        {filtered && done === 0 ? (
          <button onClick={onClear} className="mg-btn mg-btn--dawn">Clear filters</button>
        ) : done === 0 ? (
          <button onClick={onDraft} disabled={drafting} className="mg-btn mg-btn--dawn disabled:opacity-60">{drafting ? "Genie is writing… (~30s)" : "Draft my first content →"}</button>
        ) : null}
        <a href={done > 0 ? "/today" : "/growth"} className="mg-btn mg-btn--ghost">{done > 0 ? "Back to Today" : "See opportunities"}</a>
      </div>
    </div>
  );
}

// ── SMALL PARTS ─────────────────────────────────────────────────────────────
function FilterMenu({ value, opts, open, onToggle, onPick }) {
  const cur = opts.find((o) => o.id === value) || opts[0];
  return (
    <div className="relative">
      <button className="mg-filter" data-open={open} onClick={onToggle}>Filter: {cur.label} <Icon.chevronRight size={13} style={{ transform: "rotate(90deg)", color: "var(--fg-subtle)" }} /></button>
      {open && (
        <div className="mg-menu" style={{ left: 0, top: "calc(100% + 4px)" }}>
          {opts.map((o) => (
            <button key={o.id} className="mg-menu-item" data-active={o.id === value} onClick={() => onPick(o.id)}>
              <span style={{ width: 14, display: "inline-flex" }}>{o.id === value && <Icon.check size={13} style={{ color: "var(--accent-ink)" }} />}</span>{o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(8,10,16,.45)", backdropFilter: "blur(2px)" }} />
      <div className="mg-surface mg-rise relative p-6" style={{ maxWidth: 420, width: "100%", boxShadow: "var(--shadow-3)" }} onMouseDown={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
function Bookmark({ filled }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v16l-6-4-6 4z" /></svg>;
}
function Dots() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>;
}
function defaultReasoning(item) {
  const kw = item.keyword ? `“${item.keyword}”` : "this opportunity";
  if (item.kind === "article") return `I found ${kw} is where your buyers are searching and you don’t show up yet. This piece is written to answer that query and rank for it, so the next person looking lands on you instead of a competitor.`;
  return item.outcome || `This puts you in front of buyers who are deciding right now. Approving it does the work; I handle the rest.`;
}
