"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const QUICK_PROMPTS = [
  "What should I fix first?",
  "How do I get more traffic?",
  "How can I beat my competitors?",
  "Write me a plan for this week",
];

export default function ChatPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setReady(true);
      setMessages([
        {
          role: "assistant",
          content:
            "Hi! I'm Genie. I know your business from your scans — ask me anything about growing it. What's on your mind?",
        },
      ]);
    })();
  }, [router]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, busy]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const j = await res.json();
      if (j.ok) {
        setMessages((m) => [...m, { role: "assistant", content: j.reply }]);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: j.message || "Sorry, something went wrong. Try again." },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Connection hiccup — try that again." },
      ]);
    }
    setBusy(false);
  }

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-genie-ink/50">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 flex items-center gap-2 border-b border-genie-ink/10">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg genie-gradient" aria-hidden />
          <span className="font-bold tracking-tight text-genie-ink">Marketing Genie</span>
        </a>
        <a href="/dashboard" className="ml-auto text-sm text-genie-purple font-medium hover:underline">
          ← Dashboard
        </a>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "genie-gradient text-white"
                    : "bg-white border border-genie-ink/10 text-genie-ink"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="bg-white border border-genie-ink/10 rounded-2xl px-4 py-3 text-sm text-genie-ink/40">
                Genie is thinking…
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="max-w-2xl mx-auto">
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-sm bg-white border border-genie-ink/15 rounded-full px-3 py-1.5 text-genie-ink/70 hover:border-genie-purple/40 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask Genie anything about your business…"
              className="flex-1 px-4 py-3 rounded-xl border border-genie-ink/15 bg-white outline-none focus:ring-2 focus:ring-genie-purple/40 transition"
            />
            <button
              onClick={() => send()}
              disabled={busy || !input.trim()}
              className="genie-gradient text-white font-semibold px-5 py-3 rounded-xl disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
