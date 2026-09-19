"use client";

// app/team/page.js
// ── YOUR TEAM ──
// The three teams working for the business, live:
//   Testers   - 1,000 simulated customers who read every draft first
//   Improvers - who turn the crowd's complaints into better versions
//   Doers     - Genie's engines doing the actual work
// The globe shows them moving (busier when they are busier); each card shows a
// big real number, what the team is doing right now, and its latest work.
// Reads /api/swarm/status every 20 seconds.

import { useEffect, useRef, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import SwarmGlobe, { TEAM_COLORS } from "@/components/team/SwarmGlobe";

export default function TeamPage() {
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const j = await fetch("/api/swarm/status", { cache: "no-store" }).then((r) => r.json()); if (alive && j?.ok) setS(j); } catch {}
    };
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // How busy each team looks on the globe follows today's real work.
  const rates = s ? {
    testers: Math.min(1, (s.testers.today || 0) / 25 + (s.waiting ? 0.3 : 0.1)),
    improvers: Math.min(1, (s.improvers.today || 0) / 10 + 0.1),
    doers: Math.min(1, (s.doers.today || 0) / 30 + 0.15),
  } : { testers: 0.3, improvers: 0.2, doers: 0.3 };

  return (
    <OperatorShell active="team">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="mg-display" style={{ fontSize: "clamp(28px,3vw,37px)" }}>Your team</h1>
          <p className="mt-1.5 text-[14px] mg-muted" style={{ maxWidth: "var(--measure-wide)" }}>
            Before anything reaches you, 1,000 simulated customers test it, the improvers fix what they didn&apos;t like, and the doers get the work done. Every number here is counted from real work.
          </p>
        </div>
        {s && (
          <p className="text-[12.5px] mg-muted flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 99, background: s.ai ? "#2EE6C5" : "#FFB347", display: "inline-block" }} />
            {s.ai ? "Full crowd testing" : "AI busy: quick checks now, full tests when it's back"}
            {s.waiting ? <> · {s.waiting} waiting</> : null}
          </p>
        )}
      </div>

      <div className="mt-5"><SwarmGlobe rates={rates} /></div>

      <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <TeamCard
          color={TEAM_COLORS.testers} name="Testers" what="Simulated customers reading every draft"
          big={s?.testers.people} bigLabel="customer reactions"
          stats={s ? [[s.testers.items, "items tested"], [s.testers.today, "today"]] : []}
          live={s?.testers.feed?.[0]} verb="Testing"
          feed={s?.testers.feed} idle={s?.waiting ? `${s.waiting} drafts waiting for the crowd` : "Waiting for the next drafts"}
        />
        <TeamCard
          color={TEAM_COLORS.improvers} name="Improvers" what="Turning complaints into better versions"
          big={s?.improvers.fixed} bigLabel="drafts improved"
          stats={s ? [[s.improvers.tickets, "complaints raised"], [s.improvers.gain ? `+${s.improvers.gain}` : "0", "avg score gain"]] : []}
          live={s?.improvers.feed?.[0]} verb="Improved"
          feed={s?.improvers.feed} idle="Nothing needed fixing yet"
        />
        <TeamCard
          color={TEAM_COLORS.doers} name="Doers" what="Genie's engines doing the actual work"
          big={s?.doers.jobs} bigLabel="jobs done"
          stats={s ? [[s.doers.today, "in the last 24h"]] : []}
          live={s?.doers.feed?.[0]} verb="Did"
          feed={s?.doers.feed} idle="Next run tonight"
        />
      </div>

      <p className="mt-6 mb-2 text-center text-[12px] mg-subtle">The crowd is a prediction, not real people. Genie checks its predictions against real replies, clicks and rankings.</p>
    </OperatorShell>
  );
}

function TeamCard({ color, name, what, big, bigLabel, stats, live, verb, feed, idle }) {
  const fresh = live && Date.now() - Date.parse(live.at) < 15 * 60 * 1000;
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--hair)", boxShadow: `inset 0 3px 0 ${color}` }}>
      <div className="flex items-center gap-2">
        <span style={{ width: 10, height: 10, borderRadius: 99, background: color, boxShadow: `0 0 12px ${color}` }} />
        <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{name}</p>
      </div>
      <p className="mt-0.5 text-[12.5px] mg-muted">{what}</p>

      <p className="mt-4 mg-num font-bold tracking-tight" style={{ fontSize: 44, lineHeight: 1, color: "var(--fg)" }}><CountUp value={big} /></p>
      <p className="text-[12.5px] mg-subtle mt-1">{bigLabel}</p>

      {stats.length > 0 && (
        <div className="mt-3 flex gap-5">
          {stats.map(([n, l]) => (
            <div key={l}><p className="mg-num text-[16px] font-bold" style={{ color: "var(--fg)" }}>{typeof n === "number" ? n.toLocaleString() : n}</p><p className="text-[11.5px] mg-subtle">{l}</p></div>
          ))}
        </div>
      )}

      {/* The live line: what this team is doing right now. */}
      <div className="mt-4 rounded-xl p-3 flex items-start gap-2.5" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
        <span className={fresh ? "tm-pulse" : ""} style={{ marginTop: 5, width: 8, height: 8, borderRadius: 99, background: fresh ? color : "var(--fg-subtle)", flexShrink: 0, color }} />
        <p className="text-[12.5px] leading-snug" style={{ color: "var(--fg)" }}>
          {live ? <><b>{fresh ? `${verb} now` : `Last: ${ago(live.at)}`}</b> · {live.text}</> : <span className="mg-subtle">{idle}</span>}
        </p>
      </div>

      {feed?.length > 1 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {feed.slice(1, 5).map((f, i) => (
            <li key={i} className="text-[12px] mg-muted flex gap-2">
              <span className="mg-subtle shrink-0" style={{ width: 52 }}>{ago(f.at)}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.text}</span>
            </li>
          ))}
        </ul>
      )}
      <style>{`@keyframes tmPulse{0%{box-shadow:0 0 0 0 currentColor}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}.tm-pulse{animation:tmPulse 1.6s infinite}@media (prefers-reduced-motion:reduce){.tm-pulse{animation:none}}`}</style>
    </div>
  );
}

function CountUp({ value }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null) return;
    const start = from.current, end = Number(value) || 0, t0 = performance.now();
    let raf;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 900);
      setShown(Math.round(start + (end - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return value == null ? "—" : shown.toLocaleString();
}

function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
