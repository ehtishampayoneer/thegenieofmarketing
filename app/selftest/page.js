"use client";

// app/selftest/page.js
// Runs every live check (lib/selftest.js) against the real deployment and shows
// the result as each lands. "Copy report" produces plain text to send to a
// developer, because a screenshot of a long page loses the details.

import { useEffect, useMemo, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import Icon from "@/components/ui/Icon";
import { Card } from "@/components/ui/v2/primitives";

const TONE = {
  pass: { icon: "✓", color: "var(--signal-live-ink)", bg: "var(--signal-live-soft)", label: "Pass" },
  warn: { icon: "!", color: "var(--signal-warn-ink)", bg: "var(--signal-warn-soft)", label: "Check" },
  fail: { icon: "✕", color: "var(--signal-danger)", bg: "var(--signal-danger-soft)", label: "Fail" },
  skip: { icon: "–", color: "var(--fg-subtle)", bg: "var(--surface-2)", label: "Skipped" },
  running: { icon: "…", color: "var(--accent-ink)", bg: "var(--accent-quiet)", label: "Running" },
  idle: { icon: "", color: "var(--fg-subtle)", bg: "transparent", label: "Not run" },
};
// Two at a time: enough to finish in a few minutes, few enough that the free AI
// tiers are not rate limited by the test itself (which would fail checks falsely).
const PARALLEL = 2;

export default function SelfTestPage() {
  const [checks, setChecks] = useState([]);
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [sendTestEmail, setSendTestEmail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [who, setWho] = useState(null);

  useEffect(() => {
    fetch("/api/selftest", { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (j?.ok) { setChecks(j.checks); setWho({ account: j.account, business: j.business }); } else setErr("Sign in to run the self-test."); })
      .catch(() => setErr("Could not load the checks."));
  }, []);

  async function runOne(id) {
    setResults((r) => ({ ...r, [id]: { status: "running" } }));
    try {
      const res = await fetch("/api/selftest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check: id, sendTestEmail }) });
      const j = await res.json().catch(() => null);
      setResults((r) => ({ ...r, [id]: j?.ok ? j : { status: "fail", summary: `The request failed (HTTP ${res.status}).`, fix: res.status === 504 ? "The server timed out. Run this check again." : "Send this report to your developer." } }));
    } catch {
      setResults((r) => ({ ...r, [id]: { status: "fail", summary: "Lost connection while running.", fix: "Run it again." } }));
    }
  }

  async function runAll() {
    if (running) return;
    setRunning(true); setResults({});
    const queue = checks.map((c) => c.id);
    await Promise.all(Array.from({ length: PARALLEL }, async () => { while (queue.length) await runOne(queue.shift()); }));
    setRunning(false);
  }

  const groups = useMemo(() => {
    const g = [];
    for (const c of checks) { let x = g.find((y) => y.name === c.group); if (!x) g.push((x = { name: c.group, items: [] })); x.items.push(c); }
    return g;
  }, [checks]);

  const counts = useMemo(() => {
    const n = { pass: 0, warn: 0, fail: 0, skip: 0 };
    for (const r of Object.values(results)) if (n[r.status] != null) n[r.status]++;
    return n;
  }, [results]);
  const done = Object.values(results).filter((r) => r.status !== "running").length;

  function report() {
    const lines = [`Marketing Genie self-test · ${new Date().toLocaleString()}`, `Account: ${who?.account || "?"} · Business: ${who?.business || "none scanned"}`,`Pass ${counts.pass} · Check ${counts.warn} · Fail ${counts.fail} · Skipped ${counts.skip}`, ""];
    for (const g of groups) {
      lines.push(`## ${g.name}`);
      for (const c of g.items) {
        const r = results[c.id];
        if (!r) { lines.push(`[ not run ] ${c.label}`); continue; }
        lines.push(`[${(TONE[r.status]?.label || r.status).toUpperCase()}] ${c.label}: ${r.summary || ""}${r.ms ? ` (${(r.ms / 1000).toFixed(1)}s)` : ""}`);
        if (r.fix) lines.push(`    fix: ${r.fix}`);
        if (r.details) lines.push(`    details: ${JSON.stringify(r.details).slice(0, 600)}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  async function copy() {
    try { await navigator.clipboard.writeText(report()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  return (
    <OperatorShell active="diagnostics">
      <OperatorHeader
        icon={Icon.check}
        label="Self-test"
        title="Every part of Genie, tested for real."
        kicker="On the live site, with your real keys. It never emails, publishes or posts anything."
        action={(
          <div className="flex items-center gap-2 flex-wrap">
            {done > 0 && <button onClick={copy} className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}>{copied ? "Copied" : "Copy report"}</button>}
            <button onClick={runAll} disabled={running || !checks.length} className="mg-btn mg-btn--dawn disabled:opacity-60" style={{ fontSize: 13 }}>
              {running ? `Running… ${done}/${checks.length}` : done ? "Run again" : "Run all checks"}
            </button>
          </div>
        )}
      />

      {who && (
        <p className="mt-3 text-[13px]" style={{ color: "var(--fg-muted)" }}>
          Testing account <b style={{ color: "var(--fg)" }}>{who.account}</b>
          {who.business ? <> · business <b style={{ color: "var(--fg)" }}>{who.business}</b></> : <span style={{ color: "var(--signal-warn-ink)" }}> · no business scanned on this account</span>}
        </p>
      )}

      <label className="mt-4 flex items-center gap-2 text-[13px]" style={{ color: "var(--fg-muted)", cursor: "pointer", width: "fit-content" }}>
        <input type="checkbox" checked={sendTestEmail} onChange={(e) => setSendTestEmail(e.target.checked)} disabled={running} />
        Send a test email to myself, to prove Gmail sending works
      </label>

      {err && <p className="mt-4 text-[13px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}

      {done > 0 && (
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5" style={{ maxWidth: 640 }}>
          {["pass", "warn", "fail", "skip"].map((k) => (
            <div key={k} className="mg-surface-quiet py-2.5 px-3">
              <p className="mg-num text-[20px] font-bold" style={{ color: TONE[k].color }}>{counts[k]}</p>
              <p className="text-[11px] mg-subtle mt-0.5">{TONE[k].label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {groups.map((g) => (
          <Card key={g.name} className="p-0 overflow-hidden">
            <p className="px-4 py-3 text-[12px] font-semibold uppercase" style={{ letterSpacing: ".08em", color: "var(--fg-subtle)", borderBottom: "1px solid var(--hair)" }}>{g.name}</p>
            {g.items.map((c, i) => {
              const r = results[c.id];
              const t = TONE[r?.status || "idle"];
              return (
                <div key={c.id} className="px-4 py-3 flex items-start gap-3" style={{ borderTop: i ? "1px solid var(--hair)" : "none" }}>
                  <span aria-label={t.label} className="shrink-0 flex items-center justify-center text-[12px] font-bold" style={{ width: 22, height: 22, borderRadius: 99, marginTop: 1, color: t.color, background: t.bg, border: r ? "none" : "1px solid var(--hair)" }}>{t.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>{c.label}</p>
                      {r?.ms != null && <span className="mg-num text-[11px] mg-subtle">{(r.ms / 1000).toFixed(1)}s</span>}
                    </div>
                    {r?.summary && <p className="text-[13px] mt-0.5" style={{ color: "var(--fg-muted)", overflowWrap: "anywhere" }}>{r.summary}</p>}
                    {r?.fix && <p className="text-[13px] mt-1" style={{ color: t.color, overflowWrap: "anywhere" }}>→ {r.fix}</p>}
                  </div>
                  {!running && r && r.status !== "running" && (
                    <button onClick={() => runOne(c.id)} className="shrink-0 text-[12px] font-semibold" style={{ color: "var(--accent-ink)", background: "none", border: 0, cursor: "pointer" }}>Rerun</button>
                  )}
                </div>
              );
            })}
          </Card>
        ))}
      </div>
    </OperatorShell>
  );
}
