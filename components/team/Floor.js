"use client";

// components/team/Floor.js
// ── THE FLOOR ──
// What the three teams are doing, as it happens — on Today and on Your team,
// from one implementation so the two can never drift apart.
//
// A score on its own tells an owner nothing; what their buyers argued about, in
// the buyers' own words, is the thing worth watching. So every test arrives as
// several lines (the result, the objections that spread, two quotes, and the
// gatekeeper if it blocked it), interleaved with the improvers' rewrites and the
// doers' real jobs. New lines arrive highlighted.
//
// Nothing here is invented: an empty floor means the teams have not run yet, and
// it says so. Rows come from /api/swarm/status (lib/swarm/ticker.js).

import { useEffect, useRef, useState } from "react";
import { TEAM_COLORS } from "@/components/team/SwarmGlobe";

export const toneColor = (t) => (t === "up" ? "var(--signal-live)" : t === "down" ? "var(--signal-danger)" : "var(--fg)");

export function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// ── THE TAPE ──
// A trading tape along the top: the last things the crowd scored, and what the
// improvers moved them to. The quickest read on the page — glance at it and you
// know whether today's work is landing.
export function Tape({ rows }) {
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

/**
 * The feed itself.
 *   rows    - the ticker from /api/swarm/status
 *   limit   - how many lines to show (Today shows fewer than Your team)
 *   filters - the team chips; off on Today, where space is tighter
 *   more    - a link to the full floor
 */
export function Floor({ rows, waiting, ai, loaded, limit = 80, filters = true, height = 520, title = "The floor", note = "Everything your teams are saying and doing, newest first.", more = null }) {
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

  const shown = (rows || []).filter((r) => team === "all" || r.team === team).slice(0, limit);
  const tabs = [["all", "Everything"], ["testers", "Testers"], ["improvers", "Improvers"], ["doers", "Doers"]];

  return (
    <div className="rounded-2xl" style={{ background: "var(--surface)", border: "1px solid var(--hair)", overflow: "hidden" }}>
      <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--hair)" }}>
        <div>
          <p className="text-[15px] font-bold flex items-center gap-2" style={{ color: "var(--fg)" }}>
            <span className="tm-pulse" style={{ width: 9, height: 9, borderRadius: 99, background: "var(--signal-live)", color: "var(--signal-live)" }} />
            {title}
          </p>
          <p className="mt-0.5 text-[12.5px] mg-muted">{note}</p>
        </div>
        {filters ? (
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
        ) : more && <a href={more} className="text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>See everything →</a>}
      </div>

      <ul style={{ maxHeight: height, overflowY: "auto", margin: 0, padding: 0, listStyle: "none" }}>
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
      {filters && more && (
        <div className="px-5 py-3 text-center" style={{ borderTop: "1px solid var(--hair)" }}>
          <a href={more} className="text-[13px] font-semibold mg-focus" style={{ color: "var(--accent-ink)" }}>See everything your team is doing →</a>
        </div>
      )}
      <style>{`
        .tk-row{display:flex;align-items:flex-start;gap:12px;padding:10px 16px;border-bottom:1px solid var(--hair);font-size:13px;line-height:1.45}
        .tk-row:last-child{border-bottom:0}
        .tk-time{flex:0 0 58px;color:var(--fg-subtle);font-size:11.5px;padding-top:2px}
        .tk-body{flex:1 1 auto;min-width:0}
        .tk-val{flex:0 0 auto;font-size:14px;font-weight:700;padding-top:1px;white-space:nowrap}
        .tk-new{animation:tkIn 2.6s ease-out}
        @keyframes tkIn{0%{background:color-mix(in srgb, var(--accent) 22%, transparent);transform:translateY(-4px)}100%{background:transparent;transform:none}}
        @keyframes tmPulse{0%{box-shadow:0 0 0 0 currentColor}70%{box-shadow:0 0 0 7px transparent}100%{box-shadow:0 0 0 0 transparent}}
        .tm-pulse{animation:tmPulse 1.6s infinite}
        @media (prefers-reduced-motion:reduce){.tk-new,.tm-pulse{animation:none}}
      `}</style>
    </div>
  );
}
