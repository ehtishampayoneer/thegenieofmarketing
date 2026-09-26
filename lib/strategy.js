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

// Where cold email to a published business address is permissive, with an
// opt-out.
//
// Canada is no longer blocked by the product: its third condition is that the
// message be relevant to the recipient's role, and lib/role-fit.js now enforces
// that on every send alongside the published-source rule. It stays OUT of this
// default anyway, because switching a country on has a consequence the owner
// carries and not this file - the plan screen says it can be added.
//
// Germany layers unfair-competition law on top of GDPR and, since a 2025 ruling,
// expects a documented assessment per contact. That is a real piece of work
// rather than a flag, so it stays off until the product can meet it honestly.
//
// This is the general shape of those rules and not legal advice.
export const DEFAULT_EMAIL_COUNTRIES = [
  "United States", "United Kingdom", "Australia", "United Arab Emirates", "Pakistan", "India",
];

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

// ── THE COUNTRIES, WITH WHAT MARKET TESTING ACTUALLY FOUND ──
// The plan stored six country NAMES and threw the rest away, so every engine that
// read it knew the owner sells into the UAE and nothing about whether the UAE was
// the easy one. Green, amber and red were all the same colour.
//
// The names stay authoritative, because an owner can type a country in by hand on
// The plan and that must win. This is the detail behind whichever of those names
// Market Testing actually scored; a country the owner added by hand simply has no
// detail, which reads as "not measured" rather than as "hard".
const DIFFICULTY = new Set(["Easy", "Medium", "Hard"]);
export function marketRows(s) {
  const raw = Array.isArray(s?.marketData) ? s.marketData : [];
  const out = [];
  for (const m of raw) {
    const name = clip(typeof m === "string" ? m : m?.name, 40);
    if (!name || out.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    const score = Number(m?.score);
    out.push({
      name,
      iso2: /^[A-Za-z]{2}$/.test(String(m?.iso2 || "")) ? String(m.iso2).toUpperCase() : null,
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
      difficulty: DIFFICULTY.has(m?.difficulty) ? m.difficulty : null,
      verified: !!m?.verified,
    });
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * The shape every engine can rely on. Anything missing is an empty string or an
 * empty array — never undefined — so an engine can read a field without
 * defending against the strategy being half-built.
 */
const marketNames = (s) => {
  const named = list(s?.markets, { max: 6, len: 40 });
  if (named.length) return named;
  return marketRows(s).map((m) => m.name).slice(0, 6);
};
const marketDetail = (s) => {
  const names = marketNames(s).map((n) => n.toLowerCase());
  return marketRows(s).filter((m) => names.includes(m.name.toLowerCase()));
};

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

    // ── WHAT IS ACTUALLY BEING SOLD ──
    // The plan knew who the customer was and never what they were being asked to
    // buy, so every email and every article argued the case well and then stopped
    // short of the thing that closes it. Price included, deliberately: "from $29 a
    // month" outperforms "affordable" everywhere it has ever been measured, and a
    // reader who has to ask is a reader who does not.
    offer: clip(s.offer, 400),

    // What a PARTNER gets, which is a different question from what a customer
    // pays. An agency that builds stores does not buy this - they put it into
    // twenty of their clients' stores, and the first thing they ask is what is in
    // it for them. Without an answer here, Genie pitches them the retail price
    // and the reply is silence.
    partnerOffer: clip(s.partnerOffer, 300),

    // Which of the thousands of matching companies are worth the daily fifteen.
    // A directory with four thousand agencies is not a volume problem, it is a
    // filtering one, and this is the filter in the owner's own words.
    qualityBar: clip(s.qualityBar, 300),

    // Who inside the company. The offer has to be relevant to the person's job:
    // that is what makes the difference between a welcome message and an
    // unwelcome one, and in Canada it is the third condition that makes a cold
    // message to a published address lawful at all.
    roles: list(s.roles, { max: 6, len: 60 }),

    // Countries Genie may COLD-EMAIL into. Not the same question as `markets`
    // below, which is where the writing should be aimed: you can publish for
    // Germany and still not be allowed to email into it. Defaulted to the
    // permissive set rather than left empty, because an empty list would either
    // mean "nowhere" or "everywhere" and one of those is a fine.
    emailCountries: list(s.emailCountries?.length ? s.emailCountries : DEFAULT_EMAIL_COUNTRIES, { max: 12, len: 40 }),
    // Countries worth the effort, when the owner or the data says so.
    markets: marketNames(s),
    // The same countries with how hard each one is, so green and red can differ.
    // Only ever the detail for a name in `markets` above — two lists that can
    // disagree is how a winnable country ends up filed as the hard one.
    marketData: marketDetail(s),
    // When Market Testing was last asked. Kept separate from `at` so "the plan
    // changed" and "we re-checked the countries" are different facts: without
    // it, a re-check that found no change looked like it had never happened, and
    // every engine asked Search Console again the next night.
    marketsAt: s.marketsAt || null,
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
 * resolving the owner's own words into decisions.
 *
 * The worked examples are from trades this product has no customer in, and that is
 * on purpose. The first version used the business Genie was built alongside, on the
 * reasoning that it was the hardest case — and the effect was that every plan, for
 * every trade, leaned toward its language. An example is the strongest instruction
 * in a prompt, so the only safe example is one nobody could mistake for a template.
 * Two of them, from unrelated trades, teach the shape without teaching a subject.
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

TWO worked examples, from deliberately unrelated trades. They are here to show the
SHAPE of a good answer and nothing else. Copying their words, their industry or
their style into a plan for a different business is the failure this is guarding
against — the first version of this prompt showed one example, from the trade this
product was first built for, and every plan it produced leaned that way.

  A company selling payroll software to accountancy practices.
  who: ["accountancy practice owner", "bookkeeping firm"]
  theirGoal: ["take on more clients without hiring", "stop losing evenings to payroll runs"]
  angle: "One of the ways small practices are taking on more clients without hiring"
  mechanism: "Payroll runs finish in minutes instead of hours, so the same staff handle more clients and the practice grows without a new salary"
  whereTheyLook: ["how to grow an accountancy practice", "best payroll software for accountants", "how many clients can one bookkeeper handle"]
  contentThemes: ["What actually limits how many clients a practice can take", "The real cost of a manual payroll run", "Hiring versus automating: the numbers"]

  A company fitting commercial kitchens for restaurants.
  who: ["independent restaurant owner", "cafe owner opening a second site"]
  theirGoal: ["open on time", "stop the kitchen being the bottleneck at service"]
  angle: "One of the reasons second sites open on schedule"
  mechanism: "The layout is planned around the actual menu, so service does not jam at the pass and the room turns more covers a night"
  whereTheyLook: ["how much does a commercial kitchen cost", "opening a second restaurant site", "restaurant kitchen layout mistakes"]
  contentThemes: ["What a commercial kitchen really costs, itemised", "Why second sites open late", "Designing a kitchen around your menu"]

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
  "offer": "what they sell and what it costs, including real prices ONLY if the owner stated them — never invent a price",
  "partnerOffer": "what a partner or agency gets for putting this in front of their own clients, ONLY if the owner said — otherwise empty",
  "qualityBar": "which companies are worth contacting, if the owner gave any signal — otherwise empty",
  "roles": ["the job titles inside a customer company that this offer is actually relevant to"],
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
export function strategyBlock(s, { audience = null } = {}) {
  const n = normalizeStrategy(s);
  if (!strategyReady(n)) return "";
  const lines = [
    `Customer: ${n.who.join(", ")}.`,
    `What they are trying to do: ${n.theirGoal.join(", ")}.`,
    `How we show up: ${n.angle}.`,
    `Why it works for them: ${n.mechanism}`,
  ];
  if (n.contentThemes.length) lines.push(`Themes worth writing about: ${n.contentThemes.join("; ")}.`);
  // The countries came from Market Testing's real Search Console ranking, not
  // from a model. They were computed, stored and shown to the owner, and then
  // read by nothing: this line is what makes every writer actually use them.
  if (n.markets.length) {
    lines.push(
      `Best countries to win, strongest first: ${n.markets.join(", ")}. ` +
      `Write for a reader there — their spelling, currency, units, seasons and examples — without claiming a presence the business does not have.`
    );
  }
  // ── THE OFFER, ADDRESSED TO WHOEVER IS ACTUALLY READING ──
  // Every engine argued the case well and then stopped short of asking for
  // anything, so the offer is here. But an agency that builds twenty stores is
  // not being sold a subscription, and a conditional "if you happen to be
  // writing to a partner…" is an instruction a model half-follows. When the
  // caller knows who is reading, this says one thing and not the other.
  if (audience === "partner") {
    if (n.partnerOffer) {
      lines.push(`YOU ARE WRITING TO A PARTNER, NOT A CUSTOMER. They build or run things for other businesses, so they are not buying this — they are deciding whether to put it in front of their own clients.`);
      lines.push(`What they get: ${n.partnerOffer}`);
      if (n.offer) lines.push(`For context only, what their clients would pay: ${n.offer}. Do NOT pitch this price to them, and do not ask them to buy anything.`);
    } else if (n.offer) {
      // No partner terms written down yet. Say so rather than defaulting to the
      // retail pitch, which is the mistake this whole split exists to prevent.
      lines.push(`You are writing to a PARTNER (an agency or similar) who would put this in front of their own clients, not buy it. The owner has not written down partner terms yet, so do NOT quote a price or ask them to buy. Ask whether working together is of interest and let them raise terms.`);
    }
  } else {
    if (n.offer) lines.push(`What we sell, and what it costs: ${n.offer}`);
    if (audience === null && n.partnerOffer) {
      lines.push(`If this piece is aimed at an AGENCY or a partner rather than a customer, this is what they get instead: ${n.partnerOffer}. Never pitch them the customer price.`);
    }
  }
  if (n.proof) lines.push(`Proof we may use: ${n.proof}`);
  if (n.neverSay.length) lines.push(`Never say: ${n.neverSay.join("; ")}.`);
  if (n.notTheCustomer.length) lines.push(`Not the customer: ${n.notTheCustomer.join("; ")}.`);
  if (n.roles.length) lines.push(`Write to these people inside the company: ${n.roles.join(", ")}. The offer has to be relevant to their job.`);
  if (n.cta) lines.push(`What we want them to do: ${n.cta}`);
  const caveat = n.confirmedAt
    ? "The owner has confirmed this is right."
    : "The owner has NOT confirmed this yet — it is Genie's read of their business. Follow it, but do not state it as fact about them.";
  return `\nTHE STRATEGY — the one plan every part of Genie follows. It overrides anything guessed from the website.\n${lines.join("\n")}\n${caveat}\n`;
}
