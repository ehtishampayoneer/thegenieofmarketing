"use client";

// ── TALK TO GENIE (slide-in panel) ──
// A side panel inside the app where you talk to your employee like a person.
// Genie replies as an expert partner grounded in your real business (/api/genie/chat).
// Opens from the command bar; closes on Esc or the backdrop.

import { useState, useRef, useEffect } from "react";
import { GenieMark } from "@/components/brand/GenieMark";
import { downloadWord, printPdf } from "@/lib/plan-export";

const STARTERS = [
  "Why did you pick these keywords?",
  "Write more casually, no hype.",
  "What’s my single biggest opportunity right now?",
];

// One-tap campaign playbooks. Genie builds a real, dated plan for the business.
const PLAYBOOKS = [
  { kind: "meta_ads", label: "Build my Meta ads", hint: "Facebook + Instagram" },
  { kind: "google_ads", label: "Plan my Google Ads", hint: "Search campaign" },
  { kind: "social_content", label: "Social content plan", hint: "2 weeks of posts" },
  { kind: "seo_content", label: "Blog / SEO plan", hint: "Rank for buyers" },
  { kind: "launch", label: "Launch a product / offer", hint: "Multi-channel" },
];

export default function GenieChat({ open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [building, setBuilding] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, sending]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next); setInput(""); setSending(true);
    try {
      const r = await fetch("/api/genie/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next }) }).then((x) => x.json());
      setMessages((m) => [...m, { role: "genie", content: r.reply || "I couldn’t reply just now, try again in a moment.", saved: !!r.savedDirective }]);
    } catch {
      setMessages((m) => [...m, { role: "genie", content: "I couldn’t reach my brain just now. Try again in a moment." }]);
    }
    setSending(false);
  }

  async function requestPlan(pb) {
    if (sending) return;
    const next = [...messages, { role: "user", content: `${pb.label} — build me a plan.` }];
    setMessages(next); setSending(true); setBuilding(true);
    try {
      const r = await fetch("/api/genie/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: pb.kind }) }).then((x) => x.json());
      if (r.ok && r.plan) setMessages((m) => [...m, { role: "plan", plan: r.plan }]);
      else setMessages((m) => [...m, { role: "genie", content: r.error || "I couldn’t build that plan just now. Try again in a moment." }]);
    } catch {
      setMessages((m) => [...m, { role: "genie", content: "I couldn’t build that plan just now. Try again in a moment." }]);
    }
    setSending(false); setBuilding(false);
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(3,6,12,.5)", backdropFilter: "blur(2px)" }} />
      <aside className="mg" data-chat style={{ position: "absolute", top: 0, right: 0, height: "100%", width: "min(440px, 94vw)", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow-3)", display: "flex", flexDirection: "column", animation: "chat-in .28s var(--ease-out) both" }}>
        <header className="flex items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: "1px solid var(--hair)" }}>
          <GenieMark size={26} live />
          <div className="leading-tight flex-1">
            <p className="text-[13.5px] font-bold" style={{ color: "var(--fg)" }}>Talk to Genie</p>
            <p className="text-[11px]" style={{ color: "var(--signal-live-ink)" }}>your marketing employee</p>
          </div>
          <button onClick={onClose} className="mg-btn mg-btn--quiet" style={{ fontSize: 12, padding: ".35rem .6rem" }}>Esc</button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll px-4 py-4" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.length === 0 && (
            <div className="mg-rise">
              <p className="text-[14px]" style={{ color: "var(--fg-muted)", lineHeight: 1.5 }}>
                I’m your employee, not a bot. Tell me what you’re after and I’ll make it sharper, then run it. Ask me why I did something, or tell me to change how I work.
              </p>
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-subtle)" }}>Ask me to build a campaign</p>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {PLAYBOOKS.map((pb) => (
                    <button key={pb.kind} onClick={() => requestPlan(pb)} className="flex items-center gap-2.5 text-left mg-surface-quiet px-3 py-2.5 mg-focus" style={{ borderRadius: 12 }}>
                      <span style={{ width: 26, height: 26, flex: "none", borderRadius: 8, background: "var(--accent-quiet)", color: "var(--accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✦</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{pb.label}</span>
                        <span style={{ display: "block", fontSize: 11, color: "var(--fg-subtle)" }}>{pb.hint} · guided plan + schedule, export to Word/PDF</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-subtle)" }}>Or just ask</p>
                <div className="mt-2 flex flex-col gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-left mg-surface-quiet px-3 py-2.5 mg-focus" style={{ fontSize: 12.5, color: "var(--fg)", borderRadius: 12 }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            m.role === "plan" ? (
              <PlanCard key={i} plan={m.plan} />
            ) : (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div className="mg-rise" style={{
                maxWidth: "86%", padding: "9px 13px", fontSize: 13.5, lineHeight: 1.5, borderRadius: 14,
                background: m.role === "user" ? "var(--accent-quiet)" : "var(--surface-2)",
                color: m.role === "user" ? "var(--accent-ink)" : "var(--fg)",
                border: m.role === "user" ? "none" : "1px solid var(--hair)",
                whiteSpace: "pre-wrap",
              }}>{m.content}</div>
              {m.saved && <span className="mg-verified" style={{ marginTop: 4, fontSize: 11 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg> Saved — I’ll remember this from now on</span>}
            </div>
            )
          ))}
          {sending && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div className="mg-surface-quiet" style={{ padding: "9px 13px", borderRadius: 14, fontSize: 13, color: "var(--fg-subtle)" }}>{building ? "Genie is building your plan…" : "Genie is thinking…"}</div>
            </div>
          )}
        </div>

        <div className="px-3 py-3" style={{ borderTop: "1px solid var(--hair)" }}>
          <div className="flex items-end gap-2 p-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 14 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="Tell Genie what to do, or ask why…"
              className="flex-1 bg-transparent outline-none resize-none thin-scroll"
              style={{ color: "var(--fg)", fontSize: 14, maxHeight: 120, padding: "6px 6px" }}
            />
            <button onClick={() => send()} disabled={sending || !input.trim()} className="mg-btn mg-btn--dawn disabled:opacity-40" style={{ fontSize: 13, padding: ".5rem .8rem" }}>Send</button>
          </div>
          <p className="mt-1.5 text-[10.5px] text-center" style={{ color: "var(--fg-subtle)" }}>Genie understands your goal and makes it stronger before acting.</p>
        </div>
      </aside>
      <style dangerouslySetInnerHTML={{ __html: "@keyframes chat-in{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}@media (prefers-reduced-motion:reduce){[data-chat]{animation:none!important}}" }} />
    </div>
  );
}

