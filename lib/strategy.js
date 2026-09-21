// lib/strategy.js
// ── THE ONE DECISION EVERY ENGINE EXECUTES ──
// Genie interviews the owner (lib/business-brief.js) and stores what they said.
// Fourteen engines then read that brief — as raw prose, pasted into fourteen
// separate prompts, each re-deciding for itself what the business is and how to
// talk about it, with a different model, every night. Nothing anywhere held the
// actual decision.
//
// That is why the same product could be hunted as "a thing people compare
// against VNTANA" by one engine and written about as something else by another:
// no engine was wrong on its own terms, and none of them were working from the
// same plan. Correcting it meant editing prompts one at a time.
//
// The strategy is that missing decision, made once and stored: who the customer
// is, what THEY are trying to do, how this business shows up in that, and why it
// works. Engines read these resolved fields instead of interpreting prose, and
// the owner can read it back and correct it — one correction, not fourteen.
//
// It is drafted from the scan and the brief, and marked unconfirmed until the
// owner says it is right. Genie keeps working in the meantime; an unconfirmed
// strategy is a guess Genie is honest about, not a reason to sit still.

import { sellerWords, sellerGoals, growthQueries, mechanism as mechanismOf, awarenessOf } from "@/lib/buyer-angle";

export const STRATEGY_VERSION = 1;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const clip = (s, n) => { const t = clean(s); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const list = (v, { max = 6, len = 90 } = {}) => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[;\n]|,(?![^(]*\))/) : [];
  const out = [];
  for (const x of arr) {
    const s = clip(x, len);
    if (s && !out.some((y) => y.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= max) break;
  }
  return out;
};

/**
 * The shape every engine can rely on. Anything missing is an empty string or an
 * empty array — never undefined — so an engine can read a field without
 * defending against the strategy being half-built.
 */
export function normalizeStrategy(raw = {}) {
  const s = raw || {};
  return {
    v: STRATEGY_VERSION,
    // Who the customer is, in the words they would use about themselves.
    who: list(s.who, { max: 4, len: 60 }),
    // What that customer is trying to do. Not what this business sells — what
    // the buyer gets out of bed to work on.
    theirGoal: list(s.theirGoal, { max: 4, len: 60 }),
    // How this business shows up in that. "One of the ways X are growing",
    // not "an AR company".
    angle: clip(s.angle, 220),
    // Why it produces the goal, as a chain the buyer can follow. This is the
    // argument every article, reply and pitch has to make.
    mechanism: clip(s.mechanism, 400),
    // The searches and places where that customer is already looking.
    whereTheyLook: list(s.whereTheyLook, { max: 8, len: 90 }),
    // What to write about: angles, not product features.
    contentThemes: list(s.contentThemes, { max: 8, len: 110 }),
    // What may be claimed, and what must never be.
    proof: clip(s.proof, 400),
    neverSay: list(s.neverSay, { max: 8, len: 110 }),
    // Who looks like a customer and is not one.
    notTheCustomer: list(s.notTheCustomer, { max: 6, len: 90 }),
    // The one step a good prospect should take, and where they land.
    cta: clip(s.cta, 160),
    // Countries worth the effort, when the owner or the data says so.
    markets: list(s.markets, { max: 6, len: 40 }),
    // Provenance, so nothing pretends to be more settled than it is.
    source: ["ai", "fallback", "owner"].includes(s.source) ? s.source : "fallback",
    confirmedAt: s.confirmedAt || null,
    at: s.at || new Date().toISOString(),
  };
}

/** Enough to act on? Engines use this to decide whether to lean on it. */
export function strategyReady(s) {
  const n = normalizeStrategy(s);
  return !!(n.who.length && n.theirGoal.length && n.angle && n.mechanism);
}

/**
 * The strategy without AI. Genie must never stop because every free provider is
 * busy, so this is the floor: it reads the brief and the scan through
 * lib/buyer-angle and produces a usable, honest strategy. Thinner than the AI
 * version, and marked as such.
 */
export function fallbackStrategy(ai = {}) {
  const who = sellerWords(ai);
  const goals = sellerGoals(ai);
  const b = ai?.brief || {};
  const first = who[0] || clean(ai?.targetCustomer).split(/[,;]/)[0] || "";
  return normalizeStrategy({
    who,
    theirGoal: goals,
    angle: first && goals.length
      ? `One of the ways ${first}s are working to ${goals[0]}`
      : "",
    mechanism: mechanismOf(ai),
    whereTheyLook: growthQueries(ai, { limit: 8 }).map((q) => q.query),
    contentThemes: who.length && goals.length
      ? goals.slice(0, 3).map((g) => `How ${who[0]}s ${g}`)
      : [],
    proof: b.proof || ai?.proof || "",
    neverSay: b.neverSay || (ai?.avoid ? String(ai.avoid).split(";") : []),
    notTheCustomer: b.disqualifiers || [],
    cta: b.cta || ai?.conversionGoal || "",
    markets: [],
    source: "fallback",
  });
}

