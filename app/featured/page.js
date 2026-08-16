"use client";

// ── GET FEATURED — earned-media outreach ──
// Four separate plays (roundups / guest posts / press / directories). Each play's
// results are SAVED and shown only in its own section — they persist across
// navigation. Applied sites show "Applied"; the rest wait for you. "Find more"
// scans again and only adds genuinely new sites (applied ones are held back 60 days).

import { useState, useEffect, useCallback } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";

const PLAYS = [
  { id: "backlinks", label: "Get listed in roundups", blurb: "Blogs & guides that publish “best of” lists you could be added to.", icon: "growth" },
  { id: "guest", label: "Publish a guest post", blurb: "Sites in your space that accept guest contributors.", icon: "write" },
  { id: "press", label: "Earn press coverage", blurb: "Publications & journalists who cover your niche.", icon: "spark" },
  { id: "directory", label: "Get a directory listing", blurb: "Directories & “best of” sites to be listed on.", icon: "check" },
];

const mapRow = (o) => ({ ...o, subject: o.subject || "", body: o.body || "", state: o.applied ? "sent" : "idle" });

export default function FeaturedPage() {
  const [play, setPlay] = useState("backlinks");
  const [niche, setNiche] = useState("");
  const [rows, setRows] = useState(null);       // saved opportunities for the current play
  const [counts, setCounts] = useState({});      // per-play {total, applied}
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);       // scanning for more
  const [err, setErr] = useState("");
  const [debug, setDebug] = useState(null);
  const [toast, setToast] = useState("");

  const loadList = useCallback(async (pl) => {
    setLoading(true); setRows(null); setErr("");
    try {
      const j = await fetch(`/api/featured/list?play=${pl}`, { cache: "no-store" }).then((r) => r.json());
      if (j?.ok) { setRows((j.opportunities || []).map(mapRow)); setCounts(j.counts || {}); }
      else setRows([]);
    } catch { setRows([]); }
    setLoading(false);
  }, []);

  useEffect(() => { loadList(play); }, [play, loadList]);

  async function scan() {
    const q = niche.trim();
    if (!q || busy) return;
    setBusy(true); setErr(""); setDebug(null);
    try {
      const j = await fetch("/api/featured/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ play, niche: q }) }).then((r) => r.json());
      if (j?.ok) {
        const mapped = (j.opportunities || []).map(mapRow);
        setRows(mapped); setDebug(j.debug || null);
        setCounts((c) => ({ ...c, [play]: { total: mapped.length, applied: mapped.filter((r) => r.applied).length } }));
        setToast(j.newCount > 0 ? `Found ${j.newCount} new site${j.newCount === 1 ? "" : "s"}.` : "No new sites this time — try a different niche, or check back later.");
      } else setErr(j?.error || "Couldn't run that search. Try again.");
    } catch { setErr("Something interrupted the search. Try again."); }
    setBusy(false);
  }

  function patch(i, next) { setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...next } : r))); }

  async function markApplied(id) {
    try { await fetch("/api/featured/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, act: "apply" }) }); } catch {}
  }

  async function send(i) {
    const p = rows[i];
    if (p.state === "sending" || p.state === "sent") return;
    if (!p.contact?.email) {
      try { await navigator.clipboard.writeText(`${p.subject}\n\n${p.body}`); } catch {}
      if (p.contact?.contactForm) window.open(p.contact.contactForm, "_blank");
      patch(i, { state: "sent", applied: true }); await markApplied(p.id);
      setToast("Pitch copied + marked applied. Paste it into their form.");
      return;
    }
    patch(i, { state: "sending" });
    try {
      const j = await fetch("/api/prospects/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: p.contact.email, subject: p.subject, body: p.body, name: p.contact.name, company: p.company }) }).then((r) => r.json());
      if (j?.ok) { patch(i, { state: "sent", applied: true }); await markApplied(p.id); setToast(`Sent to ${p.contact.name || p.company}. Replies land in your Inbox.`); }
      else { patch(i, { state: "idle" }); setToast(j?.error || "Couldn't send that one."); }
    } catch { patch(i, { state: "idle" }); setToast("Couldn't send that one. Try again."); }
  }

  const current = PLAYS.find((p) => p.id === play) || PLAYS[0];
  const pending = (rows || []).filter((r) => !r.applied).length;
  const applied = (rows || []).filter((r) => r.applied).length;

  return (
    <OperatorShell active="featured">
      <div>
        <h1 className="mg-display" style={{ fontSize: "clamp(24px,2.6vw,30px)" }}>Get featured</h1>
        <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "64ch" }}>The most powerful marketing is when <b style={{ color: "var(--fg)" }}>others</b> talk about you. Pick a goal, name your niche, and Genie finds real sites, the right contact, and a genuine pitch. You review and send from your own email. No fake accounts, no bought links.</p>
      </div>

      {/* play selector — each keeps its own saved results */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {PLAYS.map((p) => {
          const Ic = Icon[p.icon] || Icon.spark; const on = play === p.id; const c = counts[p.id];
          return (
            <button key={p.id} onClick={() => setPlay(p.id)} className="mg-focus text-left" style={{ padding: 14, borderRadius: 14, cursor: "pointer", background: on ? "var(--accent-quiet)" : "var(--surface)", border: `1px solid ${on ? "var(--accent)" : "var(--hair)"}`, transition: "all .15s" }}>
              <span className="flex items-center gap-2">
                <span className="mg-tile" style={{ width: 28, height: 28, background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "var(--on-primary)" : "var(--fg-muted)" }}><Ic size={15} /></span>
                <span className="text-[13.5px] font-bold" style={{ color: on ? "var(--accent-ink)" : "var(--fg)" }}>{p.label}</span>
                {c?.total > 0 && <span className="ml-auto mg-num text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "var(--on-primary)" : "var(--fg-muted)" }}>{c.total}</span>}
              </span>
              <span className="block mt-1.5 text-[11.5px] mg-muted leading-snug">{p.blurb}</span>
            </button>
          );
        })}
      </div>

      {/* search / find more */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <input value={niche} onChange={(e) => setNiche(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scan()}
          placeholder="Your niche or topic, e.g. rugs, AR shopping tech, sustainable fashion" className="mg-field mg-focus" style={{ flex: 1, minWidth: 260, maxWidth: 520, fontSize: 14 }} />
        <button onClick={scan} disabled={busy || !niche.trim()} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 13.5 }}>
          {busy ? "Finding sites…" : (rows && rows.length ? "Find more →" : "Find sites →")}
        </button>
      </div>
      {err && <p className="mt-3 text-[13px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}

      {busy && (
        <Card className="mt-5 p-8 text-center">
          <span className="mg-live-dot mx-auto" style={{ display: "block", width: 8 }} />
          <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--fg)" }}>Genie is finding new sites for “{current.label}”…</p>
          <p className="mt-1 text-[12.5px] mg-muted">Finding real sites, crawling each for the right contact, and writing a tailored pitch. Up to a minute.</p>
        </Card>
      )}

      {loading && !busy && <div className="mt-6 mg-surface p-8 text-center text-[13px] mg-subtle">Loading your {current.label.toLowerCase()}…</div>}

      {!loading && !busy && rows && rows.length === 0 && (
        <Card className="mt-5 p-9 text-center mg-ambient">
          <span className="mg-tile mx-auto" style={{ width: 44, height: 44, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.megaphone size={20} /></span>
          <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--fg)" }}>No sites here yet for “{current.label}”</p>
          <p className="mt-1.5 text-[13px] mg-muted max-w-md mx-auto">{debug && debug.sites > 0 ? "Found sites but couldn’t reach them — try again or a slightly different niche." : "Enter your niche above and press Find sites. Genie searches for real places that could feature you."}</p>
          {debug && (
            <p className="mt-3 text-[11px]" style={{ color: "var(--fg-subtle)", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 660, marginLeft: "auto", marginRight: "auto", textAlign: "left" }}>
              {`diagnostic — primary: search=${debug.search ?? 0} ai=${debug.ai ?? 0}${debug.err ? ` err=${debug.err}` : ""}`}
              {(debug.diag?.probes || []).map((p, k) => `\n${p.label}: ${p.err ? "ERR " + p.err : `${p.provider} parsed=${p.parsed} kept=${p.mapped}`}`).join("")}
              {debug.insertErr ? `\ninsert error: ${debug.insertErr}` : ""}
            </p>
          )}
        </Card>
      )}

      {!loading && rows && rows.length > 0 && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="mg-klabel">{rows.length} {rows.length === 1 ? "site" : "sites"} for “{current.label}” · <span style={{ color: "var(--fg-muted)" }}>{pending} to apply</span>{applied > 0 && <span style={{ color: "var(--signal-live-ink)" }}> · {applied} applied</span>}</p>
          {rows.map((p, i) => (
            <Card key={p.id || i} className="p-5 mg-lift" style={p.applied ? { opacity: 0.82 } : undefined}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>{p.company} <a href={p.url} target="_blank" rel="noreferrer" className="text-[12px] font-medium" style={{ color: "var(--accent-ink)" }}>{p.domain} ↗</a></p>
                  {p.summary && <p className="mt-0.5 text-[12.5px] mg-muted">{p.summary}</p>}
                </div>
                {p.applied ? <Pill tone="live"><Icon.check size={12} /> Applied</Pill> : p.contact?.email ? <Pill tone="dawn">{p.contact.emailType === "named" ? "Direct contact" : "Editor inbox"}</Pill> : <Pill tone="info">Contact form</Pill>}
              </div>

              <div className="mt-3 flex items-center gap-2.5 flex-wrap text-[13px]">
                <span className="mg-tile" style={{ width: 30, height: 30, background: "var(--accent-quiet)", color: "var(--accent-ink)", fontWeight: 700, fontSize: 12 }}>{(p.contact?.name || p.company || "?").charAt(0).toUpperCase()}</span>
                <span className="font-semibold" style={{ color: "var(--fg)" }}>{p.contact?.name || "Best contact"}</span>
                {p.contact?.title && <Pill tone="neutral">{p.contact.title}</Pill>}
                <span className="mg-num" style={{ color: "var(--fg-muted)" }}>{p.contact?.email || (p.contact?.contactForm ? "via contact form" : "no email found")}</span>
              </div>
              {p.whyFit && <p className="mt-2 text-[12.5px]" style={{ color: "var(--fg-muted)" }}><span className="font-semibold" style={{ color: "var(--fg)" }}>Why them:</span> {p.whyFit}</p>}

              {!p.applied && (
                <div className="mt-3.5 rounded-xl p-3.5" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
                  <p className="text-[11px] font-bold tracking-[0.08em] mg-subtle mb-2">THE PITCH · edit before you send</p>
                  <input value={p.subject} onChange={(e) => patch(i, { subject: e.target.value })} className="mg-field mg-focus" style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }} />
                  <textarea value={p.body} onChange={(e) => patch(i, { body: e.target.value })} className="mg-field mg-focus" style={{ fontSize: 13.5, lineHeight: 1.6, minHeight: 120 }} />
                </div>
              )}

              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <button onClick={() => send(i)} disabled={p.state === "sending" || p.state === "sent"} className="mg-btn mg-btn--dawn disabled:opacity-60" style={{ fontSize: 13 }}>
                  {p.applied ? "Applied ✓" : p.state === "sending" ? "Sending…" : p.contact?.email ? "Send →" : "Copy & open form →"}
                </button>
                {!p.applied && <span className="text-[11.5px] mg-subtle">{p.contact?.email ? "From your own email · counts toward today's cap" : "No email — send via their form"}</span>}
                {p.applied && p.appliedAt && <span className="text-[11.5px] mg-subtle">Applied {new Date(p.appliedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
              </div>
            </Card>
          ))}
          <p className="text-[12px] mg-subtle" style={{ maxWidth: "72ch" }}>Genie only keeps real, reachable sites and never invents an address. Results stay saved here per section. Applied sites are held back from re-scans for 60 days so you don't pester the same editor. Replies land in your Inbox.</p>
        </div>
      )}

      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
    </OperatorShell>
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
