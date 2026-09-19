"use client";

// app/team/page.js
// ── YOUR TEAM ──
// The three teams working for the business, live:
//   Testers   - 1,000 simulated customers who read every draft first
//   Improvers - who turn the crowd's complaints into better versions
//   Doers     - Genie's engines doing the actual work
// The globe shows them moving, and never stops: they work around the clock, so
// the picture of them does too. Under it, the floor — a live feed of what the
// crowd argued about, in their own words, what the improvers rewrote because of
// it, and what the doers shipped. Every line comes from a record.
// Reads /api/swarm/status every 8 seconds.

import { useEffect, useRef, useState } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import SwarmGlobe, { TEAM_COLORS } from "@/components/team/SwarmGlobe";
import OperatorHeader from "@/components/shell/v2/OperatorHeader";
import LaunchTest from "@/components/team/LaunchTest";
import Icon from "@/components/ui/Icon";

export default function TeamPage() {
  const [s, setS] = useState(null);
  // Two views of the same crowd: what it is doing on its own, and the same crowd
  // pointed at one thing on demand. Deep links (/team?tab=test, and the old
  // /test-launch address) land straight on the right one.
  const [tab, setTab] = useState("live");
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get("tab") === "test") setTab("test"); } catch {}
  }, []);
  // A live page polls, but only while someone is actually looking at it, and it
  // gives up if the answer is "not signed in" rather than hammering the server.
  useEffect(() => {
    let alive = true, stop = false;
    const load = async () => {
      if (stop || document.hidden) return;
      try {
        const res = await fetch("/api/swarm/status", { cache: "no-store" });
        if (res.status === 401) { stop = true; return; }
        const j = await res.json();
        if (alive && j?.ok) setS(j);
      } catch {}
    };
    load();
    const t = setInterval(load, 8000);
    document.addEventListener("visibilitychange", load);
    return () => { alive = false; stop = true; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, []);

  // How busy each team looks on the globe follows today's real work.
  const rates = s ? {
    testers: Math.min(1, (s.testers.today || 0) / 25 + (s.waiting ? 0.3 : 0.1)),
    improvers: Math.min(1, (s.improvers.today || 0) / 10 + 0.1),
    doers: Math.min(1, (s.doers.today || 0) / 30 + 0.15),
  } : { testers: 0.3, improvers: 0.2, doers: 0.3 };

  return (
    <OperatorShell active="team">
      <OperatorHeader
        icon={Icon.globe}
        label="Your team"
        title={tab === "test" ? "Try it on 1,000 customers first." : "Nothing reaches you untested."}
        kicker={tab === "test"
          ? "The same crowd that reads every draft overnight, pointed at one thing on demand."
          : "1,000 simulated customers, 7 improvers and 9 engines. Every number counted from real work."}
        action={s && tab === "live" && (
          <span className="text-[12.5px] mg-muted flex items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: 99, background: s.ai ? "#2EE6C5" : "#FFB347", display: "inline-block" }} />
            {s.ai ? "Full crowd testing" : "AI busy: quick checks now"}
            {s.waiting ? <> · {s.waiting} waiting</> : null}
          </span>
        )}
      />

      {/* The two views of the crowd. */}
      <div className="mt-5 flex items-center gap-1" style={{ borderBottom: "1px solid var(--hair)" }}>
        {[["live", "What it is doing"], ["test", "Test something"]].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); try { history.replaceState(null, "", id === "test" ? "/team?tab=test" : "/team"); } catch {} }}
            className="mg-focus" style={{
              background: "none", border: 0, cursor: "pointer", padding: "9px 14px", fontSize: 13.5, fontWeight: 600,
              color: tab === id ? "var(--fg)" : "var(--fg-subtle)",
              borderBottom: `2px solid ${tab === id ? "var(--accent)" : "transparent"}`, marginBottom: -1,
            }}>{label}</button>
        ))}
      </div>

      {tab === "live" && <Tape rows={s?.tape} />}

      {tab === "test" ? <LaunchTest /> : (
      <div className="mt-6 tm-layout">
      <div className="tm-main min-w-0">
      <div><SwarmGlobe height="clamp(360px, 46vh, 540px)" rates={rates} counts={s?.live ? { testers: s.live.testers.active, improvers: s.live.improvers.active, doers: s.live.doers.active } : null} /></div>

      <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <TeamCard
          color={TEAM_COLORS.testers} name="Testers" what="Simulated customers reading every draft"
          big={s?.testers.people} bigLabel="customer reactions"
          stats={s ? [[s.testers.items, "items tested"], [s.testers.today, "today"]] : []}
          live={s?.testers.feed?.[0]} verb="Testing"
          idle={s?.waiting ? `${s.waiting} drafts waiting for the crowd` : "Waiting for the next drafts"}
        />
        <TeamCard
          color={TEAM_COLORS.improvers} name="Improvers" what="Turning complaints into better versions"
          big={s?.improvers.fixed} bigLabel="drafts improved"
          stats={s ? [[s.improvers.tickets, "complaints raised"], [s.improvers.gain ? `+${s.improvers.gain}` : "0", "avg score gain"]] : []}
          live={s?.improvers.feed?.[0]} verb="Improved"
          idle="Nothing needed fixing yet"
        />
        <TeamCard
          color={TEAM_COLORS.doers} name="Doers" what="Genie's engines doing the actual work"
          big={s?.doers.jobs} bigLabel="jobs done"
          stats={s ? [[s.doers.today, "in the last 24h"]] : []}
          live={s?.doers.feed?.[0]} verb="Did"
          idle="Next run tonight"
        />
      </div>

      <Floor rows={s?.ticker} waiting={s?.waiting} ai={s?.ai} loaded={!!s} />

      {/* The learning period: how long before the crowd's scores can be trusted. */}
      {s?.learning && (
        <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--hair)" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>{s.learning.done ? "Crowd calibrated" : "Learning period"}</p>
            <p className="text-[12.5px] mg-subtle mg-num">Day {Math.min(s.learning.day, s.learning.days)} of {s.learning.days} · {s.learning.results} of {s.learning.need} real results</p>
          </div>
          <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
            <div className="h-2 rounded-full" style={{ width: `${s.learning.pct}%`, background: s.learning.done ? "var(--signal-live)" : "linear-gradient(90deg,#2EE6C5,#FFB347,#A78BFA)" }} />
          </div>
          <p className="mt-2 text-[13px] mg-muted">{s.learning.text}</p>
        </div>
      )}

      {/* The reality check: the crowd's predictions against what really happened. */}
      <div className="mt-4 rounded-2xl p-4 flex items-start gap-3" style={{ background: "var(--surface)", border: "1px solid var(--hair)" }}>
        <span style={{ marginTop: 4, width: 10, height: 10, borderRadius: 99, background: s?.reality?.verdict === "predictive" ? "var(--signal-live)" : s?.reality?.verdict === "wrong" ? "var(--signal-danger)" : "var(--fg-subtle)", flexShrink: 0 }} />
        <div>
          <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>Reality check</p>
          <p className="text-[13px] mg-muted mt-0.5">
            {s?.reality?.text || "Every night Genie compares what the crowd predicted with real replies and real post results, and gives more say to the kinds of people who called it right. The first check runs after tonight's run."}
          </p>
        </div>
      </div>

      </div>
      <LivePanel live={s?.live} />
      </div>
      )}

      <p className="mt-6 mb-2 text-center text-[12px] mg-subtle">The crowd is a prediction, not real people. Genie checks its predictions against real replies, clicks and rankings.</p>
      <style>{`.tm-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;align-items:start}@media (min-width:1180px){.tm-layout{grid-template-columns:minmax(0,1fr) 300px}.tm-live{position:sticky;top:84px}}`}</style>
    </OperatorShell>
  );
}

