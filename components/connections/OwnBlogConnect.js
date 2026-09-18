"use client";

// components/connections/OwnBlogConnect.js
// "Put my articles on my own site", for every site that is not WordPress.
// One rule on the owner's host sends yoursite.com/blog to Genie; after that every
// approved article is published there automatically (see lib/own-blog.js). This
// is the difference between Genie building the owner's ranking and building its
// own, so it is written for someone who has never seen a config file: pick the
// folder, copy one block, send it to whoever looks after the site, press Check.

import { useEffect, useState } from "react";

const btn = { fontSize: 13, padding: ".5rem .9rem" };

export default function OwnBlogConnect({ compact = false, onLive }) {
  const [s, setS] = useState(null);       // GET payload
  const [path, setPath] = useState("/blog");
  const [tab, setTab] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ text: "", tone: "" });
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const j = await fetch("/api/connect/blog", { cache: "no-store" }).then((r) => r.json());
      if (j?.ok) { setS(j); setPath(j.path || "/blog"); setTab((t) => t || j.hosting || "nextjs"); }
    } catch {}
  }
  useEffect(() => { load(); }, []);

  async function choose() {
    setBusy("save"); setMsg({ text: "", tone: "" });
    try {
      const j = await fetch("/api/connect/blog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, platform: tab }) }).then((r) => r.json());
      if (j?.ok) await load(); else setMsg({ text: j?.error || "Couldn't save that.", tone: "bad" });
    } catch { setMsg({ text: "Couldn't reach Genie just now.", tone: "bad" }); }
    setBusy("");
  }

  async function check(silent = false) {
    if (!silent) { setBusy("check"); setMsg({ text: "", tone: "" }); }
    try {
      const j = await fetch("/api/connect/blog", { method: "PUT" }).then((r) => r.json());
      if (j?.ok) {
        setMsg({ text: `Live. ${j.articles} article${j.articles === 1 ? "" : "s"} now on your own domain${j.sitemap ? ", and Google has the sitemap" : ""}. Every new one goes there automatically.`, tone: "good" });
        await load(); onLive?.(j.base);
      } else if (!silent) setMsg({ text: j?.error || "Not live yet.", tone: "bad" });
    } catch { if (!silent) setMsg({ text: "Couldn't reach Genie just now.", tone: "bad" }); }
    if (!silent) setBusy("");
  }

  // While waiting for the developer, check quietly now and then so the owner
  // does not have to come back and press anything.
  useEffect(() => {
    if (s?.state !== "waiting") return;
    let n = 0;
    const t = setInterval(() => { if (++n > 20) return clearInterval(t); check(true); }, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.state]);

  async function stop() {
    if (!confirm("Stop publishing to your own site? New articles go back to your Genie page. Pages already on your site stop loading until you remove the rule.")) return;
    await fetch("/api/connect/blog", { method: "DELETE" }).catch(() => {});
    setMsg({ text: "", tone: "" }); load();
  }

  if (!s) return <p className="mt-2 text-[12px] mg-subtle">Checking your site…</p>;
  if (s.state === "no_site") return <p className="mt-2 text-[12px] mg-subtle">Scan your website first.</p>;

  if (s.state === "live") {
    return (
      <div className="mt-2 flex items-center gap-2 flex-wrap text-[12.5px]">
        <span style={{ color: "var(--signal-live-ink)" }}>Articles publish automatically to</span>
        <a href={s.base} target="_blank" rel="noopener noreferrer" className="font-semibold" style={{ color: "var(--accent-ink)" }}>{s.base.replace(/^https?:\/\//, "")} ↗</a>
        {!compact && <button onClick={stop} className="text-[12px] mg-subtle" style={{ background: "none", border: 0, cursor: "pointer", textDecoration: "underline" }}>Stop</button>}
        {msg.text && <p className="w-full" style={{ color: "var(--signal-live-ink)" }}>{msg.text}</p>}
      </div>
    );
  }

  const snip = (s.snippets || []).find((x) => x.id === tab) || s.snippets?.[0];
  const mail = snip ? `mailto:?subject=${encodeURIComponent(`Please add this to ${s.host} (5 minutes)`)}&body=${encodeURIComponent(
    `Hi,\n\nPlease add this rule to ${s.host} so our articles appear at ${s.host}${s.path}. It does not change anything else on the site.\n\nWhere: ${snip.file} (${snip.label})\n\n${snip.code}\n\nThen redeploy. Thanks!`)}` : "#";

  return (
    <div className="mt-3 w-full">
      {s.state === "none" ? (
        <>
          <p className="text-[12.5px] mg-muted">Where should your articles live? Most sites use <b style={{ color: "var(--fg)" }}>/blog</b>. Pick a folder your site isn&apos;t already using.</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[13px] mg-subtle">{s.host}</span>
            <input value={path} onChange={(e) => setPath(e.target.value)} className="mg-field mg-focus" style={{ width: 140, fontSize: 13 }} aria-label="Folder" />
            <button onClick={choose} disabled={busy === "save"} className="mg-btn mg-btn--dawn disabled:opacity-60" style={btn}>{busy === "save" ? "Saving…" : "Next"}</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[12.5px] mg-muted">
            One rule on your site sends <b style={{ color: "var(--fg)" }}>{s.host}{s.path}</b> to Genie. Add it once, and every article after that appears on your own domain without anyone pasting anything.
            {" "}If someone else built your site, press <b style={{ color: "var(--fg)" }}>Email it to my developer</b>. It takes them about five minutes.
          </p>
          <div className="mt-2.5 flex gap-1.5 flex-wrap">
            {(s.snippets || []).map((x) => (
              <button key={x.id} onClick={() => setTab(x.id)} className="mg-btn" style={{ ...btn, fontSize: 12, padding: ".35rem .7rem", background: tab === x.id ? "var(--accent-quiet)" : "var(--surface-2)", border: `1px solid ${tab === x.id ? "var(--accent)" : "var(--hair)"}`, color: "var(--fg)" }}>
                {x.label}{s.hosting === x.id ? " · your site" : ""}
              </button>
            ))}
          </div>
          {snip && (
            <>
              <p className="mt-2 text-[12px] mg-subtle">Goes in: <b style={{ color: "var(--fg)" }}>{snip.file}</b></p>
              <pre className="mt-1 p-3 rounded-lg text-[11.5px]" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--fg)", overflowX: "auto", whiteSpace: "pre", maxHeight: 260 }}>{snip.code}</pre>
            </>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button onClick={async () => { try { await navigator.clipboard.writeText(snip?.code || ""); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }} className="mg-btn mg-btn--ghost" style={btn}>{copied ? "Copied" : "Copy"}</button>
            <a href={mail} className="mg-btn mg-btn--ghost" style={btn}>Email it to my developer</a>
            <button onClick={() => check(false)} disabled={busy === "check"} className="mg-btn mg-btn--dawn disabled:opacity-60" style={btn}>{busy === "check" ? "Checking…" : "It's added, check now"}</button>
            <button onClick={() => setS({ ...s, state: "none" })} className="text-[12px] mg-subtle" style={{ background: "none", border: 0, cursor: "pointer", textDecoration: "underline" }}>Change folder</button>
          </div>
          <p className="mt-1.5 text-[11.5px] mg-subtle">Genie keeps checking by itself every 30 seconds while this page is open.</p>
        </>
      )}
      {msg.text && <p className="mt-2 text-[12.5px]" style={{ color: msg.tone === "bad" ? "var(--signal-danger)" : "var(--signal-live-ink)" }}>{msg.text}</p>}
    </div>
  );
}
