"use client";

// components/onboarding/UnderstandingCheck.js
// ── "DID I GET YOU RIGHT?" ──
// The step every other part of Genie is built on: keywords, content, who Buyer
// Hunt looks for, who Find clients pitches and what the pitch says. It has to
// behave like a strategist taking notes, not a form with a chat box on it.
//
// Three things were wrong with the first version, and each is answered here:
//
//   1. It did not visibly learn. The left panel showed nine homepage fields that
//      barely moved. Now it shows the business brief, section by section, what
//      is known, what is still missing, and marks what the last answer added.
//
//   2. A failure cost the owner their words. "I'm a little busy" appeared and the
//      only way forward was to paste the whole thing again. Now a failed message
//      stays in the thread with a Retry button, and nothing is sent twice.
//
//   3. The chat grew the page instead of scrolling. Both panels now have a fixed
//      height and scroll inside, the thread follows new messages unless you have
//      scrolled up to read, and long pasted answers are collapsed.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TOPICS, coverage, normalizeBrief } from "@/lib/business-brief";

const OPENER = "I have read your site properly. Here is what I took from it. Tell me where I am wrong, and fill in the things a website never says. Paste as much as you like, long answers are exactly what I want.";
const LONG = 700; // characters before an owner message is collapsed
const LIMIT = 16000;

