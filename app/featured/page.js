"use client";

// ── GET FEATURED — earned-media outreach ──
// Get OTHERS to feature you: pick a play (roundup inclusion, guest post, press,
// directory), name your niche, and Genie finds real sites, the right contact, and a
// tailored pitch for each. You review and send from your own email — same engine as
// Find clients. Nothing fake: real sites, real contacts, genuine outreach.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";

const PLAYS = [
  { id: "backlinks", label: "Get listed in roundups", blurb: "Blogs & guides that publish “best of” lists you could be added to.", icon: "growth" },
  { id: "guest", label: "Publish a guest post", blurb: "Sites in your space that accept guest contributors.", icon: "write" },
  { id: "press", label: "Earn press coverage", blurb: "Publications & journalists who cover your niche.", icon: "spark" },
  { id: "directory", label: "Get a directory listing", blurb: "Directories & “best of” sites to be listed on.", icon: "check" },
];

export default function FeaturedPage() {
  const [play, setPlay] = useState("backlinks");
  const [niche, setNiche] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState(null);
  const [debug, setDebug] = useState(null);
  const [toast, setToast] = useState("");

  async function find() {
    const q = niche.trim();
    if (!q || busy) return;
    setBusy(true); setErr(""); setRows(null); setDebug(null);
    try {
      const j = await fetch("/api/featured/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ play, niche: q }) }).then((r) => r.json());
      if (j?.ok) { setRows((j.opportunities || []).map((p) => ({ ...p, subject: p.pitch?.subject || "", body: p.pitch?.body || "", state: "idle" }))); setDebug(j.debug || null); }
      else setErr(j?.error || "Couldn't run that search. Try again.");
    } catch { setErr("Something interrupted the search. Try again."); }
    setBusy(false);
  }

  function patch(i, next) { setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...next } : r))); }

  async function send(i) {
    const p = rows[i];
    if (p.state === "sending" || p.state === "sent") return;
    if (!p.contact?.email) {
      try { await navigator.clipboard.writeText(`${p.subject}\n\n${p.body}`); } catch {}
      if (p.contact?.contactForm) window.open(p.contact.contactForm, "_blank");
      patch(i, { state: "sent" }); setToast("Pitch copied. Paste it into their contact form.");
      return;
    }
    patch(i, { state: "sending" });
    try {
      const j = await fetch("/api/prospects/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: p.contact.email, subject: p.subject, body: p.body, name: p.contact.name, company: p.company }) }).then((r) => r.json());
      if (j?.ok) { patch(i, { state: "sent" }); setToast(`Sent to ${p.contact.name || p.company}. Replies land in your Inbox.`); }
      else { patch(i, { state: "idle" }); setToast(j?.error || "Couldn't send that one."); }
    } catch { patch(i, { state: "idle" }); setToast("Couldn't send that one. Try again."); }
  }

  const current = PLAYS.find((p) => p.id === play) || PLAYS[0];

  return (
    <OperatorShell active="featured">
      <div>
        <h1 className="mg-display" style={{ fontSize: "clamp(24px,2.6vw,30px)" }}>Get featured</h1>
        <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "64ch" }}>The most powerful marketing is when <b style={{ color: "var(--fg)" }}>others</b> talk about you. Pick a goal, name your niche, and Genie finds real sites, the right contact, and a genuine pitch for each. You review and send from your own email. No fake accounts, no bought links.</p>
      </div>

      {/* play selector */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {PLAYS.map((p) => {
          const Ic = Icon[p.icon] || Icon.spark; const on = play === p.id;
          return (
            <button key={p.id} onClick={() => setPlay(p.id)} className="mg-focus text-left" style={{ padding: 14, borderRadius: 14, cursor: "pointer", background: on ? "var(--accent-quiet)" : "var(--surface)", border: `1px solid ${on ? "var(--accent)" : "var(--hair)"}`, transition: "all .15s" }}>
              <span className="flex items-center gap-2">
                <span className="mg-tile" style={{ width: 28, height: 28, background: on ? "var(--accent)" : "var(--surface-2)", color: on ? "var(--on-primary)" : "var(--fg-muted)" }}><Ic size={15} /></span>
                <span className="text-[13.5px] font-bold" style={{ color: on ? "var(--accent-ink)" : "var(--fg)" }}>{p.label}</span>
              </span>
              <span className="block mt-1.5 text-[11.5px] mg-muted leading-snug">{p.blurb}</span>
            </button>
          );
        })}
      </div>

      {/* search */}
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <input value={niche} onChange={(e) => setNiche(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()}
          placeholder="Your niche or topic, e.g. rugs, AR shopping tech, sustainable fashion" className="mg-field mg-focus" style={{ flex: 1, minWidth: 260, maxWidth: 520, fontSize: 14 }} />
        <button onClick={find} disabled={busy || !niche.trim()} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 13.5 }}>
          {busy ? "Finding sites…" : `Find sites →`}
        </button>
      </div>
      {err && <p className="mt-3 text-[13px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}

      {busy && (
        <Card className="mt-5 p-8 text-center">
          <span className="mg-live-dot mx-auto" style={{ display: "block", width: 8 }} />
          <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--fg)" }}>Genie is finding sites for “{current.label}” and reading each one…</p>
          <p className="mt-1 text-[12.5px] mg-muted">Finding real sites, crawling each for the right contact, and writing a tailored pitch. Up to a minute.</p>
        </Card>
      )}

      {rows !== null && !busy && rows.length === 0 && (
        <Card className="mt-5 p-8 text-center">
          <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{debug && debug.sites > 0 ? "Found sites, but couldn’t reach them." : "Couldn’t pull sites just now."}</p>
          <p className="mt-1.5 text-[13px] mg-muted max-w-md mx-auto">{debug && debug.sites > 0 ? "Their sites blocked the crawl. Try again, or a slightly different niche." : "Give it a few seconds and try again, or try a broader niche."}</p>
        </Card>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="mg-klabel">Genie found {rows.length} {rows.length === 1 ? "site" : "sites"} for “{current.label}”</p>
          {rows.map((p, i) => (
            <Card key={i} className="p-5 mg-lift">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>{p.company} <a href={p.url} target="_blank" rel="noreferrer" className="text-[12px] font-medium" style={{ color: "var(--accent-ink)" }}>{p.domain} ↗</a></p>
                  {p.summary && <p className="mt-0.5 text-[12.5px] mg-muted">{p.summary}</p>}
                </div>
                {p.state === "sent" ? <Pill tone="live"><Icon.check size={12} /> Sent</Pill> : p.contact?.email ? <Pill tone="dawn">{p.contact.emailType === "named" ? "Direct contact" : "Editor inbox"}</Pill> : <Pill tone="info">Contact form</Pill>}
              </div>

              <div className="mt-3 flex items-center gap-2.5 flex-wrap text-[13px]">
                <span className="mg-tile" style={{ width: 30, height: 30, background: "var(--accent-quiet)", color: "var(--accent-ink)", fontWeight: 700, fontSize: 12 }}>{(p.contact?.name || p.company || "?").charAt(0).toUpperCase()}</span>
                <span className="font-semibold" style={{ color: "var(--fg)" }}>{p.contact?.name || "Best contact"}</span>
                {p.contact?.title && <Pill tone="neutral">{p.contact.title}</Pill>}
                <span className="mg-num" style={{ color: "var(--fg-muted)" }}>{p.contact?.email || (p.contact?.contactForm ? "via contact form" : "no email found")}</span>
              </div>
              {p.whyFit && <p className="mt-2 text-[12.5px]" style={{ color: "var(--fg-muted)" }}><span className="font-semibold" style={{ color: "var(--fg)" }}>Why them:</span> {p.whyFit}</p>}

              <div className="mt-3.5 rounded-xl p-3.5" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
                <p className="text-[11px] font-bold tracking-[0.08em] mg-subtle mb-2">THE PITCH · edit before you send</p>
                <input value={p.subject} onChange={(e) => patch(i, { subject: e.target.value })} disabled={p.state === "sent"} className="mg-field mg-focus" style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }} />
                <textarea value={p.body} onChange={(e) => patch(i, { body: e.target.value })} disabled={p.state === "sent"} className="mg-field mg-focus" style={{ fontSize: 13.5, lineHeight: 1.6, minHeight: 120 }} />
              </div>

              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <button onClick={() => send(i)} disabled={p.state === "sending" || p.state === "sent"} className="mg-btn mg-btn--dawn disabled:opacity-60" style={{ fontSize: 13 }}>
                  {p.state === "sent" ? "Sent ✓" : p.state === "sending" ? "Sending…" : p.contact?.email ? "Send →" : "Copy & open form →"}
                </button>
                <span className="text-[11.5px] mg-subtle">{p.contact?.email ? "From your own email · counts toward today's cap" : "No email found — send via their form"}</span>
              </div>
            </Card>
          ))}
          <p className="text-[12px] mg-subtle" style={{ maxWidth: "72ch" }}>Genie only keeps real, reachable sites and never invents an address. This is genuine outreach — you're asking real editors/owners to consider you. Replies land in your Inbox. Sends are capped and paced to protect your email reputation.</p>
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
