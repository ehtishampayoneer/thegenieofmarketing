"use client";

// app/spread/page.js
// ── SPREAD IT ──
// Genie publishes each approved article to a hosted Genie page. That page is real,
// but it lives on Genie's domain, so it earns Genie's domain the credit, not the
// owner's. One article a day to the same place is not a ranking strategy, and the
// app used to imply that it was.
//
// This screen is the honest version of publishing: the same article, put where it
// actually does something. Your own site first (the only version that builds your
// ranking), then the places people and AI assistants read. Genie writes each one,
// you paste it, and you tick it off so Genie never repeats itself.

import { useEffect, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";
import { EmptyState } from "@/components/ui/v2/DataState";

export default function SpreadPage() {
  const [articles, setArticles] = useState(null);
  const [openId, setOpenId] = useState(null);

  async function load() {
    try {
      const j = await fetch("/api/spread", { cache: "no-store" }).then((r) => r.json());
      setArticles(j?.ok ? j.articles : []);
    } catch { setArticles([]); }
  }
  useEffect(() => { load(); }, []);

  return (
    <OperatorShell active="spread">
      <div>
        <h1 className="mg-display" style={{ fontSize: "clamp(28px,3vw,37px)" }}>Spread it</h1>
        <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "var(--measure-wide)" }}>
          One article, put where it counts. <b style={{ color: "var(--fg)" }}>Your own site first</b>, because that is the only copy that builds your own ranking. Then the places buyers and AI assistants read. Genie writes each version for that place; you paste it and tick it off.
        </p>
      </div>

      {articles === null ? (
        <div className="mt-6 mg-surface p-10 text-center text-[13px] mg-subtle">Loading your articles…</div>
      ) : articles.length === 0 ? (
        <div className="mt-6"><EmptyState icon={Icon.write} title="No published articles yet" sub="Approve an article in Approvals and it appears here, ready to spread." /></div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {articles.map((a) => (
            <ArticleRow key={a.id} a={a} open={openId === a.id} onToggle={() => setOpenId(openId === a.id ? null : a.id)} onChanged={load} />
          ))}
        </div>
      )}
    </OperatorShell>
  );
}

function ArticleRow({ a, open, onToggle, onChanged }) {
  const [pack, setPack] = useState(a.pack || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ownUrl, setOwnUrl] = useState(a.ownUrl || "");
  const [ownMsg, setOwnMsg] = useState("");
  const posted = new Set(a.posted || []);
  const done = posted.size + (a.ownUrl ? 1 : 0);

  async function write() {
    setBusy(true); setErr("");
    try {
      const j = await fetch("/api/spread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: a.id }) }).then((r) => r.json());
      if (j?.ok) { setPack(j.pack); onChanged?.(); } else setErr(j?.error || "Couldn't write those just now.");
    } catch { setErr("Couldn't write those just now."); }
    setBusy(false);
  }

  async function tick(channel) {
    await fetch("/api/spread", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: a.id, channel }) }).catch(() => {});
    onChanged?.();
  }

  async function saveOwn() {
    setOwnMsg("");
    const j = await fetch("/api/spread", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: a.id, ownUrl }) }).then((r) => r.json()).catch(() => null);
    setOwnMsg(j?.ok ? (j.indexed ? "Saved. Genie asked Google to crawl it." : "Saved.") : (j?.error || "Couldn't save that."));
    if (j?.ok) onChanged?.();
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{a.title}</p>
          <p className="text-[12.5px] mg-subtle mt-0.5">
            {a.keyword ? <>targets “{a.keyword}” · </> : null}
            <a href={a.geniePage} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-ink)" }}>your Genie page ↗</a>
            {done > 0 ? <> · spread to {done} place{done === 1 ? "" : "s"}</> : null}
          </p>
        </div>
        <button onClick={onToggle} className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}>{open ? "Close" : "Spread it"}</button>
      </div>

      {open && (
        <div className="mt-4">
          {/* Own site first: the only copy that builds the owner's own ranking. */}
          <div className="p-3.5 rounded-xl" style={{ background: "var(--accent-quiet)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)" }}>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>1. Put it on your own website</p>
            <p className="mt-1 text-[13px] mg-muted">This is the version that builds <b style={{ color: "var(--fg)" }}>your</b> search ranking. The others send people and AI to it.</p>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <a href={`${a.geniePage}/md`} target="_blank" rel="noopener noreferrer" className="mg-btn mg-btn--ghost" style={{ fontSize: 12.5 }}>Open the text to copy ↗</a>
              <input value={ownUrl} onChange={(e) => setOwnUrl(e.target.value)} placeholder="Paste the URL on your site once it's live"
                className="mg-field mg-focus" style={{ flex: 1, minWidth: 240, fontSize: 13 }} />
              <button onClick={saveOwn} disabled={!ownUrl.trim()} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 12.5 }}>Save</button>
            </div>
            {ownMsg && <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--signal-live-ink)" }}>{ownMsg}</p>}
            {a.ownUrl && !ownMsg && <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--signal-live-ink)" }}>Live on your site: {a.ownUrl}</p>}
          </div>

          <p className="mt-4 text-[13.5px] font-semibold" style={{ color: "var(--fg)" }}>2. Then put it where people and AI read</p>
          {!pack ? (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <button onClick={write} disabled={busy} className="mg-btn mg-btn--dawn disabled:opacity-60" style={{ fontSize: 13 }}>{busy ? "Writing each version…" : "Write my versions"}</button>
              <span className="text-[12.5px] mg-subtle">Medium, LinkedIn, Dev.to, Reddit and Quora, each written for that place.</span>
              {err && <span className="text-[12.5px]" style={{ color: "var(--signal-danger)" }}>{err}</span>}
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-2.5">
              {pack.map((c) => (
                <ChannelCard key={c.id} c={c} done={posted.has(c.id)} onTick={() => tick(c.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ChannelCard({ c, done, onTick }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(`${c.title ? c.title + "\n\n" : ""}${c.body}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  return (
    <div className="p-3.5 rounded-xl" style={{ border: "1px solid var(--hair)", background: done ? "var(--signal-live-soft)" : "var(--surface)" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold flex items-center gap-2" style={{ color: "var(--fg)" }}>
            {c.label}
            {done && <span className="mg-verified">✓ posted</span>}
            <span className="mg-pill">{c.kind === "community" ? "you answer, in your words" : "republish, links back to you"}</span>
          </p>
          <p className="text-[12.5px] mg-muted mt-0.5">{c.effect}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button onClick={copy} className="mg-btn mg-btn--ghost" style={{ fontSize: 12.5 }}>{copied ? "Copied" : "Copy"}</button>
          {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="mg-btn mg-btn--ghost" style={{ fontSize: 12.5 }}>Open ↗</a>}
          {!done && <button onClick={onTick} className="mg-btn mg-btn--dawn" style={{ fontSize: 12.5 }}>I posted it</button>}
        </div>
      </div>
      <p className="mt-1.5 text-[12px] mg-subtle">{c.how}</p>
      <button onClick={() => setShow((v) => !v)} className="mt-2 text-[12.5px] font-semibold" style={{ color: "var(--accent-ink)", background: "none", border: 0, padding: 0, cursor: "pointer" }}>
        {show ? "Hide the draft" : "Read the draft"}
      </button>
      {show && (
        <div className="mt-2 p-3 rounded-lg text-[13px]" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)", whiteSpace: "pre-wrap", color: "var(--fg)", maxHeight: 320, overflowY: "auto" }}>
          {c.title ? <p className="font-semibold mb-1.5">{c.title}</p> : null}
          {c.body}
        </div>
      )}
    </div>
  );
}
