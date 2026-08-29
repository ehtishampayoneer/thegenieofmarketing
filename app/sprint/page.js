"use client";

// ── PROOF SPRINT ──
// The instrument that answers the only question that matters: does the machine make
// money? Commit to ONE customer type + ONE offer, run the fast-money engine for 30
// days, and watch the 7 numbers that prove (or disprove) traction — scoped to the
// sprint window so the evidence is honest. At day 30 it gives a plain verdict.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { LoadingState } from "@/components/ui/v2/DataState";

const FIELD = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--fg)" };

export default function SprintPage() {
  const [d, setD] = useState(null);
  const [state, setState] = useState("loading");

  async function load() {
    try { const j = await fetch("/api/sprint", { cache: "no-store" }).then((r) => r.json()); setD(j?.ok ? j : { active: false }); setState("ready"); }
    catch { setD({ active: false }); setState("ready"); }
  }
  useEffect(() => { load(); }, []);

  return (
    <OperatorShell active="sprint">
      <OperatorHeader icon={Icon.flag} label="Proof Sprint" title="Prove the machine" accent="makes money." />
      {state === "loading" ? <div className="mt-6"><LoadingState /></div>
        : d?.active ? <Dashboard d={d} onChange={load} />
        : <Setup onStart={load} />}
    </OperatorShell>
  );
}

function Setup({ onStart }) {
  const [f, setF] = useState({ icp: "", offer: "", price: "", goalSales: 3, goalConvos: 10 });
  const [busy, setBusy] = useState(false);
  const upd = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function start() {
    if (!f.icp.trim() || !f.offer.trim()) return;
    setBusy(true);
    try { await fetch("/api/sprint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }); await onStart(); } catch {}
    setBusy(false);
  }
  const canStart = f.icp.trim() && f.offer.trim();
  const STEPS = [
    { t: "Commit", d: "Pick one customer type and one offer — the sharper, the cleaner the read." },
    { t: "Run the engine", d: "Work Buyer Hunt, Find clients, Recovery and the outreach Genie drafts, hard." },
    { t: "Watch the 7 numbers", d: "This page keeps honest score — scoped to your 30-day window only." },
    { t: "Get the verdict", d: "On day 30 you get a plain call: scale it, change one thing, or rethink." },
  ];
  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      {/* the commitment form */}
      <Card className="p-6 lg:p-7">
        <p className="mg-eyebrow"><Icon.flag size={14} /> 30-day test</p>
        <h2 className="mt-2 text-[22px] font-bold leading-tight" style={{ color: "var(--fg)" }}>Commit to one customer, one offer.</h2>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--fg-muted)", maxWidth: "60ch" }}>
          Find out if Genie actually makes you money — not "someday", but in 30 days. Pick the <b style={{ color: "var(--fg)" }}>one</b> customer type most likely to buy and the <b style={{ color: "var(--fg)" }}>one</b> offer you'll pitch, then run the fast-money engine and let this page keep score.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          <L label="Your ONE customer type (ICP)" hint="a niche + a size/place, not 'everyone'">
            <textarea value={f.icp} onChange={upd("icp")} rows={2} placeholder="e.g. Shopify skincare brands doing $10–50k/month; or dental clinics in Austin" className="mg-field mg-focus resize-none" />
          </L>
          <L label="Your ONE offer" hint="the single thing you're selling, and why they'd say yes now">
            <textarea value={f.offer} onChange={upd("offer")} rows={2} placeholder="e.g. A done-for-you 5-page SEO cluster + 30 days of outreach, $900 flat" className="mg-field mg-focus resize-none" />
          </L>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <L label="Price (optional)"><input value={f.price} onChange={upd("price")} placeholder="$900" className="mg-field mg-focus" /></L>
            <L label="Goal: sales by day 30"><input type="number" min="1" value={f.goalSales} onChange={upd("goalSales")} className="mg-field mg-focus" /></L>
            <L label="Goal: conversations"><input type="number" min="1" value={f.goalConvos} onChange={upd("goalConvos")} className="mg-field mg-focus" /></L>
          </div>
        </div>
        <button onClick={start} disabled={busy || !canStart} className="mt-6 mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 14 }}>{busy ? "Starting…" : "Start my 30-day sprint →"}</button>
      </Card>

      {/* explainer sidebar — fills the space with the "how + why" */}
      <div className="flex flex-col gap-4">
        <Card className="p-6">
          <p className="mg-klabel mb-4">How the sprint works</p>
          <ol className="flex flex-col" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3" style={{ paddingBottom: i < STEPS.length - 1 ? 16 : 0 }}>
                <div className="flex flex-col items-center">
                  <span className="mg-num flex items-center justify-center shrink-0" style={{ width: 26, height: 26, borderRadius: 999, background: "var(--accent)", color: "var(--on-accent)", fontSize: 12.5, fontWeight: 700 }}>{i + 1}</span>
                  {i < STEPS.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 14, background: "var(--hair)", marginTop: 4 }} />}
                </div>
                <div style={{ paddingTop: 2 }}>
                  <p className="text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>{s.t}</p>
                  <p className="text-[12.5px] mt-0.5 leading-snug" style={{ color: "var(--fg-muted)" }}>{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-6">
          <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--accent-ink)" }}><Icon.spark size={15} /> Why one, not many</p>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>Specific beats broad every time. One sharp target and one clear offer give you a clean read on whether the machine makes money — with no confounding variables muddying the result.</p>
        </Card>
      </div>
    </div>
  );
}