function TeamCard({ color, name, what, big, bigLabel, stats, live, verb, idle }) {
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

      <style>{`@keyframes tmPulse{0%{box-shadow:0 0 0 0 currentColor}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}.tm-pulse{animation:tmPulse 1.6s infinite}@media (prefers-reduced-motion:reduce){.tm-pulse{animation:none}}`}</style>
    </div>
  );
}

// ── THE TAPE ──
// A trading tape along the top: the last things the crowd scored, and what the
// improvers moved them to. It is the quickest read on the page — glance at it
// and you know whether today's work is landing.
function Tape({ rows }) {
  if (!rows?.length) return null;
  // Rendered twice so the strip can scroll forever without a seam.
  const run = rows.concat(rows);
  return (
    <div className="mt-4 tk-tape" style={{ background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 12, overflow: "hidden" }}>
      <div className="tk-tape-run">
        {run.map((r, i) => (
          <span key={`${r.id}-${i}`} className="tk-tape-item">
            <span className="tk-tape-label">{r.label}</span>
            <span className="tk-tape-title">{r.title}</span>
            {r.score != null && <b className="mg-num" style={{ color: toneColor(r.tone) }}>{r.score}</b>}
            {r.move && <span className="mg-num" style={{ color: "var(--signal-live)", fontSize: 12 }}>▲{r.move}</span>}
          </span>
        ))}
      </div>
      <style>{`
        .tk-tape-run{display:flex;width:max-content;animation:tkTape 80s linear infinite}
        .tk-tape:hover .tk-tape-run{animation-play-state:paused}
        .tk-tape-item{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;font-size:12.5px;white-space:nowrap;border-right:1px solid var(--hair);color:var(--fg)}
        .tk-tape-label{font-size:10.5px;letter-spacing:.08em;color:var(--fg-subtle);font-weight:700}
        .tk-tape-title{color:var(--fg-muted);max-width:280px;overflow:hidden;text-overflow:ellipsis}
        @keyframes tkTape{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @media (prefers-reduced-motion:reduce){.tk-tape-run{animation-duration:320s}}
      `}</style>
    </div>
  );
}

