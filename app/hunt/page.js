"use client";

// ── BUYER HUNT — the storm, front and center ──
// A live board of the hottest buyers Genie found across Hacker News, Software
// Recommendations, GitHub, Reddit and Quora — ranked by how close they are to buying
// (intent 0-100 + journey stage). Each is one tap to engage: copy Genie's value-first
// reply and open the thread. Reads /api/hunt; engaging marks it via /api/approvals/act.

import { useState, useEffect, useCallback, useMemo } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";
import GenieAperture from "@/components/brand/GenieAperture";

const STAGE_META = {
  ready_to_buy: { label: "Ready to buy", tone: "live" },
  comparing: { label: "Comparing", tone: "dawn" },
  solution_aware: { label: "Solution-aware", tone: "info" },
  problem_aware: { label: "Problem-aware", tone: "neutral" },
  unaware: { label: "Unaware", tone: "neutral" },
  post_purchase: { label: "Customer", tone: "info" },
};
const SIGNAL_LABEL = {
  "comparison": "comparing options", "best-for query": "best-for search", "evaluation": "evaluating",
  "pricing": "price-checking", "seeking-recommendation": "asking for a rec", "decision": "deciding now",
  "solution-seeking": "seeking a solution", "problem": "has the problem", "competitor mention": "eyeing a rival", "urgency": "urgent",
};

// Intent → heat colour + label.
function heat(n) {
  // Buying-intent as a cohesive BLUE intensity ramp (deep royal = strongest intent ->
  // light slate = weakest). No warm colours — the number carries the value, the depth of
  // blue and the label carry the tier. White number on every tile.
  if (n >= 85) return { color: "#16244E", soft: "rgba(22,36,78,.28)", label: "Top intent" };
  if (n >= 70) return { color: "#2A407F", soft: "rgba(42,64,127,.26)", label: "High intent" };
  if (n >= 55) return { color: "#4A6699", soft: "rgba(74,102,153,.22)", label: "Medium" };
  return { color: "#7A889E", soft: "rgba(122,136,158,.20)", label: "Low" };
}

