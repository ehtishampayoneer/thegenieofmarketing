// lib/swarm/calibrate.js
// ── THE REALITY CHECK ──
// The crowd's verdicts are predictions. This is where they meet what actually
// happened, and where the crowd learns. It is the part MiroFish does not have:
// MiroFish never finds out whether its crowd was right.
//
// Real results Genie already records:
//   • Buyer Hunt replies and community posts: the engagement tracker marks each
//     posted one "winning", "flat" or "dud" from real upvotes and comments.
//   • Get featured pitches and win-back emails: a reply in the owner's Gmail
//     (outreach_log.replied_at) is a yes; no reply after 14 days is a no.
//
// Two things are learned from them, recomputed from the full history each night
// so nothing is ever counted twice:
//   1. WHO TO LISTEN TO. Each kind of person in the crowd said how much they
//      liked each item. People whose enthusiasm matched real success get more say
//      (up to twice the weight); people who liked the flops get less (down to
//      half). Only outcomes from the current crowd count, since a rebuilt crowd
//      has new people.
//   2. HOW MUCH TO TRUST THE CROWD. Did items the crowd scored higher actually do
//      better? Reported plainly, including "no difference yet".

export const NO_REPLY_DAYS = 14;
const MIN_OUTCOMES = 5;

/** A result between 0 (flop) and 1 (clear success), or null if not known yet. */
export function outcomeOfPlacement(p) {
  const perf = String(p?.performance || "");
  if (perf === "winning") return 1;
  if (perf === "flat") return 0.3;
  if (perf === "dud") return 0;
  return null;
}

export function outcomeOfEmail(log, now = Date.now()) {
  if (!log) return null;
  if (log.status === "replied" || log.replied_at) return 1;
  const sent = Date.parse(log.sent_at || log.created_at || 0);
  if (sent && now - sent > NO_REPLY_DAYS * 864e5) return 0;
  return null;
}

/**
 * Who to listen to. outcomes: [{ y: 0..1, am: { a1: mean 1..5, ... } }].
 * Returns { a1: multiplier 0.5..2, ... }, starting everyone at 1.
 */
export function learnWeights(outcomes) {
  const w = {};
  const base = outcomes.length ? outcomes.reduce((s, o) => s + o.y, 0) / outcomes.length : 0.5;
  for (const o of outcomes) {
    const signal = o.y - base; // better or worse than usual
    for (const [id, mean] of Object.entries(o.am || {})) {
      const liked = (Number(mean) - 3) / 2;            // -1 hated .. +1 loved
      w[id] = (w[id] ?? 1) * (1 + 0.15 * liked * signal * 2);
    }
  }
  for (const id of Object.keys(w)) w[id] = Math.round(Math.max(0.5, Math.min(2, w[id])) * 100) / 100;
  return w;
}

/**
 * How much to trust the crowd: success rate of the items it scored in its top
 * half against its bottom half. Needs a handful of results to say anything.
 */
export function crowdLift(outcomes) {
  const n = outcomes.length;
  if (n < MIN_OUTCOMES) return { n, verdict: "learning", text: `${n} real result${n === 1 ? "" : "s"} so far. The crowd needs ${MIN_OUTCOMES} to be checked.` };
  const sorted = outcomes.slice().sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, Math.ceil(n / 2)), bottom = sorted.slice(Math.ceil(n / 2));
  const rate = (xs) => (xs.length ? xs.reduce((s, o) => s + o.y, 0) / xs.length : 0);
  const hi = rate(top), lo = rate(bottom);
  const pct = (x) => `${Math.round(x * 100)}%`;
  if (hi === 0 && lo === 0) return { n, hi, lo, verdict: "no-successes", text: `${n} results checked, none successful yet, so there is nothing to compare.` };
  const ratio = lo > 0 ? hi / lo : null;
  if (hi > lo * 1.3 || (lo === 0 && hi > 0)) {
    return { n, hi, lo, verdict: "predictive", text: `Items the crowd rated higher did better: ${pct(hi)} success against ${pct(lo)}${ratio ? ` (${ratio.toFixed(1)}x)` : ""}.` };
  }
  if (lo > hi * 1.3) return { n, hi, lo, verdict: "wrong", text: `The crowd got it backwards so far (${pct(hi)} vs ${pct(lo)}). Genie is shifting weight to the people who called it right.` };
  return { n, hi, lo, verdict: "no-difference", text: `No clear difference yet between what the crowd liked and what worked (${pct(hi)} vs ${pct(lo)}).` };
}

/** Gather every tested item that has a real result, for one business. */
export async function collectOutcomes(admin, { userId, host = null }) {
  const out = [];
  const now = Date.now();
  try {
    let q = admin.from("placements").select("id, host, meta, performance, status").eq("user_id", userId).eq("status", "posted").limit(1000);
    if (host) q = q.eq("host", host);
    const { data } = await q;
    for (const p of data || []) {
      const c = p.meta?.crowd; const y = outcomeOfPlacement(p);
      if (c && y != null && c.mode !== "rules") out.push({ id: p.id, kind: c.kind, score: c.score, cv: c.cv || null, am: c.am || {}, y });
    }
  } catch {}
  try {
    const { data: logs } = await admin.from("outreach_log").select("contact_email, status, replied_at, sent_at, created_at").eq("user_id", userId).limit(5000);
    const byEmail = {};
    for (const l of logs || []) { const e = String(l.contact_email || "").toLowerCase(); if (e && (!byEmail[e] || l.replied_at)) byEmail[e] = l; }
    const { data: acts } = await admin.from("actions").select("id, type, payload, target").eq("user_id", userId).in("type", ["media_outreach", "recovery"]).limit(2000);
    for (const a of acts || []) {
      const c = a.payload?.crowd; if (!c || c.mode === "rules") continue;
      if (host && a.target?.host && a.target.host !== host) continue;
      const email = String(a.payload?.contact?.email || a.payload?.email || "").toLowerCase();
      const y = email ? outcomeOfEmail(byEmail[email], now) : null;
      if (y != null) out.push({ id: a.id, kind: c.kind, score: c.score, cv: c.cv || null, am: c.am || {}, y });
    }
  } catch {}
  return out;
}

/** Learn from real results and record it. Never throws. */
export async function calibrate(admin, { userId, host, crowdVersion = null }) {
  try {
    // The current crowd, and its people's names so a rebuilt crowd can keep the
    // kinds of people who predicted well.
    let names = {};
    try {
      const { data } = await admin.from("events").select("data, created_at").eq("user_id", userId).eq("type", "swarm.crowd")
        .eq("host", host).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data) { crowdVersion = crowdVersion || data.data?.cv || data.created_at; names = Object.fromEntries((data.data?.people || []).map((p) => [p.id, `${p.name}: ${p.who}`])); }
    } catch {}
    const outcomes = await collectOutcomes(admin, { userId, host });
    const current = crowdVersion ? outcomes.filter((o) => o.cv === crowdVersion) : [];
    const weights = learnWeights(current);
    const lift = crowdLift(outcomes);
    const byKind = {};
    for (const o of outcomes) { const k = (byKind[o.kind] ||= { n: 0, wins: 0 }); k.n++; k.wins += o.y; }
    const { recordEvent } = await import("@/lib/events");
    await recordEvent(admin, {
      userId, host, type: "swarm.calibration", actor: "genie", subject: lift.text,
      data: { cv: crowdVersion, weights, names, lift, byKind, n: outcomes.length },
    });
    return { n: outcomes.length, lift, weights };
  } catch { return null; }
}
