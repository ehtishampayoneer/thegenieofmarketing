"use client";

// ── REVENUE RECOVERY ──
// The fast-money layer: upload your old leads/customers, Genie classifies each and
// writes a specific win-back email, you review + send from your Gmail, replies land in
// your Inbox, and this board tracks recovered revenue. Warm contacts convert in days —
// the "money now" companion to Genie's slower organic engine.

import { useState, useEffect, useCallback, useMemo } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";

const SEG = {
  abandoned: { label: "Abandoned", tone: "dawn" }, proposal: { label: "Proposal sent", tone: "info" },
  past_customer: { label: "Past customer", tone: "live" }, quiet_lead: { label: "Went quiet", tone: "neutral" }, upsell: { label: "Upsell", tone: "dawn" },
};
const money = (n) => { n = Number(n) || 0; return n >= 1000 ? "$" + (n / 1000).toFixed(n % 1000 ? 1 : 0) + "k" : "$" + Math.round(n); };
const stageOf = (c) => c.outcome === "won" ? "won" : c.outcome === "lost" ? "lost" : c.replied ? "replied" : c.sent ? "sent" : "tosend";

function parseCsv(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const line = (s) => { const o = []; let c = "", q = false; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (q) { if (ch === '"') { if (s[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else { if (ch === '"') q = true; else if (ch === ",") { o.push(c); c = ""; } else c += ch; } } o.push(c); return o; };
  const headers = line(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => { const cells = line(l); const row = {}; headers.forEach((h, j) => (row[h] = (cells[j] || "").trim())); return row; });
}

export default function RecoverPage() {
  const [contacts, setContacts] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [offer, setOffer] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const j = await fetch("/api/recover/list", { cache: "no-store" }).then((r) => r.json()); if (j?.ok) { setContacts(j.contacts || []); setSummary(j.summary || null); } else setContacts([]); }
    catch { setContacts([]); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function onFile(file) {
    if (!file || importing) return;
    setImporting(true); setMsg("Reading your file and writing win-back emails… up to a minute.");
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (!rows.length) { setMsg("That file looks empty. Export a CSV with at least a name + email column."); setImporting(false); return; }
      const j = await fetch("/api/recover/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contacts: rows, offer }) }).then((r) => r.json());
      if (j?.ok) { setMsg(`Imported ${j.imported} contacts${j.skipped ? ` (${j.skipped} skipped — no valid email)` : ""}. Genie drafted a win-back for each.`); setShowImport(false); await load(); }
      else setMsg(j?.error || "Couldn't import that file.");
    } catch { setMsg("Couldn't read that file. Make sure it's a .csv export."); }
    setImporting(false);
  }

  function patch(id, next) { setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, ...next } : c))); }

  async function send(c) {
    if (c._sending) return;
    patch(c.id, { _sending: true });
    try {
      const j = await fetch("/api/prospects/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: c.email, subject: c.subject, body: c.body, name: c.name, company: c.company }) }).then((r) => r.json());
      if (j?.ok) { await fetch("/api/recover/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, act: "sent" }) }); patch(c.id, { sent: true, _sending: false }); setToast(`Win-back sent to ${c.name || c.email}. Replies land in your Inbox.`); }
      else { patch(c.id, { _sending: false }); setToast(j?.error || "Couldn't send that one."); }
    } catch { patch(c.id, { _sending: false }); setToast("Couldn't send that one."); }
  }
  async function mark(c, act) {
    let dealValue = c.dealValue;
    if (act === "won" && !Number(dealValue)) { const v = window.prompt("What's this deal worth? (just the number)", ""); if (v == null) return; dealValue = v; }
    patch(c.id, { outcome: act === "reopen" ? null : act, dealValue });
    try { await fetch("/api/recover/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, act, dealValue }) }); } catch {}
    load();
  }

  const view = useMemo(() => {
    const list = contacts || [];
    if (filter === "all") return list;
    return list.filter((c) => stageOf(c) === filter);
  }, [contacts, filter]);

  const empty = !loading && contacts && contacts.length === 0;

  return (
    <OperatorShell active="recover">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="mg-eyebrow"><Icon.bolt size={14} /> Revenue Recovery</p>
          <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(29px,3.2vw,40px)" }}>The money you already <span className="dawn-text">paid to earn.</span></h1>
          <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "var(--measure)" }}>Upload your old leads, quotes and past customers. Genie sorts them by how likely they are to buy now, writes a specific win-back for each, and you send from your own email. Warm contacts convert in days — replies land in your Inbox and the money shows up here.</p>
        </div>
        {contacts && contacts.length > 0 && <button onClick={() => setShowImport((v) => !v)} className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}><Icon.plus size={14} /> Import more</button>}
      </div>
      {msg && <p className="mt-2 text-[13px]" style={{ color: "var(--accent-ink)" }}>{msg}</p>}

      {/* pipeline strip */}
      {summary && summary.total > 0 && (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Pipeline value" value={money(summary.pipeline)} tint="dawn" big />
          <Stat label="To send" value={summary.toSend} tint="muted" />
          <Stat label="Sent" value={summary.sent} tint="info" />
          <Stat label="Replied" value={summary.replied} tint="live" />
          <Stat label="Recovered" value={money(summary.recovered)} tint="live" big />
        </div>
      )}

      {/* import panel */}
      {(empty || showImport || (!loading && (!contacts || contacts.length === 0))) && (
        <Card className="mt-5 p-6 mg-ambient">
          <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>Upload your old leads & customers</p>
          <p className="mt-1 text-[13px] mg-muted max-w-xl">A CSV with at least <b>name</b> and <b>email</b> columns. Extra columns help: <span className="mg-num">company, value, last contact, notes/status</span>. Nothing sends automatically — you review every message first.</p>
          <div className="mt-3">
            <label className="text-[12px] font-semibold mg-subtle">Your offer (optional, but makes it convert)</label>
            <textarea value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. 20% off if you come back this week · free setup · a bonus month" className="mg-field mg-focus mt-1" style={{ width: "100%", minHeight: 56, fontSize: 13 }} />
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <label className="mg-btn mg-btn--dawn" style={{ fontSize: 13, cursor: "pointer" }}>
              <Icon.plus size={14} /> {importing ? "Working…" : "Upload CSV & draft win-backs"}
              <input type="file" accept=".csv,text/csv" disabled={importing} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onFile(f); }} />
            </label>
            <span className="text-[12px] mg-subtle">Up to 45 per import · re-import for more.</span>
          </div>
        </Card>
      )}

      {/* filters */}
      {contacts && contacts.length > 0 && (
        <div className="mt-5 flex items-center gap-2 flex-wrap">
          {[["all", "All"], ["tosend", "To send"], ["sent", "Sent"], ["replied", "Replied"], ["won", "Won"]].map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)} className="mg-focus" style={{ fontSize: 13, fontWeight: 600, padding: ".4rem .8rem", borderRadius: 999, cursor: "pointer", border: `1px solid ${filter === id ? "var(--accent)" : "var(--hair)"}`, background: filter === id ? "var(--accent-quiet)" : "var(--surface)", color: filter === id ? "var(--accent-ink)" : "var(--fg-muted)" }}>{label}</button>
          ))}
        </div>
      )}

      {/* list */}
      {loading ? (
        <div className="mt-6 mg-surface p-8 text-center text-[13px] mg-subtle">Loading your pipeline…</div>
      ) : contacts && contacts.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2.5">
          {view.map((c) => <ContactRow key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} onEdit={(f) => patch(c.id, f)} onSend={() => send(c)} onMark={(a) => mark(c, a)} />)}
          {view.length === 0 && <p className="text-[13px] mg-subtle text-center py-6">Nothing in this stage.</p>}
        </div>
      ) : null}

      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
    </OperatorShell>
  );
}