export default function HuntPage() {
  const [buyers, setBuyers] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hunting, setHunting] = useState(false);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("all"); // all | ready_to_buy | comparing
  const [openId, setOpenId] = useState(null);
  const [rivals, setRivals] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await fetch("/api/hunt", { cache: "no-store" }).then((r) => r.json());
      if (j?.ok) { setBuyers(j.buyers || []); setSummary(j.summary || null); } else setBuyers([]);
    } catch { setBuyers([]); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function huntNow() {
    if (hunting) return;
    setHunting(true); setMsg("Genie is hunting buyers across Hacker News, Software Recs, GitHub, Reddit and Quora… up to a minute.");
    try {
      const j = await fetch("/api/community/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rivals }) }).then((r) => r.json());
      const reddit = j?.reddit?.via === "api" ? "Reddit API ✓" : j?.reddit?.via === "rss" ? "Reddit via RSS ✓" : "Reddit via Google index ✓";
      if (j?.ok) { setMsg(`${j.buyersFound || 0} buyers found · ${reddit}.`); await load(); }
      else setMsg(j?.error || "Couldn't hunt just now. Try again in a moment.");
    } catch { setMsg("Couldn't hunt just now. Try again in a moment."); }
    setHunting(false);
  }

  async function engage(b) {
    try { await navigator.clipboard.writeText(b.draft || ""); } catch {}
    if (b.url) window.open(b.url, "_blank");
    try { await fetch("/api/approvals/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, source: "placement", act: "approve" }) }); } catch {}
    setBuyers((bs) => (bs || []).filter((x) => x.id !== b.id));
    setToast("Reply copied + thread opened. Paste, tweak, post — you're helping a real buyer.");
  }
  async function dismiss(b) {
    try { await fetch("/api/approvals/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, source: "placement", act: "skip" }) }); } catch {}
    setBuyers((bs) => (bs || []).filter((x) => x.id !== b.id));
  }

  const view = useMemo(() => (buyers || []).filter((b) => filter === "all" || b.stage === filter), [buyers, filter]);

  return (
    <OperatorShell active="hunt">
      {/* header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="mg-eyebrow"><Icon.crosshair size={14} /> Buyer Hunt</p>
          <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(29px,3.2vw,40px)" }}>People ready to <span className="dawn-text">buy — right now.</span></h1>
          <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "60ch" }}>Genie hunts the whole internet for people researching, comparing and deciding in your space, ranks them by buying intent, and drafts the perfect helpful reply. You engage in one tap.</p>
        </div>
        <button onClick={huntNow} disabled={hunting} className="mg-btn mg-btn--dawn disabled:opacity-60" style={{ fontSize: 13 }}>
          <Icon.crosshair size={15} /> {hunting ? "Hunting…" : "Find buyers now"}
        </button>
      </div>
      {msg && <p className="mt-2 text-[12.5px]" style={{ color: "var(--accent-ink)" }}>{msg}</p>}

      {/* competitor-poaching mode */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <input value={rivals} onChange={(e) => setRivals(e.target.value)} placeholder="Poach from rivals — name competitors, comma-separated (optional)" className="mg-field mg-focus" style={{ flex: 1, minWidth: 280, maxWidth: 520, fontSize: 13 }} />
        <span className="text-[11.5px] mg-subtle">Genie hunts people asking for an alternative to them.</span>
      </div>

      {/* stat strip */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="In your sights" value={summary?.total ?? "—"} icon={Icon.crosshair} tint="dawn" />
        <Stat label="Ready to buy" value={summary?.readyToBuy ?? "—"} icon={Icon.bolt} tint="live" />
        <Stat label="Comparing you" value={summary?.comparing ?? "—"} icon={Icon.growth} tint="info" />
        <Stat label="Hottest intent" value={summary?.top ? `${summary.top}` : "—"} suffix={summary?.top ? "/100" : ""} icon={Icon.spark} tint="dawn" />
      </div>

      {/* filters */}
      {buyers && buyers.length > 0 && (
        <div className="mt-5 flex items-center gap-2 flex-wrap">
          {[["all", "All buyers"], ["ready_to_buy", "Ready to buy"], ["comparing", "Comparing"]].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} className="mg-focus" style={{ fontSize: 12.5, fontWeight: 600, padding: ".4rem .8rem", borderRadius: 999, cursor: "pointer", border: `1px solid ${filter === id ? "var(--accent)" : "var(--hair)"}`, background: filter === id ? "var(--accent-quiet)" : "var(--surface)", color: filter === id ? "var(--accent-ink)" : "var(--fg-muted)" }}>{label}</button>
          ))}
        </div>
      )}

      {/* board */}
      {loading && !hunting ? (
        <div className="mt-6 mg-surface p-10 text-center text-[13px] mg-subtle">Loading your buyers…</div>
      ) : !buyers || buyers.length === 0 ? (
        <Card className="mt-6 p-10 text-center mg-aura-field">
          <div style={{ display: "grid", placeItems: "center" }}><GenieAperture size={92} state={hunting ? "scanning" : "idle"} /></div>
          <p className="mt-4 text-[17px] font-bold flex items-center justify-center gap-2" style={{ color: "var(--fg)" }}>
            {hunting ? <>Genie is hunting the internet <span className="mg-thinking"><i /><i /><i /></span></> : "No buyers in your sights yet"}
          </p>
          <p className="mt-1.5 text-[13.5px] mg-muted max-w-md mx-auto">
            {hunting
              ? "Sweeping Hacker News, Software Recommendations, GitHub, Reddit and Quora for people actively looking to buy what you sell. This takes up to a minute."
              : <>Hit <b style={{ color: "var(--fg)" }}>Find buyers now</b> and Genie sweeps Hacker News, Software Recommendations, GitHub, Reddit and Quora for people actively looking to buy. Connect your Reddit key to unlock the biggest source for your niche.</>}
          </p>
          {!hunting && <button onClick={huntNow} className="mg-btn mg-btn--dawn mt-5 inline-flex" style={{ fontSize: 13.5 }}><Icon.crosshair size={15} /> Find buyers now</button>}
        </Card>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {view.map((b) => <BuyerCard key={b.id} b={b} open={openId === b.id} onToggle={() => setOpenId(openId === b.id ? null : b.id)} onEngage={() => engage(b)} onDismiss={() => dismiss(b)} />)}
          {view.length === 0 && <p className="text-[13px] mg-subtle text-center py-6">No buyers in this stage right now.</p>}
        </div>
      )}

      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
    </OperatorShell>
  );
}

function BuyerCard({ b, open, onToggle, onEngage, onDismiss }) {
  const h = heat(b.intent);
  const stage = STAGE_META[b.stage] || null;
  const sigs = (b.signals || []).map((s) => SIGNAL_LABEL[s] || s).slice(0, 3);
  return (
    <Card className="p-0 overflow-hidden mg-lift">
      <div className="p-4 sm:p-5 flex items-start gap-4">
        {/* intent score — a solid heat tile (the buying-intent, made tangible), not a line */}
        <div className="shrink-0 flex flex-col items-center" style={{ width: 56 }}>
          <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 15, background: h.color, color: "#fff", boxShadow: `0 5px 16px ${h.soft}` }}>
            <span className="mg-num" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{b.intent}</span>
          </div>
          <div className="text-[9.5px] font-bold uppercase tracking-wide mt-1.5 text-center" style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{h.label}</div>
        </div>

        {/* body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--surface-2)", color: "var(--fg-muted)", border: "1px solid var(--border)" }}>{b.platformLabel}</span>
            {stage && <Pill tone={stage.tone}>{stage.label}</Pill>}
            {b.competitor && <Pill tone="info">eyeing a rival</Pill>}
          </div>
          <a href={b.url} target="_blank" rel="noreferrer" className="block mt-1.5 text-[14.5px] font-bold mg-focus" style={{ color: "var(--fg)" }}>{b.title || "View the thread"} <span style={{ color: "var(--accent-ink)", fontWeight: 600, fontSize: 12 }}>↗</span></a>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {sigs.map((s, i) => <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface-2)", color: "var(--fg-muted)" }}>{s}</span>)}
            {b.query && <span className="text-[11px] mg-subtle">· from “{b.query}”</span>}
          </div>
          {b.reason && <p className="mt-1.5 text-[12.5px] mg-muted"><span className="font-semibold" style={{ color: "var(--fg)" }}>Why:</span> {b.reason}</p>}
        </div>

        {/* actions */}
        <div className="shrink-0 flex flex-col gap-2 items-end">
          <button onClick={onEngage} className="mg-btn mg-btn--dawn" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}><Icon.reply size={13} /> Engage</button>
          <button onClick={onToggle} className="mg-btn mg-btn--quiet" style={{ fontSize: 12 }}>{open ? "Hide reply" : "See reply"}</button>
        </div>
      </div>

      {open && b.draft && (
        <div className="px-4 sm:px-5 pb-5">
          <div className="rounded-xl p-3.5" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
            <p className="text-[11px] font-bold tracking-[0.08em] mg-subtle mb-2">GENIE'S VALUE-FIRST REPLY · edit before you post</p>
            <p className="text-[13.5px] whitespace-pre-wrap" style={{ color: "var(--fg)", lineHeight: 1.6 }}>{b.draft}</p>
            <div className="mt-3 flex items-center gap-2.5">
              <button onClick={onEngage} className="mg-btn mg-btn--dawn" style={{ fontSize: 12.5 }}>Copy &amp; open thread →</button>
              <button onClick={onDismiss} className="mg-btn mg-btn--quiet" style={{ fontSize: 12 }}>Not a fit</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, suffix = "", icon: Ic, tint }) {
  // Solid tile + glyph: royal-blue tile carries a gold glyph (like the reference); the
  // semantic live/info tiles keep white glyphs. The number stays deep navy — the fact.
  const tileBg = tint === "live" ? "var(--signal-live)" : tint === "info" ? "var(--signal-info)" : "var(--accent)";
  const tileShadow = tint === "live" ? "0 3px 10px rgba(30,158,106,.26)" : tint === "info" ? "0 3px 10px rgba(62,124,194,.24)" : "0 3px 10px rgba(22,36,78,.26)";
  const glyph = tint === "live" || tint === "info" ? "#fff" : "var(--on-accent)";
  return (
    <Card className="p-4 flex items-center gap-3">
      <span className="mg-tile shrink-0" style={{ width: 38, height: 38, background: tileBg, color: glyph, boxShadow: tileShadow }}><Ic size={18} /></span>
      <div className="min-w-0">
        <div className="mg-num" style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: "var(--fg)" }}>{value}<span className="text-[13px] mg-subtle">{suffix}</span></div>
        <div className="text-[11.5px] mg-subtle mt-0.5">{label}</div>
      </div>
    </Card>
  );
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 5000); return () => clearTimeout(t); }, [msg, onDone]);
  return (
    <div className="fixed left-1/2 z-50" style={{ bottom: 24, transform: "translateX(-50%)" }}>
      <div className="mg-surface px-4 py-2.5 text-[13px] mg-rise" style={{ boxShadow: "var(--shadow-3)", color: "var(--fg)", borderColor: "var(--border-strong)", maxWidth: "90vw" }}>{msg}</div>
    </div>
  );
}