function Dashboard({ d, onChange }) {
  const { config: c, metrics: m, dayNum, daysLeft, length } = d;
  const [saving, setSaving] = useState(false);
  const pct = Math.round((dayNum / length) * 100);

  async function bumpManual(k, delta) {
    const manual = { ...c.manual, [k]: Math.max(0, (c.manual?.[k] || 0) + delta) };
    setSaving(true);
    try { await fetch("/api/sprint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...c, manual }) }); await onChange(); } catch {}
    setSaving(false);
  }
  async function endSprint() {
    if (!window.confirm("End this sprint? You can start a fresh one after.")) return;
    try { await fetch("/api/sprint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end" }) }); await onChange(); } catch {}
  }

  const convos = (m.replied || 0) + (c.manual?.meetings || 0);
  const done = daysLeft === 0;
  const v = verdict({ done, m, c, convos, dayNum, length });

  return (
    <div className="mt-6 flex flex-col gap-5">
      {/* header strip */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="mg-eyebrow"><Icon.flag size={13} /> Day {dayNum} of {length} · {daysLeft} left</p>
            <p className="mt-1 text-[13.5px]" style={{ color: "var(--fg)" }}><b>Target:</b> {c.icp || "—"}</p>
            <p className="text-[13.5px] mg-muted"><b style={{ color: "var(--fg)" }}>Offer:</b> {c.offer || "—"}{c.price ? ` · ${c.price}` : ""}</p>
          </div>
          <button onClick={endSprint} className="mg-btn mg-btn--ghost shrink-0" style={{ fontSize: 12 }}>End sprint</button>
        </div>
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
          <div className="h-full rounded-full dawn-fill" style={{ width: `${pct}%`, transition: "width .5s" }} />
        </div>
      </Card>

      {/* verdict */}
      <Card className="p-5" style={{ borderColor: v.color, borderWidth: 1.5 }}>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: v.color }}>{done ? "Verdict" : "Pace check"}</p>
        <p className="mt-1 text-[16.5px] font-bold" style={{ color: "var(--fg)" }}>{v.title}</p>
        <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "68ch" }}>{v.text}</p>
      </Card>

      {/* the 7 numbers */}
      <div>
        <p className="mg-klabel mb-2">THE 7 NUMBERS · since you started</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Prospects contacted" value={m.reached} auto />
          <Stat label="Replies" value={m.replied} auto sub={`${m.reached ? Math.round((m.replied / m.reached) * 100) : 0}% reply rate`} />
          <Stat label="Meetings booked" value={c.manual?.meetings || 0} onMinus={() => bumpManual("meetings", -1)} onPlus={() => bumpManual("meetings", 1)} busy={saving} />
          <Stat label="Proposals sent" value={c.manual?.proposals || 0} onMinus={() => bumpManual("proposals", -1)} onPlus={() => bumpManual("proposals", 1)} busy={saving} />
          <Stat label="Closed revenue" value={`$${(m.revenue || 0).toLocaleString()}`} accent auto sub={`${m.won || 0} won`} />
          <Stat label="Revenue / 100 contacts" value={`$${(m.revPer100 || 0).toLocaleString()}`} auto />
          <Stat label="Leads captured" value={m.leads || 0} auto />
          <Stat label="Clicks to your site" value={m.clicks || 0} auto />
        </div>
      </div>

      {/* goals */}
      <Card className="p-5">
        <p className="mg-klabel mb-3">GOAL PROGRESS</p>
        <Bar label="Sales" now={m.won || 0} goal={c.goalSales || 1} unit="sale" />
        <div className="h-3" />
        <Bar label="Real conversations" now={convos} goal={c.goalConvos || 1} unit="conversation" />
      </Card>

      <p className="text-[11.5px] mg-subtle">
        Auto numbers come from real outreach + events since your start date. Meetings and proposals are yours to log (Genie can't see your calls). Update them as they happen so the verdict stays honest.
      </p>
    </div>
  );
}