function ContactRow({ c, open, onToggle, onEdit, onSend, onMark }) {
  const seg = SEG[c.segment] || SEG.quiet_lead;
  const st = stageOf(c);
  const stagePill = st === "won" ? <Pill tone="live"><Icon.check size={12} /> Won</Pill> : st === "lost" ? <Pill tone="danger">Lost</Pill> : st === "replied" ? <Pill tone="live">Replied</Pill> : st === "sent" ? <Pill tone="info">Sent</Pill> : <Pill tone="neutral">To send</Pill>;
  return (
    <Card className="p-4 mg-lift" style={c.outcome ? { opacity: 0.85 } : undefined}>
      <div className="flex items-start gap-3">
        <span className="mg-tile shrink-0" style={{ width: 34, height: 34, background: "var(--accent-quiet)", color: "var(--accent-ink)", fontWeight: 700, fontSize: 13 }}>{(c.name || c.email || "?").charAt(0).toUpperCase()}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{c.name || c.email}</span>
            <Pill tone={seg.tone}>{seg.label}</Pill>
            {Number(c.dealValue) > 0 && <span className="text-[12px] font-bold mg-num" style={{ color: "var(--signal-live-ink)" }}>{money(c.dealValue)}</span>}
            <span className="ml-auto">{stagePill}</span>
          </div>
          <p className="mt-0.5 text-[12px] mg-subtle mg-num truncate">{c.email}{c.company ? ` · ${c.company}` : ""}</p>
          <div className="mt-2 flex items-center gap-2.5 flex-wrap">
            {!c.sent && !c.outcome && <button onClick={onSend} disabled={c._sending} className="mg-btn mg-btn--dawn disabled:opacity-60" style={{ fontSize: 13 }}>{c._sending ? "Sending…" : "Send win-back →"}</button>}
            {c.replied && !c.outcome && <><button onClick={() => onMark("won")} className="mg-btn mg-btn--dawn" style={{ fontSize: 13 }}>Mark won 💰</button><button onClick={() => onMark("lost")} className="mg-btn mg-btn--quiet" style={{ fontSize: 12 }}>Lost</button></>}
            {c.outcome && <button onClick={() => onMark("reopen")} className="mg-btn mg-btn--quiet" style={{ fontSize: 12 }}>Reopen</button>}
            <button onClick={onToggle} className="mg-btn mg-btn--quiet" style={{ fontSize: 12 }}>{open ? "Hide email" : "See email"}</button>
          </div>
        </div>
      </div>
      {open && (
        <div className="mt-3 rounded-xl p-3.5" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
          <input value={c.subject || ""} onChange={(e) => onEdit({ subject: e.target.value })} disabled={c.sent} className="mg-field mg-focus" style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }} />
          <textarea value={c.body || ""} onChange={(e) => onEdit({ body: e.target.value })} disabled={c.sent} className="mg-field mg-focus" style={{ fontSize: 14, lineHeight: 1.6, minHeight: 130 }} />
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, tint, big }) {
  const col = tint === "live" ? "var(--signal-live-ink)" : tint === "info" ? "var(--signal-info)" : tint === "dawn" ? "var(--accent-ink)" : "var(--fg)";
  return (
    <Card className="p-4">
      <div className="mg-num" style={{ fontSize: big ? 26 : 24, fontWeight: 700, lineHeight: 1, color: col }}>{value}</div>
      <div className="text-[12px] mg-subtle mt-1">{label}</div>
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