let seq = 0;
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function UnderstandingCheck({ initialAi, pageText = "", host = "", busy = false, onConfirm }) {
  const [ai, setAi] = useState(() => initialAi || {});
  const [convo, setConvo] = useState(() => [{ id: uid(), role: "genie", content: OPENER }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [topic, setTopic] = useState(null);
  const [skipped, setSkipped] = useState([]);
  const [justLearned, setJustLearned] = useState([]);

  const cov = useMemo(() => coverage(ai.brief, ai), [ai]);

  // Opening line, grounded in what the scan actually read.
  useEffect(() => {
    let alive = true;
    (async () => {
      setSending(true);
      try {
        const r = await fetch("/api/understand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai: initialAi || {}, action: "questions", pageText }) }).then((x) => x.json());
        const q = Array.isArray(r?.questions) ? r.questions[0] : null;
        if (alive && q) setConvo((c) => [...c, { id: uid(), role: "genie", content: q }]);
      } catch {}
      if (alive) setSending(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save after every turn that learned something, so a refresh or a closed tab
  // never throws an owner's twenty minutes away.
  function persist(next) {
    if (!host) return;
    fetch("/api/understand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host, ai: next }) }).catch(() => {});
  }

  async function send(retry) {
    const text = (retry ? retry.content : input).trim();
    if (!text || sending) return;
    let id = retry?.id;
    if (retry) {
      setConvo((c) => c.map((m) => (m.id === id ? { ...m, status: "sending", error: "" } : m)));
    } else {
      id = uid();
      setInput("");
      setConvo((c) => [...c, { id, role: "owner", content: text.slice(0, LIMIT), status: "sending" }]);
    }
    const lastQuestion = [...convo].reverse().find((m) => m.role === "genie")?.content || "";
    setSending(true);
    try {
      const res = await fetch("/api/understand", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai, message: text.slice(0, LIMIT), lastQuestion, lastTopic: topic, skipped }),
      });
      const r = await res.json().catch(() => ({}));
      if (r?.ok) {
        setAi(r.ai);
        setTopic(r.topic || null);
        setSkipped(r.skipped || []);
        setJustLearned(r.changed || []);
        setConvo((c) => [...c.map((m) => (m.id === id ? { ...m, status: "sent" } : m)), { id: uid(), role: "genie", content: r.reply }]);
        if ((r.changed || []).length) persist(r.ai);
      } else {
        setConvo((c) => c.map((m) => (m.id === id ? { ...m, status: "failed", error: r?.message || r?.error || "I could not read that. Press Retry." } : m)));
      }
    } catch {
      setConvo((c) => c.map((m) => (m.id === id ? { ...m, status: "failed", error: "The connection dropped. Press Retry." } : m)));
    }
    setSending(false);
  }

  const failed = convo.some((m) => m.status === "failed");

  return (
    <>
      <div className="uc-grid mt-7">
        <BriefPanel ai={ai} cov={cov} justLearned={justLearned} host={host} />
        <ChatPanel
          convo={convo} sending={sending} input={input} setInput={setInput}
          onSend={() => send()} onRetry={(m) => send(m)}
          canSkip={!!topic && !sending}
          onSkip={() => { setInput(""); sendSkip(); }}
          blocked={failed}
        />
      </div>

      <div className="mt-6 flex items-center gap-5 flex-wrap">
        <button onClick={() => onConfirm?.(ai)} disabled={busy || sending} className={`onb-cta px-8 text-[16px] disabled:opacity-60${cov.ready ? " uc-ready" : ""}`} style={{ height: 56 }}>
          {busy ? "Building your plan…" : cov.ready ? "Build my plan on this →" : "Build my plan with what you know →"}
        </button>
        <span className="text-[13px]" style={{ color: "var(--onb-subtle)", maxWidth: 420 }}>
          {cov.ready
            ? "I have what I need. Every keyword, post and pitch will follow this."
            : `Still missing: ${TOPICS.filter((t) => cov.missingNeeded.includes(t.key)).map((t) => t.label.toLowerCase()).join(", ")}. I can start without them, the plan is just less sharp.`}
        </span>
      </div>
    </>
  );

  function sendSkip() {
    // A skip goes through the same path so the thread shows it, and the server
    // treats it as "move on" without spending a model call.
    const id = uid();
    setConvo((c) => [...c, { id, role: "owner", content: "Skip", status: "sending" }]);
    (async () => {
      setSending(true);
      try {
        const r = await fetch("/api/understand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ai, message: "skip", lastTopic: topic, skipped }) }).then((x) => x.json());
        if (r?.ok) {
          setTopic(r.topic || null); setSkipped(r.skipped || []); setJustLearned([]);
          setConvo((c) => [...c.map((m) => (m.id === id ? { ...m, status: "sent" } : m)), { id: uid(), role: "genie", content: r.reply }]);
        } else setConvo((c) => c.filter((m) => m.id !== id));
      } catch { setConvo((c) => c.filter((m) => m.id !== id)); }
      setSending(false);
    })();
  }
}

// ── LEFT: what Genie knows ───────────────────────────────────────────────────
function BriefPanel({ ai, cov, justLearned, host }) {
  const brief = normalizeBrief(ai.brief);
  const fresh = new Set(justLearned);
  // A section with nothing in the brief still shows what the scan found, marked
  // as a website guess, so the owner sees exactly what they are correcting.
  const fallback = { offer: ai.whatTheySell, segments: ai.targetCustomer, cta: ai.conversionGoal, proof: ai.proof, neverSay: ai.avoid, tone: ai.tone };
  const name = String(ai.businessName || host || "your business");

  // Bring what the last answer added into view, so the owner watches it land
  // instead of having to hunt for it further down the panel.
  const listRef = useRef(null);
  const learnedKey = justLearned.join(",");
  useEffect(() => {
    if (!learnedKey || !listRef.current) return;
    const row = listRef.current.querySelector(".uc-fresh");
    if (row) listRef.current.scrollTo({ top: row.offsetTop - 8, behavior: "smooth" });
  }, [learnedKey]);

  return (
    <section className="uc-panel" aria-label="What Genie knows about your business">
      <header style={{ padding: "15px 20px", borderBottom: "1px solid var(--onb-hair)" }}>
        <p className="text-[12px] font-semibold" style={{ textTransform: "uppercase", letterSpacing: ".13em", color: "var(--onb-subtle)" }}>What I know about</p>
        <div className="flex items-baseline gap-3 flex-wrap" style={{ marginTop: 2 }}>
          <p className="text-[17px] font-bold" style={{ color: "var(--onb-fg)", letterSpacing: "-.01em" }}>{name.charAt(0).toUpperCase() + name.slice(1)}</p>
          {ai.businessType && <span className="text-[12px]" style={{ color: "var(--onb-subtle)" }}>{ai.businessType}</span>}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div style={{ flex: 1, height: 6, borderRadius: 99, background: "var(--onb-panel-2)", overflow: "hidden" }} role="progressbar" aria-valuenow={cov.score} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${cov.score}%`, height: "100%", borderRadius: 99, background: cov.ready ? "var(--onb-live-fill)" : "var(--onb-dawn)", transition: "width .5s ease" }} />
          </div>
          <span className="text-[12px] font-semibold" style={{ color: cov.ready ? "var(--onb-live)" : "var(--onb-muted)", flex: "none" }}>
            {cov.ready ? `Ready to build · ${cov.score}% detail` : `${cov.score}% understood`}
          </span>
        </div>
      </header>

      <div ref={listRef} className="uc-scroll thin-scroll" style={{ padding: "6px 20px 18px", position: "relative" }}>
        {TOPICS.map((t) => {
          const v = brief[t.key];
          const has = Array.isArray(v) ? v.length > 0 : !!v;
          const guess = !has && fallback[t.key] ? String(fallback[t.key]) : "";
          return (
            <div key={t.key} className={`uc-row${fresh.has(t.key) ? " uc-fresh" : ""}`}>
              <div className="flex items-center gap-2">
                <span aria-hidden style={{ width: 16, flex: "none", textAlign: "center", fontSize: 12, color: has ? "var(--onb-live)" : guess ? "var(--onb-muted)" : "var(--onb-subtle)" }}>{has ? "✓" : guess ? "~" : "○"}</span>
                <span className="text-[12.5px] font-semibold" style={{ color: has ? "var(--onb-fg)" : "var(--onb-muted)" }}>{t.label}</span>
                {fresh.has(t.key) && <span className="uc-badge">just learned</span>}
                {!has && guess && <span className="text-[11px]" style={{ color: "var(--onb-subtle)" }}>from your website</span>}
              </div>
              <div style={{ paddingLeft: 24, marginTop: 3 }}>
                {has ? <Value kind={t.kind} v={v} /> : guess
                  ? <p className="text-[14px]" style={{ color: "var(--onb-muted)", lineHeight: 1.45 }}>{guess}</p>
                  : <p className="text-[13px]" style={{ color: "var(--onb-subtle)" }}>{t.need ? "Not told yet, I need this" : "Not told yet"}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Value({ kind, v }) {
  const [all, setAll] = useState(false);
  if (kind === "text") return <p className="text-[14px]" style={{ color: "var(--onb-fg)", lineHeight: 1.45 }}>{v}</p>;
  const items = kind === "pairs" ? v : v;
  const shown = all ? items : items.slice(0, 5);
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
      {shown.map((it, i) => (
        <li key={i} className="text-[14px]" style={{ color: "var(--onb-fg)", lineHeight: 1.4 }}>
          {kind === "pairs"
            ? <><span>“{it.objection}”</span>{it.answer && <span style={{ color: "var(--onb-muted)" }}> → {it.answer}</span>}</>
            : it}
        </li>
      ))}
      {items.length > 5 && (
        <li><button type="button" onClick={() => setAll((a) => !a)} className="text-[12.5px] font-semibold" style={{ color: "var(--onb-dawn)", background: "none", border: 0, padding: 0, cursor: "pointer" }}>
          {all ? "Show less" : `+${items.length - 5} more`}
        </button></li>
      )}
    </ul>
  );
}

// ── RIGHT: the conversation ──────────────────────────────────────────────────
function ChatPanel({ convo, sending, input, setInput, onSend, onRetry, canSkip, onSkip, blocked }) {
  const scroller = useRef(null);
  const taRef = useRef(null);
  const pinned = useRef(true);        // is the reader at the bottom?
  const [unseen, setUnseen] = useState(false);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (pinned.current) setUnseen(false);
  }
  function toBottom(smooth = true) {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    pinned.current = true; setUnseen(false);
  }

  // Follow the conversation like every chat app does, but never yank someone who
  // has scrolled up to reread an earlier answer; tell them something arrived.
  useLayoutEffect(() => {
    const last = convo[convo.length - 1];
    if (pinned.current || last?.role === "owner") toBottom(convo.length > 2);
    else setUnseen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convo.length, sending]);

  // Grow the box with what is typed, up to a limit, then scroll inside it.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  const long = input.length > 1200;

  return (
    <section className="uc-panel" aria-label="Chat with Genie" style={{ background: "var(--onb-ink)" }}>
      <header style={{ padding: "15px 20px", borderBottom: "1px solid var(--onb-hair)", display: "flex", alignItems: "center", gap: 9, background: "var(--onb-panel)" }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--onb-live-fill)", display: "inline-block", flex: "none" }} />
        <p className="text-[14px] font-semibold" style={{ color: "var(--onb-fg)" }}>Chat with Genie</p>
        <span className="ml-auto text-[12px]" style={{ color: "var(--onb-subtle)" }}>Correct or add anything</span>
      </header>

      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
        <div ref={scroller} onScroll={onScroll} className="uc-scroll thin-scroll" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, flex: 1 }} aria-live="polite">
          {convo.map((m) => <Bubble key={m.id} m={m} onRetry={onRetry} disabled={sending} />)}
          {sending && (
            <div className="self-start flex items-center gap-2" style={{ padding: "8px 14px", borderRadius: 14, background: "var(--onb-panel)", border: "1px solid var(--onb-hair)" }}>
              <span className="onb-spinner" />
              <span className="text-[13px]" style={{ color: "var(--onb-muted)" }}>Reading carefully…</span>
            </div>
          )}
        </div>
        {unseen && (
          <button type="button" onClick={() => toBottom()} className="uc-jump">New message ↓</button>
        )}
      </div>

      <footer style={{ padding: 12, borderTop: "1px solid var(--onb-hair)", background: "var(--onb-panel)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            maxLength={LIMIT}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!blocked) onSend(); } }}
            placeholder={blocked ? "Retry the message above first" : "Answer, correct me, or paste your whole strategy"}
            className="onb-input flex-1 thin-scroll"
            style={{ padding: "12px 14px", fontSize: 15, lineHeight: 1.45, resize: "none", minHeight: 48, maxHeight: 180 }}
            aria-label="Message Genie"
          />
          <button onClick={onSend} disabled={sending || blocked || !input.trim()} className="onb-cta px-5 text-[14px] disabled:opacity-40" style={{ height: 48, flex: "none" }}>Send</button>
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-[11.5px]" style={{ color: "var(--onb-subtle)", minHeight: 18 }}>
          <span>Enter to send · Shift+Enter for a new line</span>
          {long && <span>{input.length.toLocaleString()} / {LIMIT.toLocaleString()}</span>}
          {canSkip && <button type="button" onClick={onSkip} className="ml-auto font-semibold" style={{ color: "var(--onb-dawn)", background: "none", border: 0, padding: 0, cursor: "pointer" }}>Skip this question</button>}
        </div>
      </footer>
    </section>
  );
}

function Bubble({ m, onRetry, disabled }) {
  const [open, setOpen] = useState(false);
  const owner = m.role === "owner";
  const collapsible = owner && m.content.length > LONG;
  const text = collapsible && !open ? `${m.content.slice(0, LONG).trimEnd()}…` : m.content;
  return (
    <div className={owner ? "self-end" : "self-start"} style={{ maxWidth: "88%" }}>
      <div style={{
        padding: "11px 14px", borderRadius: 16, fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
        background: owner ? "var(--onb-dawn)" : "var(--onb-panel)",
        color: owner ? "#FFFFFF" : "var(--onb-fg)",
        border: owner ? "none" : "1px solid var(--onb-hair)",
        opacity: m.status === "sending" ? 0.75 : 1,
        borderBottomRightRadius: owner ? 6 : 16, borderBottomLeftRadius: owner ? 16 : 6,
      }}>
        {text}
        {collapsible && (
          <button type="button" onClick={() => setOpen((o) => !o)} style={{ display: "block", marginTop: 6, background: "none", border: 0, padding: 0, color: "rgba(255,255,255,.85)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            {open ? "Show less" : `Show all (${m.content.length.toLocaleString()} characters)`}
          </button>
        )}
      </div>
      {m.status === "failed" && (
        <div className="mt-1.5 flex items-center gap-2 justify-end text-[12.5px]">
          <span style={{ color: "#D70015" }}>{m.error}</span>
          <button type="button" disabled={disabled} onClick={() => onRetry(m)} className="font-semibold disabled:opacity-50" style={{ color: "var(--onb-dawn)", background: "none", border: 0, padding: 0, cursor: "pointer" }}>Retry</button>
        </div>
      )}
    </div>
  );
}