// A full campaign plan rendered inside the chat, with export to Word / PDF.
function PlanCard({ plan }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mg-rise" style={{ width: "100%", background: "var(--surface-2)", border: "1px solid var(--hair)", borderRadius: 16, overflow: "hidden" }}>
      <div className="px-3.5 pt-3.5 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent-ink)" }}>{plan.label}</p>
        <p className="mt-0.5 text-[15px] font-bold" style={{ color: "var(--fg)", lineHeight: 1.25 }}>{plan.title}</p>
        {plan.goal && <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--fg-muted)", lineHeight: 1.5 }}><b style={{ color: "var(--fg)" }}>Goal.</b> {plan.goal}</p>}
        {plan.summary && <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--fg-muted)", lineHeight: 1.5 }}>{plan.summary}</p>}
      </div>

      {open && (
        <div className="px-3.5 pb-1" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {plan.steps?.length > 0 && (
            <Section title="The plan">
              <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 7 }}>
                {plan.steps.map((s, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: "var(--fg-muted)", lineHeight: 1.5 }}>
                    <b style={{ color: "var(--fg)" }}>{s.title}</b>{s.detail ? ` — ${s.detail}` : ""}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {plan.assets?.length > 0 && (
            <Section title="Ready-to-use copy">
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {plan.assets.map((a, i) => <AssetRow key={i} asset={a} />)}
              </div>
            </Section>
          )}

          {plan.schedule?.length > 0 && (
            <Section title="Schedule">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {plan.schedule.map((r, i) => (
                  <div key={i} className="mg-surface-quiet" style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "7px 10px", borderRadius: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-ink)", flex: "none", minWidth: 62 }}>{r.when}</span>
                    <span style={{ fontSize: 12, color: "var(--fg)", flex: 1, lineHeight: 1.4 }}>{r.task}</span>
                    {r.channel && <span style={{ fontSize: 10.5, color: "var(--fg-subtle)", flex: "none" }}>{r.channel}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 px-3.5 py-3 mt-1" style={{ borderTop: "1px solid var(--hair)" }}>
        <button onClick={() => downloadWord(plan)} className="mg-btn mg-btn--dawn" style={{ fontSize: 12, padding: ".42rem .7rem" }}>Export Word</button>
        <button onClick={() => printPdf(plan)} className="mg-btn mg-btn--ghost" style={{ fontSize: 12, padding: ".42rem .7rem" }}>Save as PDF</button>
        <button onClick={() => setOpen((v) => !v)} className="mg-btn mg-btn--quiet ml-auto" style={{ fontSize: 11.5, padding: ".42rem .6rem" }}>{open ? "Collapse" : "Expand"}</button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--fg-subtle)" }}>{title}</p>
      {children}
    </div>
  );
}

function AssetRow({ asset }) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(asset.copy); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {} }
  return (
    <div className="mg-surface-quiet" style={{ padding: "8px 10px", borderRadius: 10 }}>
      <div className="flex items-center gap-2">
        <span style={{ flex: 1, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--fg-subtle)" }}>{asset.name}</span>
        <button onClick={copy} className="mg-btn mg-btn--quiet" style={{ fontSize: 10.5, padding: ".25rem .5rem" }}>{copied ? "✓" : "Copy"}</button>
      </div>
      <p style={{ marginTop: 3, fontSize: 12.5, color: "var(--fg)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{asset.copy}</p>
    </div>
  );
}
