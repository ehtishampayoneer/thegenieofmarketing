"use client";

import { useState, useEffect, useRef } from "react";
import AwareOrb from "./AwareOrb";

// The persistent Genie panel — a presence, not a page.
export default function GeniePanel({
  host,
  contextChips = [],
  quickActions = [],
  suggestionCount = 0,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  const orbState = busy ? "thinking" : suggestionCount > 0 ? "suggesting" : "idle";

  // Load this business's conversation history when the business changes.
  useEffect(() => {
    if (!host) { setMessages([]); return; }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/messages?host=${encodeURIComponent(host)}`);
        const j = await res.json();
        if (active && j.ok) setMessages(j.messages.map((m) => ({ role: m.role, content: m.content })));
      } catch {}
    })();
    return () => { active = false; };
  }, [host]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages, busy]);

  function persist(role, content) {
    if (!host) return;
    fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host, role, content }),
    }).catch(() => {});
  }

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    persist("user", content);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, host }),
      });
      const j = await res.json();
      const reply = j.ok ? j.reply : (j.message || "Try again in a moment.");
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      if (j.ok) persist("assistant", reply);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Connection hiccup — try again." }]);
    }
    setBusy(false);
  }

  // Collapsed: still alive — orb + suggestion badge on the edge.
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="hidden lg:flex fixed right-4 bottom-6 z-30 items-center gap-2 bg-surface border border-ink-900/[0.06] shadow-glow rounded-full pl-2 pr-4 py-2"
      >
        <AwareOrb state={suggestionCount > 0 ? "suggesting" : "idle"} count={suggestionCount} size={26} />
        <span className="text-sm font-medium text-ink-900">
          {suggestionCount > 0 ? `${suggestionCount} suggestions` : "Ask Genie"}
        </span>
      </button>
    );
  }

  return (
    <aside className="hidden lg:flex w-[360px] shrink-0 flex-col bg-surface border-l border-ink-900/[0.06]">
      {/* Header */}
      <div className="px-4 py-4 border-b border-ink-900/[0.06]">
        <div className="flex items-center gap-2">
          <AwareOrb state={orbState} count={suggestionCount} size={30} />
          <div className="flex-1">
            <p className="font-bold text-ink-900 leading-tight">Genie</p>
            <p className="text-xs text-ink-400 leading-tight">
              {busy ? "thinking…" : "your marketing operator"}
            </p>
          </div>
          <button onClick={() => setCollapsed(true)} className="text-ink-400 hover:text-ink-900 text-sm" title="Collapse">
            ▸
          </button>
        </div>
        {/* Context chips */}
        {contextChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {contextChips.map((c, i) => (
              <button
                key={i}
                onClick={c.onClick}
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition ${
                  c.active
                    ? "bg-brand-violet/10 text-brand-violet border-brand-violet/30"
                    : "bg-surface2 text-ink-600 border-ink-900/[0.06] hover:border-brand-violet/30"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scroll px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-ink-600 bg-surface2 border border-ink-900/[0.06] rounded-2xl px-4 py-3">
            Hi — I'm watching {host || "your business"}. Pick a quick action below or ask me anything.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "grad-genie text-white" : "bg-surface2 border border-ink-900/[0.06] text-ink-900"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-surface2 border border-ink-900/[0.06] rounded-2xl px-3.5 py-2.5 text-sm text-ink-400">
              Genie is thinking…
            </div>
          </div>
        )}
      </div>

      {/* Quick actions (context-aware) */}
      {quickActions.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {quickActions.map((qa, i) => (
            <button
              key={i}
              onClick={() => send(qa.prompt)}
              disabled={busy}
              className="text-xs bg-surface2 border border-ink-900/[0.06] rounded-full px-3 py-1.5 text-ink-600 hover:border-brand-violet/40 transition disabled:opacity-50"
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-1">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask Genie…"
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-ink-900/[0.1] bg-surface outline-none focus:ring-2 focus:ring-brand-violet/30 text-sm"
          />
          <button
            onClick={() => send()}
            disabled={busy || !input.trim()}
            className="grad-genie text-white font-semibold px-4 rounded-xl text-sm disabled:opacity-50"
          >
            →
          </button>
        </div>
      </div>
    </aside>
  );
}
