// lib/swarm/live.js
// ── WHO IS WORKING RIGHT NOW ──
// The "live contacts" view of the three teams: every tester kind, improver and
// doer as a contact with a status dot, and how many bots each team has active.
// Everything is read from real work, never made up:
//   • active   = did real work in the last 15 minutes
//   • testers  = the business's crowd (about 30 kinds, 1,000 people); a test in
//                the last 15 minutes means all 1,000 are working on it
//   • improvers = named specialists, each owning a kind of complaint; active when
//                they fixed one recently
//   • doers    = Genie's engines, named after the work they log in the activity feed
// Also: the learning period, the honest "how long before you trust the crowd".

export const LIVE_MS = 15 * 60 * 1000;
export const LEARNING_DAYS = 14;
export const LEARNING_RESULTS = 5;

// Each improver owns the complaints it fixes.
export const IMPROVERS = [
  { id: "voice", name: "Voice keeper", does: "Takes out the advert tone and pushiness", tags: ["sounds like an advert", "too pushy"] },
  { id: "proof", name: "Proof & trust", does: "Adds the evidence people asked for", tags: ["no proof", "don't trust it yet"] },
  { id: "price", name: "Price clarity", does: "Makes the price and what it includes clear", tags: ["price unclear or too high"] },
  { id: "clarity", name: "Clarity editor", does: "Says what it is in the first line, and shorter", tags: ["unclear what it is", "too long"] },
  { id: "rules", name: "Platform rules", does: "Keeps it inside each site's rules and personal", tags: ["breaks the community rules", "feels mass-sent"] },
  { id: "angle", name: "Angle finder", does: "Finds the reason it matters to this reader", tags: ["not relevant to me", "happy with what I use"] },
  { id: "titles", name: "Search titles", does: "Rewrites titles and descriptions people click", tags: [] },
];

// Genie's engines, named after the work they log.
export const DOERS = [
  { id: "scout", name: "Scout", does: "Reads sites, searches and Google", verbs: ["scanning"] },
  { id: "finder", name: "Buyer & place finder", does: "Finds buyers, sites and listings", verbs: ["discovered"] },
  { id: "strategist", name: "Keyword strategist", does: "Picks what to rank for", verbs: ["keywords"] },
  { id: "writer", name: "Writer", does: "Drafts articles, posts and pitches", verbs: ["writing"] },
  { id: "prep", name: "Approvals prep", does: "Lines up work for you to approve", verbs: ["staged"] },
  { id: "publisher", name: "Publisher", does: "Publishes and gets pages indexed", verbs: ["published"] },
  { id: "inbox", name: "Inbox watcher", does: "Catches replies to your outreach", verbs: ["replied"] },
  { id: "analyst", name: "Analyst", does: "Checks what worked and what did not", verbs: ["learning", "traction", "retired"] },
  { id: "ops", name: "Operations", does: "Keeps connections and setup running", verbs: ["connected", "expanding", "working"] },
];

/**
 * Build the live view. Inputs are plain rows so it is easy to test:
 *   tested   - swarm.tested events   { created_at, data:{ size } }
 *   improved - swarm.improved events { created_at, data:{ tickets:[tag] } }
 *   activity - activity rows         { verb, message, created_at }
 *   people   - the business's crowd  [{ name, weight }]
 */
export function liveView({ tested = [], improved = [], activity = [], people = [], now = Date.now() }) {
  const fresh = (iso) => now - Date.parse(iso || 0) < LIVE_MS;

  // Testers: the crowd, kind by kind.
  const recentTests = tested.filter((e) => fresh(e.created_at));
  const size = Number(tested[0]?.data?.size) || 1000;
  const totalW = people.reduce((s, p) => s + (Number(p.weight) || 1), 0) || 1;
  const testersActive = recentTests.length ? size : 0;
  const testerKinds = people.map((p) => ({
    name: p.name, count: Math.max(1, Math.round(((Number(p.weight) || 1) / totalW) * size)), active: testersActive > 0,
  })).sort((a, b) => b.count - a.count);

  // Improvers: whoever owns the complaints fixed recently.
  const lastFix = {};
  for (const e of improved) {
    for (const tag of e.data?.tickets || []) {
      const r = IMPROVERS.find((x) => x.tags.includes(tag)) || IMPROVERS.find((x) => x.id === "angle");
      if (!lastFix[r.id] || Date.parse(e.created_at) > Date.parse(lastFix[r.id])) lastFix[r.id] = e.created_at;
    }
    if (e.data?.kind === "article") lastFix.titles = lastFix.titles && Date.parse(lastFix.titles) > Date.parse(e.created_at) ? lastFix.titles : e.created_at;
  }
  const improvers = IMPROVERS.map((r) => ({ id: r.id, name: r.name, does: r.does, last: lastFix[r.id] || null, active: fresh(lastFix[r.id]) }));

  // Doers: each engine's latest logged work.
  const lastDo = {};
  for (const a of activity) {
    const d = DOERS.find((x) => x.verbs.includes(a.verb)) || DOERS.find((x) => x.id === "ops");
    if (!lastDo[d.id]) lastDo[d.id] = a;
  }
  const doers = DOERS.map((d) => ({ id: d.id, name: d.name, does: d.does, last: lastDo[d.id]?.created_at || null, doing: lastDo[d.id]?.message || null, active: fresh(lastDo[d.id]?.created_at) }));

  return {
    testers: { active: testersActive, total: size, kinds: testerKinds },
    improvers: { active: improvers.filter((r) => r.active).length, total: IMPROVERS.length, list: improvers },
    doers: { active: doers.filter((d) => d.active).length, total: DOERS.length, list: doers },
    activeBots: testersActive + improvers.filter((r) => r.active).length + doers.filter((d) => d.active).length,
  };
}

/**
 * The learning period. The crowd can test something in a minute, but it only
 * earns trust by being checked against real results, and replies take up to two
 * weeks to come in. So: work in the real world from day one (Genie already paces
 * everything), and treat the crowd's scores as a first opinion until it has had
 * LEARNING_DAYS days and LEARNING_RESULTS real results to learn from.
 */
export function learningPeriod({ firstTestAt = null, results = 0, verdict = "learning", now = Date.now() }) {
  const day = firstTestAt ? Math.floor((now - Date.parse(firstTestAt)) / 864e5) + 1 : 0;
  const daysOk = day >= LEARNING_DAYS;
  const resultsOk = results >= LEARNING_RESULTS;
  const done = daysOk && resultsOk;
  let text;
  if (!firstTestAt) text = `The crowd starts learning with its first test. Give it ${LEARNING_DAYS} days and ${LEARNING_RESULTS} real results before trusting its scores fully.`;
  else if (done) text = verdict === "wrong"
    ? "Learning period over, but the crowd has been calling it backwards. Genie is re-weighting it; treat its scores with care."
    : `Learning period complete: ${day} days and ${results} real results checked. The crowd's scores are now calibrated against your real market.`;
  else text = `Learning period: day ${Math.min(day, LEARNING_DAYS)} of ${LEARNING_DAYS}, ${results} of ${LEARNING_RESULTS} real results. Genie is already working in the real world, safely paced; until then, treat crowd scores as a first opinion.`;
  return { day, days: LEARNING_DAYS, results, need: LEARNING_RESULTS, done, pct: Math.round(Math.min(1, (Math.min(day, LEARNING_DAYS) / LEARNING_DAYS + Math.min(results, LEARNING_RESULTS) / LEARNING_RESULTS) / 2) * 100), text };
}