// ── THE FLOOR ──
// What the three teams are doing, as it happens. A score on its own tells an
// owner nothing; what their buyers argued about, in the buyers' own words, is
// the thing worth watching. So every test becomes several lines — the result,
// the objections that spread, two quotes, and the gatekeeper if it blocked it —
// interleaved with the improvers' rewrites and the doers' real jobs.
// New lines arrive highlighted. Nothing here is invented: an empty floor means
// the teams have not run yet, and it says so.
function Floor({ rows, waiting, ai, loaded }) {
  const [team, setTeam] = useState("all");
  // Anything that was not on screen last poll gets the arrival flash.
  const seen = useRef(null);
  const [fresh, setFresh] = useState(() => new Set());
  useEffect(() => {
    if (!rows) return;
    const ids = new Set(rows.map((r) => r.id));
    if (seen.current) {
      const added = rows.filter((r) => !seen.current.has(r.id)).map((r) => r.id);
      if (added.length) {
        setFresh(new Set(added));
        seen.current = ids;
        const t = setTimeout(() => setFresh(new Set()), 2600);
        return () => clearTimeout(t);
      }
    }
    seen.current = ids;
  }, [rows]);

  const shown = (rows || []).filter((r) => team === "all" || r.team === team);
  const tabs = [["all", "Everything"], ["testers", "Testers"], ["improvers", "Improvers"], ["doers", "Doers"]];

  return (
    <div className="mt-5 rounded-2xl" style={{ background: "var(--surface)", border: "1px solid var(--hair)", overflow: "hidden" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--hair)" }}>
        <div>
          <p className="text-[15px] font-bold flex items-center gap-2" style={{ color: "var(--fg)" }}>
            <span className="tm-pulse" style={{ width: 9, height: 9, borderRadius: 99, background: "var(--signal-live)", color: "var(--signal-live)" }} />
            The floor
          </p>
          <p className="mt-0.5 text-[12.5px] mg-muted">Everything your teams are saying and doing, newest first.</p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTeam(id)} className="mg-focus" style={{
              background: team === id ? "var(--surface-2)" : "none", border: `1px solid ${team === id ? "var(--hair)" : "transparent"}`,
              borderRadius: 999, padding: "5px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              color: team === id ? "var(--fg)" : "var(--fg-subtle)",
            }}>
              {id !== "all" && <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: TEAM_COLORS[id], marginRight: 6 }} />}
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul style={{ maxHeight: 520, overflowY: "auto", margin: 0, padding: 0, listStyle: "none" }}>
        {shown.map((r) => (
          <li key={r.id} className={fresh.has(r.id) ? "tk-row tk-new" : "tk-row"} style={{ borderLeft: `3px solid ${TEAM_COLORS[r.team]}` }}>
            <span className="tk-time mg-num">{ago(r.at)}</span>
            <span className="tk-body">
              {r.kind === "quote" ? (
                <>
                  <i style={{ color: "var(--fg)" }}>{r.text}</i>
                  {r.who && <span className="mg-subtle"> — {r.who}</span>}
                </>
              ) : (
                <>
                  {r.who && <b style={{ color: "var(--fg)" }}>{r.who} · </b>}
                  <span style={{ color: r.kind === "argument" ? "var(--fg-muted)" : "var(--fg)" }}>{r.text}</span>
                </>
              )}
              {r.sub && <span className="block text-[12px] mg-subtle mt-0.5">{r.sub}</span>}
            </span>
            {(r.value || r.delta) && (
              <span className="tk-val mg-num">
                <b style={{ color: toneColor(r.tone) }}>{r.value}</b>
                {r.delta && <span style={{ color: "var(--signal-live)", fontSize: 11.5, marginLeft: 6 }}>{r.delta}</span>}
              </span>
            )}
          </li>
        ))}
        {!shown.length && (
          <li className="px-5 py-8 text-[13px] mg-muted" style={{ maxWidth: "var(--measure)" }}>
            {!loaded ? "Reading the floor…"
              : waiting ? `Nothing yet today. ${waiting} draft${waiting === 1 ? "" : "s"} are queued — the crowd reads them on tonight's run, and every word of the argument lands here.`
              : ai ? "Nothing yet. The moment Genie writes something, 1,000 customers read it and you will see exactly what they said, here."
              : "Every free AI is busy right now, so the testers are running quick rule checks. The full crowd resumes as soon as one frees up."}
          </li>
        )}
      </ul>
      <style>{`
        .tk-row{display:flex;align-items:flex-start;gap:12px;padding:10px 16px;border-bottom:1px solid var(--hair);font-size:13px;line-height:1.45}
        .tk-row:last-child{border-bottom:0}
        .tk-time{flex:0 0 58px;color:var(--fg-subtle);font-size:11.5px;padding-top:2px}
        .tk-body{flex:1 1 auto;min-width:0}
        .tk-val{flex:0 0 auto;font-size:14px;font-weight:700;padding-top:1px;white-space:nowrap}
        .tk-new{animation:tkIn 2.6s ease-out}
        @keyframes tkIn{0%{background:color-mix(in srgb, var(--accent) 22%, transparent);transform:translateY(-4px)}100%{background:transparent;transform:none}}
        @media (prefers-reduced-motion:reduce){.tk-new{animation:none}}
      `}</style>
    </div>
  );
}