/**
 * What the AI is asked. Deliberately narrow: it is not writing marketing, it is
 * resolving the owner's own words into decisions. The worked example is ARQR360
 * because it is the hardest case — a product nobody searches for by name, where
 * getting the angle wrong sends every engine hunting an empty pond.
 */
export function strategyPrompt({ ai = {}, briefText = "" }) {
  const facts = [
    ai.businessName && `Business: ${ai.businessName}`,
    ai.whatTheySell && `Sells: ${clip(ai.whatTheySell, 300)}`,
    ai.targetCustomer && `Sells to: ${clip(ai.targetCustomer, 200)}`,
    ai.differentiator && `Different because: ${clip(ai.differentiator, 200)}`,
    ai.painPoints && `Problems it removes: ${clip(ai.painPoints, 300)}`,
    ai.proof && `Proof available: ${clip(ai.proof, 200)}`,
  ].filter(Boolean).join("\n");

  return `Resolve this business into one marketing strategy that other systems will execute literally.

${facts}
${briefText ? `\nWhat the owner told Genie, which overrides anything above:\n${briefText}\n` : ""}
The hard part, and the one thing to get right: almost nobody searches for a
product they have never heard of. If this is a new kind of thing, the customer
is NOT out there comparing it against rivals — they are working on their own
business, looking for ways to grow. The strategy must reach them there.

Worked example, for shape only — do not copy its content:
  A company selling augmented-reality product views to furniture shops.
  who: ["furniture retailer", "rug shop"]
  theirGoal: ["increase online sales", "reduce returns"]
  angle: "One of the ways furniture retailers are increasing online sales"
  mechanism: "Shoppers see the sofa in their own room, so they know it fits and stop hesitating — more orders go through and fewer come back"
  whereTheyLook: ["how to increase furniture store sales", "best apps for furniture stores", "how to reduce ecommerce returns"]
  contentThemes: ["Ways furniture retailers are increasing online sales", "What actually causes furniture returns", "Making a product page people trust"]

Return ONLY this JSON:
{
  "who": ["the customer, in the words they would use about themselves, singular"],
  "theirGoal": ["what that customer is trying to achieve in their own business"],
  "angle": "how this business shows up in that — one of the ways they reach the goal, never a product description",
  "mechanism": "why it produces that goal, as a chain: what the end customer experiences, then what that does for the buyer's numbers",
  "whereTheyLook": ["the searches and places that customer already uses, in their words — never this product's name"],
  "contentThemes": ["article angles that would be useful to that customer whether or not they ever buy"],
  "proof": "only what the owner can genuinely claim, or empty",
  "neverSay": ["anything the owner forbade"],
  "notTheCustomer": ["who looks like a customer but is not"],
  "cta": "the one step a good prospect should take",
  "markets": []
}

Leave "markets" empty. Genie fills it from Market Testing, which ranks every
country on real demand, competition and this owner's own Search Console data —
a guess here would contradict it.

Every field must come from the facts above. Invent no proof, no numbers, no
customers. An empty field is better than a guessed one.`;
}

/** Read the model's answer into a strategy, falling back rather than failing. */
export function readStrategy(json, ai = {}) {
  const parsed = json && typeof json === "object" ? json : null;
  if (!parsed) return fallbackStrategy(ai);
  const s = normalizeStrategy({ ...parsed, source: "ai" });
  // A strategy missing the parts engines actually steer by is worse than the
  // deterministic one, because it looks authoritative and says nothing.
  if (!strategyReady(s)) {
    const fb = fallbackStrategy(ai);
    return strategyReady(fb) ? fb : s;
  }
  return s;
}

/**
 * The strategy as prompt text. This is what replaces fourteen engines each
 * interpreting the brief for themselves: they are told the decision, not the
 * notes it came from.
 */
export function strategyBlock(s) {
  const n = normalizeStrategy(s);
  if (!strategyReady(n)) return "";
  const lines = [
    `Customer: ${n.who.join(", ")}.`,
    `What they are trying to do: ${n.theirGoal.join(", ")}.`,
    `How we show up: ${n.angle}.`,
    `Why it works for them: ${n.mechanism}`,
  ];
  if (n.contentThemes.length) lines.push(`Themes worth writing about: ${n.contentThemes.join("; ")}.`);
  if (n.proof) lines.push(`Proof we may use: ${n.proof}`);
  if (n.neverSay.length) lines.push(`Never say: ${n.neverSay.join("; ")}.`);
  if (n.notTheCustomer.length) lines.push(`Not the customer: ${n.notTheCustomer.join("; ")}.`);
  if (n.cta) lines.push(`What we want them to do: ${n.cta}`);
  const caveat = n.confirmedAt
    ? "The owner has confirmed this is right."
    : "The owner has NOT confirmed this yet — it is Genie's read of their business. Follow it, but do not state it as fact about them.";
  return `\nTHE STRATEGY — the one plan every part of Genie follows. It overrides anything guessed from the website.\n${lines.join("\n")}\n${caveat}\n`;
}
