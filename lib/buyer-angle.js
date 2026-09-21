// lib/buyer-angle.js
// ── THE BUYER WHO HAS NEVER HEARD OF YOU ──
// Genie hunted for people comparing products. That works for a category the
// buyer already knows exists: someone shopping for a CRM types "Salesforce
// alternative", and the pond is full.
//
// It is the wrong pond for anything new. ARQR360 sells augmented reality to
// furniture retailers, and a furniture retailer is not awake at night searching
// for an AR vendor — they have never considered AR. What they DO say, in public,
// constantly, is that a third of their sofas come back, that customers cannot
// judge scale from a photo, and that their online conversion is poor. Those are
// the same people. They just describe themselves by the problem.
//
// The owner already tells Genie the problem: `problems` in the brief, which the
// interview asks for as "the problem or goal that makes someone actually buy".
// Until now exactly one engine read it — the article writer — while the hunt,
// the outreach, the pitches and the crowd all went looking for the product name.
// This turns that problem statement into the language a buyer uses BEFORE they
// know a solution exists, so every engine can hunt the pain rather than the
// category.
//
// No AI call: this runs inside the nightly budget, on free tiers, for every
// business, and a regex that produces plain phrases is both cheaper and more
// predictable than a model asked to paraphrase.

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Openers the owner tends to write that are not part of the problem itself:
// "customers struggle to..." -> "...". Stripped so the phrase reads like
// something a person would type into a search box.
const LEAD_IN = /^(?:our |their |the )?(?:customers?|clients?|buyers?|shoppers?|people|users?|they)\s+(?:often |usually |frequently |always |sometimes )?(?:can'?t|cannot|don'?t|do not|won'?t|struggle to|find it hard to|have trouble|are unable to|fail to|hate|dislike|worry about|are unsure|are not sure)\s+/i;
const FILLER = /^(?:a |an |the |to |that |which |because |so )+/i;
const TRAILING = /[.,;:!?]+$/;

/** One problem statement as something a person would actually type. */
export function asSearchPhrase(problem) {
  let p = clean(problem).replace(TRAILING, "");
  if (!p) return "";
  const stripped = p.replace(LEAD_IN, "");
  // Only take the stripped form when something meaningful is left.
  if (stripped !== p && stripped.split(" ").length >= 3) p = stripped;
  p = p.replace(FILLER, "");
  // Long sentences are not search queries. Keep the first clause — two words is
  // enough for one ("delivery times"), and demanding three kept the whole
  // sentence, trailing subordinate clause and all.
  const cut = p.split(/,| because | which | so that | and then /i)[0];
  if (cut.split(" ").length >= 2) p = cut;
  return clean(p).toLowerCase().slice(0, 70);
}

/**
 * The problems this business solves, in the buyer's words.
 * Reads the brief first (what the owner typed) and falls back to the flattened
 * painPoints the scan inferred, so it works before anyone fills the interview in.
 */
export function buyerProblems(ai = {}, limit = 4) {
  const fromBrief = Array.isArray(ai?.brief?.problems) ? ai.brief.problems : [];
  const fromScan = typeof ai?.painPoints === "string"
    ? ai.painPoints.split(/;|•|\n/)
    : Array.isArray(ai?.painPoints) ? ai.painPoints : [];
  const seen = new Set();
  const out = [];
  for (const raw of [...fromBrief, ...fromScan]) {
    const phrase = asSearchPhrase(raw);
    if (!phrase || phrase.split(" ").length < 2) continue;      // "returns" alone is noise
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Search queries for people living the problem, who have never heard of the
 * product. Deliberately plain: these go to Reddit, Quora and Stack Exchange,
 * where people write like people.
 *
 *   problem: "customers can't tell if a sofa will fit their room"
 *   ->  "can't tell if a sofa will fit their room"
 *       "how to stop can't tell if a sofa will fit their room"   <- no
 *
 * which is why the templates are chosen to survive a raw phrase: a bare problem
 * statement, and the two framings people actually type when they are looking for
 * a way out of one.
 */
export function painQueries(ai = {}, { limit = 6 } = {}) {
  const problems = buyerProblems(ai, 3);
  if (!problems.length) return [];
  const segments = Array.isArray(ai?.brief?.segments) ? ai.brief.segments.slice(0, 2) : [];
  const who = clean(segments[0] || ai?.targetCustomer || "").toLowerCase().split(/[,;]/)[0].trim();

  const out = [];
  const push = (q, stage, weight) => {
    const query = clean(q).slice(0, 90);
    if (query && query.split(" ").length >= 3 && !out.some((x) => x.query === query)) {
      out.push({ query, stage, weight, group: "pain" });
    }
  };

  for (const p of problems) {
    // The problem as written. Someone describing it is someone who has it.
    push(p, "problem_aware", 0.99);
    // The two ways people ask for a way out, which read naturally in front of
    // almost any phrase because both take a noun phrase.
    push(`how to fix ${p}`, "solution_aware", 0.94);
    push(`${p} ${who}`.trim(), "problem_aware", 0.9);
  }
  return out.slice(0, limit);
}

/**
 * How much the buyer already knows. This decides whether comparison queries are
 * worth running at all: "alternative to X" only finds people when X is a name
 * they have heard of.
 *
 *   product  — they know the product and are choosing between names
 *   solution — they know this kind of thing exists and are looking for one
 *   problem  — they know they have the problem, not that anything fixes it
 *
 * Nothing is guessed from thin air: it is the owner's own words that decide.
 * When they named no competitors at all, nobody is comparing, and the hunt
 * should spend itself on the problem instead.
 */
export function awarenessOf(ai = {}) {
  const rivals = (ai?.competitors || []).map((c) => c?.name).filter(Boolean);
  const hasProblems = buyerProblems(ai, 1).length > 0;
  if (rivals.length >= 2) return "product";
  if (rivals.length === 1) return "solution";
  return hasProblems ? "problem" : "solution";
}