const toneColor = (t) => (t === "up" ? "var(--signal-live)" : t === "down" ? "var(--signal-danger)" : "var(--fg)");

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

// ── LIVE NOW ──
// The three teams as a contact list: who is working right now (green dot),
// who is on standby, and how many bots each team has active. "Active" means it
// did real work in the last 15 minutes.
function LivePanel({ live }) {
  const [open, setOpen] = useState({ testers: false, improvers: true, doers: true });
  if (!live) return <aside className="tm-live rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--hair)" }}><p className="text-[13px] mg-subtle">Loading the team…</p></aside>;
  const groups = [
    { key: "testers", name: "Testers", color: TEAM_COLORS.testers, active: live.testers.active, total: live.testers.total,
      rows: live.testers.kinds.map((k) => ({ name: k.name, sub: `${k.count} in the crowd`, on: k.active })) },
    { key: "improvers", name: "Improvers", color: TEAM_COLORS.improvers, active: live.improvers.active, total: live.improvers.total,
      rows: live.improvers.list.map((r) => ({ name: r.name, sub: r.active ? "Fixing a draft now" : r.last ? `Last fix ${ago(r.last)}` : r.does, on: r.active })) },
    { key: "doers", name: "Doers", color: TEAM_COLORS.doers, active: live.doers.active, total: live.doers.total,
      rows: live.doers.list.map((d) => ({ name: d.name, sub: d.active ? d.doing : d.last ? `Last: ${ago(d.last)}` : d.does, on: d.active })) },
  ];
  return (
    <aside className="tm-live rounded-2xl" style={{ background: "var(--surface)", border: "1px solid var(--hair)", overflow: "hidden" }}>
      <div className="p-4" style={{ borderBottom: "1px solid var(--hair)" }}>
        <p className="text-[14px] font-bold flex items-center gap-2" style={{ color: "var(--fg)" }}>
          <span className={live.activeBots ? "tm-pulse" : ""} style={{ width: 9, height: 9, borderRadius: 99, background: live.activeBots ? "var(--signal-live)" : "var(--fg-subtle)", color: "var(--signal-live)" }} />
          Live now
        </p>
        <p className="mg-num mt-1" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: "var(--fg)" }}>{live.activeBots.toLocaleString()}</p>
        <p className="text-[12px] mg-subtle">bots working right now</p>
      </div>
      <div style={{ maxHeight: 560, overflowY: "auto" }}>
        {groups.map((g) => (
          <div key={g.key} style={{ borderBottom: "1px solid var(--hair)" }}>
            <button onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))} className="w-full flex items-center gap-2 px-4 py-3" style={{ background: "none", border: 0, cursor: "pointer", textAlign: "left" }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, background: g.color, boxShadow: g.active ? `0 0 10px ${g.color}` : "none", opacity: g.active ? 1 : 0.45 }} />
              <span className="text-[13.5px] font-semibold flex-1" style={{ color: "var(--fg)" }}>{g.name}</span>
              <span className="mg-num text-[12px]" style={{ color: g.active ? "var(--fg)" : "var(--fg-subtle)" }}>{g.active.toLocaleString()} / {g.total.toLocaleString()} active</span>
            </button>
            {open[g.key] && (
              <ul className="pb-2">
                {g.rows.length ? g.rows.map((r, i) => (
                  <li key={i} className="px-4 py-1.5 flex items-start gap-2.5">
                    <span style={{ marginTop: 5, width: 7, height: 7, borderRadius: 99, flexShrink: 0, background: r.on ? "var(--signal-live)" : "var(--hair)" }} />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium" style={{ color: "var(--fg)" }}>{r.name}</span>
                      {r.sub && <span className="block text-[11.5px] mg-subtle" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 230 }}>{r.sub}</span>}
                    </span>
                  </li>
                )) : <li className="px-4 py-1.5 text-[12px] mg-subtle">The crowd is built with the first test.</li>}
              </ul>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
