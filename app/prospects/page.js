"use client";

// ── FIND CLIENTS — the outreach cockpit ──
// You name a target niche; Genie finds real companies, the decision-maker at each,
// their best deliverable contact, and a pitch tailored to that business. You review
// (and tweak) each one and press Send — it goes out from your own email, capped and
// compliant, and lands in the Genie Inbox as sent. No paid data, no blasted guesses.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";

const EXAMPLES = ["rug e-commerce brands", "boutique furniture stores", "independent jewelry makers", "home-decor Shopify stores"];

export default function ProspectsPage() {
  const [niche, setNiche] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState(null); // null = not run yet
  const [debug, setDebug] = useState(null);
  const [toast, setToast] = useState("");

  async function find() {
    const q = niche.trim();
    if (!q || busy) return;
    setBusy(true); setErr(""); setRows(null); setDebug(null);
    try {
      const j = await fetch("/api/prospects/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ niche: q }) }).then((r) => r.json());
      if (j?.ok) { setRows((j.prospects || []).map((p) => ({ ...p, subject: p.pitch?.subject || "", body: p.pitch?.body || "", state: "idle" }))); setDebug(j.debug || null); }
      else setErr(j?.error || "Couldn't run that search. Try again.");
    } catch { setErr("Something interrupted the search. Try again."); }
    setBusy(false);
  }

  function patch(i, next) { setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...next } : r))); }

  async function send(i) {
    const p = rows[i];
    if (p.state === "sending" || p.state === "sent") return;
    // No email → copy the pitch and open their contact form.
    if (!p.contact?.email) {
      try { await navigator.clipboard.writeText(`${p.subject}\n\n${p.body}`); } catch {}
      if (p.contact?.contactForm) window.open(p.contact.contactForm, "_blank");
      patch(i, { state: "sent" }); setToast("Pitch copied. Paste it into their contact form.");
      return;
    }
    patch(i, { state: "sending" });
    try {
      const j = await fetch("/api/prospects/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: p.contact.email, subject: p.subject, body: p.body, name: p.contact.name, company: p.company }) }).then((r) => r.json());
      if (j?.ok) { patch(i, { state: "sent" }); setToast(`Sent to ${p.contact.name || p.company}. Replies land in your inbox.`); }
      else { patch(i, { state: "idle" }); setToast(j?.error || "Couldn't send that one."); }
    } catch { patch(i, { state: "idle" }); setToast("Couldn't send that one. Try again."); }
  }

  return (
    <OperatorShell active="prospects">
      <div>
        <h1 className="mg-display" style={{ fontSize: "clamp(24px,2.6vw,30px)" }}>Find clients</h1>
        <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "62ch" }}>Name who you want to sell to. Genie finds real companies, the right person at each, their contact, and a pitch written for them. You review and send, from your own email, capped and compliant.</p>
      </div>

      {/* search */}
      <div className="mt-5 flex items-center gap-2 flex-wrap">
        <input value={niche} onChange={(e) => setNiche(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()}
          placeholder="Who should I target? e.g. rug e-commerce brands" className="mg-field mg-focus" style={{ flex: 1, minWidth: 260, maxWidth: 520, fontSize: 14 }} />
        <button onClick={find} disabled={busy || !niche.trim()} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 13.5 }}>
          {busy ? "Finding companies…" : "Find prospects →"}
        </button>
      </div>
      {rows === null && !busy && (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-[12.5px] mg-subtle">
          <span>Try:</span>
          {EXAMPLES.map((ex) => <button key={ex} onClick={() => setNiche(ex)} className="mg-pill mg-focus" style={{ cursor: "pointer" }}>{ex}</button>)}
        </div>
      )}
      {err && <p className="mt-3 text-[13px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}

      {busy && (
        <Card className="mt-5 p-8 text-center">
          <span className="mg-live-dot mx-auto" style={{ display: "block", width: 8 }} />
          <p className="mt-3 text-[14px] font-semibold" style={{ color: "var(--fg)" }}>Genie is finding companies and reading their sites…</p>
          <p className="mt-1 text-[12.5px] mg-muted">Searching, crawling each site for the decision-maker and contact, and writing a pitch for each. This takes up to a minute.</p>
        </Card>
      )}

      {rows !== null && !busy && rows.length === 0 && (
        <Card className="mt-5 p-8 text-center">
          <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{debug && debug.companies > 0 ? "Found companies, but couldn’t reach their sites." : "Couldn’t pull companies just now."}</p>
          <p className="mt-1.5 text-[13px] mg-muted max-w-md mx-auto">
            {debug && debug.companies > 0
              ? "Their sites blocked the crawl. Try again, or a slightly different niche."
              : "Genie’s search is momentarily busy (or rate-limited). Give it a few seconds and try again, or try a broader niche like “home decor brands”."}
          </p>
        </Card>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="mt-5 flex flex-col gap-4">
          <p className="mg-klabel">Genie found {rows.length} {rows.length === 1 ? "prospect" : "prospects"}</p>
          {rows.map((p, i) => (
            <Card key={i} className="p-5 mg-lift">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>{p.company} <a href={p.url} target="_blank" rel="noreferrer" className="text-[12px] font-medium" style={{ color: "var(--accent-ink)" }}>{p.domain} ↗</a></p>
                  {p.summary && <p className="mt-0.5 text-[12.5px] mg-muted">{p.summary}</p>}
                </div>
                {p.state === "sent" ? <Pill tone="live"><Icon.check size={12} /> Sent</Pill> : p.contact?.email ? <Pill tone="dawn">{p.contact.emailType === "named" ? "Direct contact" : "Role inbox"}</Pill> : <Pill tone="info">Contact form</Pill>}
              </div>

              {/* who + contact */}
              <div className="mt-3 flex items-center gap-2.5 flex-wrap text-[13px]">
                <span className="mg-tile" style={{ width: 30, height: 30, background: "var(--accent-quiet)", color: "var(--accent-ink)", fontWeight: 700, fontSize: 12 }}>{(p.contact?.name || p.company || "?").charAt(0).toUpperCase()}</span>
                <span className="font-semibold" style={{ color: "var(--fg)" }}>{p.contact?.name || "Best contact"}</span>
                {p.contact?.title && <Pill tone="neutral">{p.contact.title}</Pill>}
                <span className="mg-num" style={{ color: "var(--fg-muted)" }}>{p.contact?.email || (p.contact?.contactForm ? "via contact form" : "no email found")}</span>
              </div>
              {p.whyFit && <p className="mt-2 text-[12.5px]" style={{ color: "var(--fg-muted)" }}><span className="font-semibold" style={{ color: "var(--fg)" }}>Why them:</span> {p.whyFit}</p>}

              {/* the pitch (editable) */}
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
          <p className="text-[12px] mg-subtle" style={{ maxWidth: "70ch" }}>Genie only keeps companies with a real, deliverable contact, and never guesses an address. Coverage is honest: a direct decision-maker for some, a role inbox or contact form for others. Sends are capped and paced to protect your email reputation.</p>
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