function verdict({ done, m, c, convos, dayNum, length }) {
  const RED = "var(--signal-danger)", YEL = "var(--signal-warn)", GRN = "var(--signal-live-ink)";
  const salesHit = (m.won || 0) >= (c.goalSales || 1);
  if (done) {
    if (salesHit) return { color: GRN, title: "It works — now scale it.", text: "You hit your sales goal with real, attributable revenue. Do more of exactly this: same customer, same offer, more volume. This is your proof." };
    if (convos >= (c.goalConvos || 1) || (m.revenue || 0) > 0) return { color: YEL, title: "Promising — change ONE thing.", text: "You created real conversations but fell short on closes. Change a single variable (the offer, the target, or the message) and run another two weeks. You're close." };
    return { color: RED, title: "The gap isn't a missing feature.", text: "Low traction almost always means positioning, list quality, or offer strength — not function #38. Sharpen the ICP and make the offer more compelling, then re-run. Don't add features yet." };
  }
  const paceSales = (c.goalSales || 1) * (dayNum / length);
  const paceConvos = (c.goalConvos || 1) * (dayNum / length);
  if ((m.won || 0) >= paceSales) return { color: GRN, title: "On track.", text: `Day ${dayNum} of ${length}. You're pacing to hit your goal — keep the volume steady and keep logging your meetings.` };
  if (convos >= paceConvos) return { color: YEL, title: "Conversations flowing, closes lagging.", text: `Day ${dayNum} of ${length}. You're reaching people. Focus on converting replies into meetings and proposals.` };
  return { color: YEL, title: "Behind pace — push volume.", text: `Day ${dayNum} of ${length}. The fast-money engine needs volume. Run Buyer Hunt, Find clients and Recovery harder, and send the outreach Genie drafts.` };
}

function Stat({ label, value, sub, accent, auto, onMinus, onPlus, busy }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11.5px] mg-muted leading-tight">{label}</p>
        {auto ? <span title="Measured automatically" className="mg-subtle" style={{ fontSize: 9.5 }}>AUTO</span> : null}
      </div>
      <p className="mt-1.5 mg-num text-[24px] font-bold leading-none" style={{ color: accent ? "var(--accent-ink)" : "var(--fg)" }}>{value}</p>
      {sub && <p className="mt-1 text-[11px] mg-subtle">{sub}</p>}
      {onPlus && (
        <div className="mt-2 flex items-center gap-1.5">
          <button onClick={onMinus} disabled={busy} className="mg-btn mg-btn--quiet disabled:opacity-40" style={{ fontSize: 13, padding: "0 .55rem", lineHeight: 1.6 }}>−</button>
          <button onClick={onPlus} disabled={busy} className="mg-btn mg-btn--quiet disabled:opacity-40" style={{ fontSize: 13, padding: "0 .55rem", lineHeight: 1.6 }}>+</button>
        </div>
      )}
    </Card>
  );
}

function Bar({ label, now, goal, unit }) {
  const pct = Math.min(100, Math.round((now / Math.max(1, goal)) * 100));
  const hit = now >= goal;
  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px] mb-1.5">
        <span style={{ color: "var(--fg)" }}>{label}</span>
        <span className="mg-num" style={{ color: hit ? "var(--signal-live-ink)" : "var(--fg-muted)" }}><b>{now}</b> / {goal} {unit}{goal !== 1 ? "s" : ""}{hit ? " ✓" : ""}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hit ? "var(--signal-live)" : "linear-gradient(90deg,var(--accent),var(--signal-live))", transition: "width .5s" }} />
      </div>
    </div>
  );
}

function L({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold" style={{ color: "var(--fg)" }}>{label}{hint && <span className="ml-1.5 font-normal mg-subtle">— {hint}</span>}</span>
      {children}
    </label>
  );
}
