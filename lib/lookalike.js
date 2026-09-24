// lib/lookalike.js
// ── MORE LIKE THE ONES WHO ANSWERED ──
//
// Without this the list never gets better. Genie searches the same niche it
// searched on day one, night after night, whether or not anybody in it ever
// replied — so a list that is 5% right stays 5% right forever, and the owner has
// no way to tell the difference between "cold email does not work" and "this list
// does not work".
//
// Replies are the only honest signal available. Not opens, which Apple and Gmail
// fire on their own; not clicks, which are too rare at this volume to mean
// anything. Somebody wrote back, so something about them was right.
//
// WHAT IT IS NOT. It is not the learning loop, and the two do different jobs.
// lib/brain-learn.js proposes a change to THE PLAN, which is strategic, weekly,
// and waits for the owner to agree. This steers TONIGHT's search, which is
// tactical, reversible and needs nobody's permission — the worst case is one
// night spent looking in a slightly wrong place.
//
// IT REFUSES TO GUESS. Two replies is the floor. One reply is an anecdote, and a
// list narrowed on an anecdote is worse than the broad one it replaced: it
// excludes most of the market on the strength of a single person having been in a
// good mood on a Tuesday.

import { audienceOf, PARTNER } from "@/lib/audience";

// One reply tells you nothing. Below this, the original niche stands.
export const MIN_REPLIES = 2;

// Country from the address, where the address says so. Deliberately only the
// unambiguous ones — .com says nothing at all, and guessing would narrow a list
// on a coin flip.
const TLD_COUNTRY = {
  uk: "United Kingdom", au: "Australia", ca: "Canada", nz: "New Zealand",
  ie: "Ireland", pk: "Pakistan", in: "India", ae: "United Arab Emirates",
  de: "Germany", fr: "France", nl: "Netherlands", es: "Spain", it: "Italy", se: "Sweden",
};

function countryOf(domain) {
  const parts = String(domain || "").toLowerCase().split(".");
  const tld = parts[parts.length - 1];
  return TLD_COUNTRY[tld] || null;
}

const tally = (xs) => {
  const m = new Map();
  for (const x of xs) if (x) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
};

/**
 * What the people who replied have in common.
 * Reads the send log for replies, then looks those addresses up in the directory
 * for the niche that found them. Never throws.
 */
export async function repliedProfile(supabase, { userId, host = null, limit = 200 } = {}) {
  const empty = { total: 0, industries: [], countries: [], audiences: [], namedShare: 0 };
  if (!supabase || !userId) return empty;

  let replied = [];
  try {
    let q = supabase.from("outreach_log")
      .select("contact_email, replied_at").eq("user_id", userId)
      .not("replied_at", "is", null).limit(limit);
    if (host) q = q.eq("host", host);
    const { data } = await q;
    replied = (data || []).map((r) => String(r.contact_email || "").toLowerCase()).filter(Boolean);
  } catch { return empty; }
  if (replied.length < MIN_REPLIES) return { ...empty, total: replied.length };

  let rows = [];
  try {
    const { data } = await supabase.from("directory_contacts")
      .select("email, company, domain, industry, email_type").in("email", replied.slice(0, 100));
    rows = data || [];
  } catch {}
  // Nothing known about any of them: a count on its own is not a pattern.
  if (!rows.length) return { ...empty, total: replied.length };

  return {
    total: replied.length,
    known: rows.length,
    industries: tally(rows.map((r) => r.industry)),
    countries: tally(rows.map((r) => countryOf(r.domain))),
    audiences: tally(rows.map((r) => audienceOf(r))),
    namedShare: rows.filter((r) => r.email_type === "named").length / rows.length,
  };
}

/**
 * The search to run tonight, given who answered. Returns the original niche
 * untouched whenever the evidence is too thin to improve on it.
 *
 * @returns {{niche, changed, reason}}
 */
export function lookalikeNiche(profile, fallback = "") {
  const base = String(fallback || "").trim();
  const p = profile || {};
  if (!p.known || p.total < MIN_REPLIES) {
    return { niche: base, changed: false, reason: "" };
  }

  const top = p.industries?.[0];
  // A pattern needs at least two people in it, or it is one person's Tuesday.
  if (!top || top.n < MIN_REPLIES) {
    return { niche: base, changed: false, reason: "" };
  }
  // And it has to be most of them, not merely the largest pile of ones.
  if (top.n / p.known < 0.5) {
    return { niche: base, changed: false, reason: "" };
  }

  // Narrow by country only when the repliers genuinely cluster in one, and never
  // when that would make the search a single company in a single town.
  const country = p.countries?.[0];
  const narrowCountry = country && country.n >= MIN_REPLIES && country.n / p.known >= 0.6 ? country.name : null;

  const niche = narrowCountry ? `${top.name} in ${narrowCountry}` : top.name;
  if (niche.toLowerCase() === base.toLowerCase()) {
    return { niche: base, changed: false, reason: "" };
  }

  const who = p.audiences?.[0]?.name === PARTNER ? "partners" : "companies";
  return {
    niche: niche.slice(0, 120),
    changed: true,
    reason: `${top.n} of the ${p.known} ${who} who replied are ${top.name}${narrowCountry ? ` in ${narrowCountry}` : ""}, so tonight Genie looks for more like them.`,
  };
}

/** One plain line for the screen, or "" when nothing has been learned yet. */
export function lookalikeNote(profile) {
  const p = profile || {};
  if (!p.total) return "";
  if (p.total < MIN_REPLIES) return `${p.total} reply so far. Genie needs one more before it starts looking for people like them.`;
  const top = p.industries?.[0];
  if (!top || top.n < MIN_REPLIES) return `${p.total} replies so far, with no clear pattern between them yet.`;
  return `${top.n} of your replies came from ${top.name}. Genie is looking for more like them.`;
}
