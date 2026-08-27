"use client";

// ── DEAL PIPELINE ──
// One board for every channel: everyone Genie reached → who opened → who replied
// (each reply classified) → who you closed, with the money. This is where hunts turn
// into revenue and you see, finally, $ earned — not traffic. Reads /api/pipeline.

import { useState, useEffect, useCallback, useMemo } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";

const money = (n) => { n = Number(n) || 0; return n >= 1000 ? "$" + (n / 1000).toFixed(n % 1000 ? 1 : 0) + "k" : "$" + Math.round(n); };
const CLASS = {
  interested: { label: "Interested", tone: "live", pri: 0 },
  question: { label: "Has a question", tone: "info", pri: 1 },
  objection: { label: "Objection", tone: "dawn", pri: 2 },
  not_now: { label: "Not now", tone: "neutral", pri: 4 },
  wrong_person: { label: "Wrong person", tone: "neutral", pri: 5 },
  unsubscribe: { label: "Opted out", tone: "danger", pri: 6 },
  auto: { label: "Auto-reply", tone: "neutral", pri: 7 },
};

export default function PipelinePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const j = await fetch("/api/pipeline", { cache: "no-store" }).then((r) => r.json()); setData(j?.ok ? j : { contacts: [], funnel: {}, recovered: 0 }); }
    catch { setData({ contacts: [], funnel: {}, recovered: 0 }); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function mark(c, act) {
    let value = c.value;
    if (act === "won" && !Number(value)) { const v = window.prompt("What's this deal worth? (number)", ""); if (v == null) return; value = v; }
    try { await fetch("/api/pipeline/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: c.email, act, value }) }); } catch {}
    setToast(act === "won" ? `Nice — logged ${money(value)} recovered.` : "Marked.");
    load();
  }

  const contacts = data?.contacts || [];
  const funnel = data?.funnel || {};
  const attention = useMemo(() => contacts
    .filter((c) => c.replied && !c.outcome)
    .sort((a, b) => (CLASS[a.replyClass]?.pri ?? 3) - (CLASS[b.replyClass]?.pri ?? 3)), [contacts]);
  const won = contacts.filter((c) => c.outcome === "won");

  return (
    <OperatorShell active="pipeline">
      <div>
        <p className="mg-eyebrow"><Icon.growth size={14} /> Deal Pipeline</p>
        <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(29px,3.2vw,40px)" }}>From reached to <span className="dawn-text">revenue.</span></h1>
        <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "62ch" }}>Everyone Genie reached across every channel, who replied (each reply read and sorted for you), and the deals you closed. The one place that shows real money earned.</p>
      </div>

      {/* funnel */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
        <FunnelStat label="Reached" value={funnel.reached ?? "—"} tint="muted" />
        <FunnelStat label="Opened" value={funnel.opened ?? "—"} tint="info" />
        <FunnelStat label="Replied" value={funnel.replied ?? "—"} tint="dawn" />
        <FunnelStat label="Won" value={funnel.won ?? "—"} tint="live" />
        <FunnelStat label="Revenue" value={money(data?.recovered || 0)} tint="live" big />
      </div>

      {loading ? (
        <div className="mt-6 mg-surface p-8 text-center text-[13px] mg-subtle">Loading your pipeline…</div>
      ) : contacts.length === 0 ? (
        <Card className="mt-6 p-10 text-center mg-ambient">
          <span className="mg-tile mx-auto" style={{ width: 46, height: 46, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.growth size={22} /></span>
          <p className="mt-4 text-[16px] font-bold" style={{ color: "var(--fg)" }}>No outreach yet</p>
          <p className="mt-1.5 text-[13.5px] mg-muted max-w-md mx-auto">Send from <b>Find clients</b>, <b>Revenue Recovery</b> or <b>Get featured</b> and everyone you reach shows up here — with their replies read and sorted, ready to close.</p>
          <a href="/prospects" className="mg-btn mg-btn--dawn mt-5 inline-flex" style={{ fontSize: 13.5 }}>Find clients →</a>
        </Card>
      ) : (
        <>
          {/* needs attention */}
          <section className="mt-7">
            <p className="mg-klabel">NEEDS YOU · {attention.length} repl{attention.length === 1 ? "y" : "ies"} to act on</p>
            {attention.length === 0 ? (
              <p className="mt-2 text-[13px] mg-subtle">No open replies right now. Send more, or check back after your next batch.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2.5">
                {attention.map((c) => {
                  const cl = CLASS[c.replyClass] || null;
                  return (
                    <Card key={c.email} className="p-4 mg-lift" style={{ borderLeft: `3px solid ${cl?.tone === "live" ? "var(--signal-live)" : cl?.tone === "danger" ? "var(--signal-danger)" : "var(--accent)"}` }}>
                      <div className="flex items-start gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{c.name || c.email}</span>
                            {cl && <Pill tone={cl.tone}>{cl.label}</Pill>}
                            <span className="text-[11.5px] mg-subtle mg-num">{c.email}</span>
                          </div>
                          {c.replySnippet && <p className="mt-1.5 text-[13px] rounded-lg p-2.5" style={{ background: "var(--signal-live-soft)", border: "1px solid var(--hair)", color: "var(--fg)" }}><span className="font-semibold" style={{ color: "var(--signal-live-ink)" }}>They replied:</span> “{c.replySnippet}”</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => mark(c, "won")} className="mg-btn mg-btn--dawn" style={{ fontSize: 12.5 }}>Won 💰</button>
                          <button onClick={() => mark(c, "lost")} className="mg-btn mg-btn--quiet" style={{ fontSize: 12 }}>Lost</button>
                          <a href="/inbox" className="mg-btn mg-btn--quiet" style={{ fontSize: 12 }}>Reply</a>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* won */}
          {won.length > 0 && (
            <section className="mt-7">
              <p className="mg-klabel">CLOSED · {won.length} won · {money(data?.recovered || 0)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {won.map((c) => (
                  <span key={c.email} className="inline-flex items-center gap-2 text-[12.5px] font-semibold px-3 py-1.5 rounded-full" style={{ background: "var(--signal-live-soft)", color: "var(--signal-live-ink)" }}>
                    <Icon.check size={13} /> {c.name || c.email}{Number(c.value) ? ` · ${money(c.value)}` : ""}
                    <button onClick={() => mark(c, "reopen")} title="Reopen" className="mg-focus" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: .6, fontSize: 11 }}>↺</button>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* everyone reached */}
          <section className="mt-7">
            <p className="mg-klabel">EVERYONE REACHED · {contacts.length}</p>
            <Card className="mt-3 p-0 overflow-hidden">
              <div className="overflow-x-auto thin-scroll">
                <table className="w-full" style={{ minWidth: 520, borderCollapse: "collapse" }}>
                  <thead><tr style={{ borderBottom: "1px solid var(--hair)" }}>{["Contact", "Stage", "When", ""].map((h, i) => <th key={i} className="text-left px-4 py-2.5 text-[11px] font-semibold mg-subtle" style={{ whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {contacts.slice(0, 100).map((c) => (
                      <tr key={c.email} style={{ borderBottom: "1px solid var(--hair)" }}>
                        <td className="px-4 py-2.5"><div className="text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{c.name || c.email}</div><div className="text-[11px] mg-subtle mg-num">{c.email}</div></td>
                        <td className="px-4 py-2.5">{c.outcome === "won" ? <Pill tone="live">Won</Pill> : c.outcome === "lost" ? <Pill tone="danger">Lost</Pill> : c.replied ? <Pill tone="live">Replied</Pill> : c.status === "opened" ? <Pill tone="info">Opened</Pill> : <Pill tone="neutral">Sent</Pill>}</td>
                        <td className="px-4 py-2.5 text-[12px] mg-subtle mg-num" style={{ whiteSpace: "nowrap" }}>{fmt(c.repliedAt || c.sentAt)}</td>
                        <td className="px-3 py-2.5 text-right">{c.replied && !c.outcome ? <button onClick={() => mark(c, "won")} className="mg-btn mg-btn--dawn" style={{ fontSize: 11.5 }}>Won</button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        </>
      )}

      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
    </OperatorShell>
  );
}

function FunnelStat({ label, value, tint, big }) {
  const col = tint === "live" ? "var(--signal-live-ink)" : tint === "info" ? "var(--signal-info)" : tint === "dawn" ? "var(--accent-ink)" : "var(--fg)";
  return (
    <Card className="p-4">
      <div className="mg-num" style={{ fontSize: big ? 26 : 24, fontWeight: 800, lineHeight: 1, color: col }}>{value}</div>
      <div className="text-[11.5px] mg-subtle mt-1">{label}</div>
    </Card>
  );
}
function fmt(d) { try { return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } }
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 4000); return () => clearTimeout(t); }, [msg, onDone]);
  return (<div className="fixed left-1/2 z-50" style={{ bottom: 24, transform: "translateX(-50%)" }}><div className="mg-surface px-4 py-2.5 text-[13px] mg-rise" style={{ boxShadow: "var(--shadow-3)", color: "var(--fg)", borderColor: "var(--border-strong)" }}>{msg}</div></div>);
}
