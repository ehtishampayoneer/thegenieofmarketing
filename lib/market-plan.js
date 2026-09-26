// lib/market-plan.js
// ── WHICH COUNTRIES ARE LIVE TODAY, AND WHAT EACH ONE GETS ──
//
// Market Testing already works out which countries are winnable and which are not,
// from real Search Console numbers where they exist. That ranking was then read by
// exactly one thing: a single line pasted into a prompt. Every keyword volume was
// pulled for the United States regardless of who the owner sells to, every article
// was written for nowhere in particular, and outreach picked companies by industry
// with no idea what country they were in.
//
// So Genie knew that the UAE was easier to win than the US and did nothing with it.
//
// WHAT THIS IS NOT. It is not the day's work divided six ways — five emails split
// between six countries is under one each, which teaches nothing about any of them.
// Each live market gets its OWN share of the day, and the day is bigger for having
// more than one market in it.
//
// THE ONE THING THAT DOES NOT SCALE WITH COUNTRIES. The sending allowance belongs
// to the mailbox, not the market. Five a day in week one is what protects the
// owner's own Gmail from being throttled, and sending fifteen because there are
// three countries would damage delivery to all three. So the ramp still caps the
// TOTAL, and this decides how that total is shared out.

// How hard a market is to win, from its score. The three colours an owner sees.
export const TIERS = [
  { id: "green", label: "Winnable now", min: 66, why: "Real demand and little standing in your way." },
  { id: "amber", label: "Worth the work", min: 40, why: "Real demand, real competition. Slower, and worth it." },
  { id: "red", label: "Hard", min: 0, why: "Crowded or expensive to win. Genie keeps it warm rather than fighting for it." },
];

// An unscored market is UNKNOWN, not hard — the same rule the platform and rival
// checks already keep. Calling it hard would quietly bury a country nobody has
// measured yet beneath one that has been measured and found difficult.
const UNSCORED = 50;

export function tierOf(score) {
  // Number(null) is 0, which is a finite number and would have quietly filed every
  // unscored market as the hardest one there is.
  const missing = score === null || score === undefined || score === "";
  const n = Number(score);
  const s = missing || !Number.isFinite(n) ? UNSCORED : n;
  return TIERS.find((t) => s >= t.min) || TIERS[TIERS.length - 1];
}

// How many markets are worked at once. More than three and each one is too thin to
// tell whether it is working; fewer and an easy market sits idle behind a hard one.
export const MAX_ACTIVE = 3;

// The easiest market never takes the whole day: a green market that turns out to be
// wrong would otherwise consume every send before anyone noticed.
const SHARE = { green: 0.5, amber: 0.35, red: 0.15 };

/**
 * The live markets, hardest-working first, each with its tier and its share of
 * today's sending.
 *
 * @param markets  what Market Testing ranked: [{ name, code, score, verified }]
 * @param dailyCap today's total sends, from the ramp — the mailbox's limit
 * @returns [{ name, code, score, verified, tier, label, why, emailsToday }]
 */
export function activeMarkets(markets = [], dailyCap = 5, { max = MAX_ACTIVE } = {}) {
  const rows = (Array.isArray(markets) ? markets : [])
    .map((m) => (typeof m === "string" ? { name: m } : m || {}))
    .filter((m) => m.name)
    .map((m) => ({ ...m, tier: tierOf(m.score) }))
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    .slice(0, Math.max(1, max));
  if (!rows.length) return [];

  // Share the mailbox's allowance by tier, then give the remainder to the best
  // market rather than losing it to rounding.
  const weights = rows.map((r) => SHARE[r.tier.id] ?? 0.2);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const cap = Math.max(0, Math.floor(Number(dailyCap) || 0));

  let given = 0;
  const out = rows.map((r, i) => {
    const n = Math.floor((cap * (weights[i] / total)));
    given += n;
    return { ...r, tier: r.tier.id, label: r.tier.label, why: r.tier.why, emailsToday: n };
  });
  // Everything a whole market did not get, plus the rounding, goes to the top one.
  if (out.length && cap > given) out[0].emailsToday += cap - given;

  // A market allotted zero on a small allowance is not a market today. Saying so is
  // better than showing an owner a country with nothing under it.
  return out.filter((m) => m.emailsToday > 0 || m === out[0]);
}

/** Plain English for the screen: what this market is and what it gets today. */
export function marketNote(m) {
  if (!m?.name) return "";
  const n = m.emailsToday || 0;
  const how = m.verified ? "from your own Search Console numbers" : "estimated, until Search Console has enough data for this country";
  return `${m.label}: ${m.why} ${n} email${n === 1 ? "" : "s"} today. Ranked ${how}.`;
}

/**
 * Which of the live markets a company belongs to, so its email counts against the
 * right share. Null when it cannot be told, which is common and fine — those fill
 * whatever the named markets did not use.
 */
export function marketOf(contact, markets = []) {
  const hay = `${contact?.country || ""} ${contact?.domain || ""}`.toLowerCase();
  if (!hay.trim()) return null;
  for (const m of markets) {
    const name = String(m?.name || "").toLowerCase();
    if (name && hay.includes(name)) return m.name;
    const code = String(m?.code || "").toLowerCase();
    if (code && code.length === 2 && new RegExp(`\\.${code}$`).test(hay.trim())) return m.name;
  }
  return null;
}
