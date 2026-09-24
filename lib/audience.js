// lib/audience.js
// ── IS THIS A CUSTOMER, OR A ROUTE TO TWENTY CUSTOMERS? ──
//
// Genie writes to two kinds of company and they need opposite emails.
//
// A furniture retailer is a customer: they buy the thing, and the price matters.
// A Shopify agency is not a customer at all — they build stores for retailers, so
// pitching them a subscription is pitching the wrong person. What they want to
// know is what they get for putting it in front of their own clients.
//
// Sending the retail pitch to an agency is the single most common way this kind
// of outreach fails, and it fails silently: the email is well written, it is
// simply addressed to someone with no reason to care.
//
// HOW IT DECIDES, AND WHY THERE IS NO NEW COLUMN. Every contact already carries
// the niche that found it (`industry`), which is the search Genie ran — "Shopify
// development agencies" or "independent furniture retailers". That string is the
// best evidence available and it is already stored, so the audience is read from
// what is there rather than from a migration and a field nobody fills in.
//
// It is a judgement, not a fact, so it is deliberately cautious: anything it is
// not reasonably sure is a partner is treated as a customer. Getting that wrong
// costs a slightly off email; getting it wrong the other way pitches a price to
// somebody who was never going to pay it.

export const CUSTOMER = "customer";
export const PARTNER = "partner";

// Words that mean "this company builds or sells FOR other companies". Whole-word
// matched: "agency" must not fire on "agencies of change" in a company strapline,
// and "studio" is here because a great many Shopify shops are called one.
const PARTNER_WORDS = [
  "agency", "agencies", "studio", "consultancy", "consultant", "consultants",
  "freelancer", "freelance", "developer", "developers", "web design", "web designer",
  "design agency", "digital agency", "dev shop", "systems integrator", "integrator",
  "reseller", "partner", "partners", "solution provider", "shopify expert",
  "shopify experts", "shopify partner", "implementation", "build stores",
];

// Words that say "this is the end business", which win over a partner word when
// both appear: "furniture retailer web design" is a retailer, not an agency.
const CUSTOMER_WORDS = [
  "retailer", "retailers", "store", "stores", "shop", "shops", "brand", "brands",
  "merchant", "merchants", "boutique", "showroom", "manufacturer", "wholesaler",
];

const norm = (s) => ` ${String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const hasWord = (hay, word) => hay.includes(` ${word} `);

/**
 * Which kind of company is this? Reads the niche that found them first, because
 * that is the search Genie actually ran, then falls back to the company name.
 * Returns PARTNER only when the evidence is reasonably clear.
 */
export function audienceOf(contact) {
  // A default only fills in for `undefined`, never for `null`, and a null row out
  // of the database would otherwise take the whole nightly send down.
  const c = contact || {};
  const niche = norm(c.industry);
  const nameish = norm(`${c.company || ""} ${c.domain || ""}`);

  const partnerInNiche = PARTNER_WORDS.some((w) => hasWord(niche, w));
  const customerInNiche = CUSTOMER_WORDS.some((w) => hasWord(niche, w));

  // The niche is the strongest signal: it is the query Genie chose to run.
  if (partnerInNiche && !customerInNiche) return PARTNER;
  if (customerInNiche) return CUSTOMER;

  // Nothing in the niche. A company literally called a studio or an agency is
  // good enough evidence on its own.
  if (PARTNER_WORDS.some((w) => hasWord(nameish, w))) return PARTNER;

  // Not sure. A customer email sent to an agency is a wasted message; a partner
  // email sent to a customer offers them a revenue share on a thing they do not
  // sell, which is worse. So the uncertain case is the ordinary one.
  return CUSTOMER;
}

/** The label a human reads in a log or on a card. */
export function audienceLabel(a) {
  return a === PARTNER ? "partner" : "customer";
}

/**
 * Split a list of contacts by audience, keeping the original order within each.
 * Used by the nightly run so it resolves the plan once per audience rather than
 * once per contact.
 */
export function splitByAudience(contacts = []) {
  const out = { [CUSTOMER]: [], [PARTNER]: [] };
  for (const c of contacts || []) out[audienceOf(c)].push(c);
  return out;
}
