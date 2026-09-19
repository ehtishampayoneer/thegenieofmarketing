// lib/swarm/ticker.js
// ── THE FLOOR ──
// The team page is meant to read like a trading floor: you look at it and you
// can see what the crowd is arguing about right now, what the improvers are
// rewriting because of it, and what the doers are shipping. A score on its own
// ("78/100") says nothing, so every test is broken out into the lines a person
// would actually want overheard:
//
//   result     1,000 people read "…"               78/100
//   argument   312 of 1,000 said: no proof
//   quote      "Every AR tool says this…" — Sceptical buyer
//   blocked    the gatekeeper who would not pass it
//
// Improvers add the rewrite and what it moved the score to; doers add the real
// work Genie logged. Everything here comes from records — nothing is invented,
// and when there is nothing, the feed is empty rather than filled with theatre.

import { IMPROVERS, DOERS } from "@/lib/swarm/live";

const n = (x) => Number(x || 0).toLocaleString();
const clip = (s, len) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > len ? `${t.slice(0, len - 1)}…` : t; };
const strip = (s) => clip(String(s || "").replace(/^Launch test:\s*/i, ""), 64);

/**
 * One merged, newest-first feed for all three teams.
 *   tested   - swarm.tested events   { subject, created_at, data:{ score, size, objections[], quotes[], … } }
 *   improved - swarm.improved events { subject, created_at, data:{ from, to, tickets[], changed } }
 *   activity - activity rows         { verb, message, icon, created_at }
 * Rows from one event share its timestamp and are kept in reading order by `seq`.
 */
export function tickerFrom({ tested = [], improved = [], activity = [], limit = 60 } = {}) {
  const rows = [];
  const push = (r) => rows.push(r);

  for (const e of tested) {
    const d = e.data || {};
    const at = e.created_at;
    const title = strip(e.subject);
    const size = Number(d.size) || 1000;
    const quick = d.mode === "rules";
    push({
      id: `${e.id}:r`, team: "testers", at, seq: 0, kind: "result",
      text: `${n(size)} ${quick ? "checked" : "read"} “${title}”`,
      value: Number.isFinite(d.score) ? `${d.score}/100` : null,
      tone: d.score >= 65 ? "up" : d.score >= 45 ? "flat" : "down",
      sub: quick ? "Quick check — every free AI was busy, so the rules judge ran it" : Number.isFinite(d.act) ? `${d.act}% said they would act on it` : null,
    });
    // What they argued about. This is the part owners actually learn from.
    (d.objections || []).slice(0, 2).forEach((o, i) => {
      if (!o?.tag) return;
      push({
        id: `${e.id}:o${i}`, team: "testers", at, seq: 1 + i, kind: "argument",
        text: `${n(o.count)} of ${n(size)} said: ${o.tag}`, tone: "down",
      });
    });
    (d.quotes || []).slice(0, 2).forEach((q, i) => {
      if (!q?.q) return;
      push({ id: `${e.id}:q${i}`, team: "testers", at, seq: 3 + i, kind: "quote", text: `“${clip(q.q, 150)}”`, who: q.who || "", tone: "flat" });
    });
    if (d.blocked) push({ id: `${e.id}:g`, team: "testers", at, seq: 5, kind: "blocked", text: `${d.blocked} would not let this through`, tone: "down" });
  }

  for (const e of improved) {
    const d = e.data || {};
    const tags = d.tickets || [];
    const who = IMPROVERS.find((r) => tags.some((t) => r.tags.includes(t)))?.name || "Angle finder";
    const delta = (Number(d.to) || 0) - (Number(d.from) || 0);
    push({
      id: `${e.id}:i`, team: "improvers", at: e.created_at, seq: 0, kind: "fix",
      text: `${who} rewrote “${strip(e.subject)}”`,
      value: `${d.from} → ${d.to}`, delta: delta > 0 ? `+${delta}` : String(delta), tone: delta > 0 ? "up" : "down",
      sub: d.changed ? clip(d.changed, 140) : tags.length ? `Fixed: ${tags.slice(0, 2).join(", ")}` : null,
    });
  }

  for (const a of activity) {
    const d = DOERS.find((x) => x.verbs.includes(a.verb)) || DOERS.find((x) => x.id === "ops");
    push({ id: `a:${a.id || a.created_at}:${a.verb}`, team: "doers", at: a.created_at, seq: 0, kind: "work", who: d?.name || "Operations", text: clip(a.message, 160), tone: "flat" });
  }

  rows.sort((a, b) => (Date.parse(b.at) - Date.parse(a.at)) || (a.seq - b.seq));
  return rows.slice(0, limit);
}

/**
 * The thin tape along the top: the last scores, like prices. One entry per test,
 * with the improvers' gain shown as the move.
 */
export function tapeFrom({ tested = [], improved = [], limit = 14 } = {}) {
  const gain = new Map();
  for (const e of improved) { const id = e.data?.itemId; if (id && !gain.has(id)) gain.set(id, (Number(e.data.to) || 0) - (Number(e.data.from) || 0)); }
  return tested.slice(0, limit).map((e) => {
    const d = e.data || {};
    const g = gain.get(d.itemId) || 0;
    return {
      id: e.id, label: String(d.kind || "item").replace(/_/g, " ").toUpperCase(),
      title: strip(e.subject), score: Number.isFinite(d.score) ? d.score : null,
      move: g > 0 ? `+${g}` : null, tone: d.score >= 65 ? "up" : d.score >= 45 ? "flat" : "down",
    };
  });
}
