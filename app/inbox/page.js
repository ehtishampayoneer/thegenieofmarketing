"use client";

// ── GENIE INBOX ──
// Everyone Genie has emailed on your behalf, threaded with their reply. Sent shows up
// the moment you press Send in Find clients; replies are pulled from your own Gmail
// (readonly) and land here with a notification. "Check for replies" syncs on demand;
// the nightly loop does it automatically.

import { useState, useEffect } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";

const fmt = (d) => { try { return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };

export default function InboxPage() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const j = await fetch("/api/inbox", { cache: "no-store" }).then((r) => r.json());
      if (j?.ok) { setData(j); setState("real"); } else setState("disconnected");
    } catch { setState("disconnected"); }
  }
  useEffect(() => { load(); }, []);

  async function checkReplies() {
    if (syncing) return;
    setSyncing(true); setMsg("");
    try {
      const j = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json());
      setMsg(j?.ok ? j.message : "Couldn't check replies. Connect Google with read access on Connections.");
      if (j?.ok && j.found) await load();
    } catch { setMsg("Couldn't check replies just now."); }
    setSyncing(false);
  }

  const threads = data?.threads || [];
  const replied = data?.counts?.replied || 0;

  return (
    <OperatorShell active="inbox">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="mg-display" style={{ fontSize: "clamp(24px,2.6vw,30px)" }}>Inbox</h1>
          <p className="mt-1.5 text-[14px] mg-muted">Everyone Genie emailed for you, threaded with their reply. {threads.length > 0 && <span><b style={{ color: "var(--fg)" }}>{threads.length}</b> sent · <b style={{ color: "var(--signal-live-ink)" }}>{replied}</b> replied</span>}</p>
        </div>
        <button onClick={checkReplies} disabled={syncing} className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 12.5 }}>
          <Icon.reply size={14} /> {syncing ? "Checking…" : "Check for replies"}
        </button>
      </div>
      {msg && <p className="mt-2 text-[12.5px]" style={{ color: "var(--accent-ink)" }}>{msg}</p>}

      {state === "loading" ? (
        <div className="mt-6 mg-surface p-10 text-center text-[13px] mg-subtle">Loading your inbox…</div>
      ) : threads.length === 0 ? (
        <Card className="mt-6 p-10 text-center">
          <span className="mg-tile mx-auto" style={{ width: 46, height: 46, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.mail size={22} /></span>
          <p className="mt-4 text-[16px] font-bold" style={{ color: "var(--fg)" }}>No outreach yet</p>
          <p className="mt-1.5 text-[13.5px] mg-muted max-w-md mx-auto">Find target companies and send them a tailored pitch. Everything you send lands here, with replies threaded in.</p>
          <a href="/prospects" className="mg-btn mg-btn--dawn mt-5 inline-flex" style={{ fontSize: 13.5 }}>Find clients →</a>
        </Card>
      ) : (
        <div className="mt-5 flex flex-col gap-2.5">
          {threads.map((t, i) => (
            <Card key={i} className="p-4 mg-lift">
              <div className="flex items-start gap-3">
                <span className="mg-tile shrink-0" style={{ width: 34, height: 34, background: t.status === "replied" ? "var(--signal-live-soft)" : "var(--surface-2)", color: t.status === "replied" ? "var(--signal-live-ink)" : "var(--fg-muted)", fontWeight: 700, fontSize: 13 }}>{(t.name || t.email || "?").charAt(0).toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>{t.name || t.email}</span>
                    <span className="text-[12px] mg-subtle mg-num">{t.email}</span>
                    <span className="ml-auto text-[11.5px] mg-subtle mg-num">{fmt(t.sentAt)}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] truncate" style={{ color: "var(--fg-muted)" }}>{t.subject}</p>
                  {t.reply && (
                    <div className="mt-2.5 rounded-lg p-3" style={{ background: "var(--signal-live-soft)", border: "1px solid var(--hair)" }}>
                      <p className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--signal-live-ink)" }}><Icon.reply size={12} /> They replied{t.reply.date ? ` · ${fmt(t.reply.date)}` : ""}</p>
                      <p className="mt-1 text-[13px]" style={{ color: "var(--fg)" }}>{t.reply.snippet || t.reply.subject}</p>
                    </div>
                  )}
                </div>
                <span className="shrink-0">{t.status === "replied" ? <Pill tone="live">Replied</Pill> : t.status === "failed" ? <Pill tone="danger">Failed</Pill> : <Pill tone="neutral">Sent</Pill>}</span>
              </div>
            </Card>
          ))}
          <p className="text-[12px] mg-subtle mt-1" style={{ maxWidth: "70ch" }}>Replies are read from your own Gmail (readonly), matched by sender. Reconnect Google if you don't see the read permission yet. Sync runs nightly, or tap Check for replies anytime.</p>
        </div>
      )}
    </OperatorShell>
  );
}
