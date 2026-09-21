// lib/buyer-angle.js
// ── A SELLER IS LOOKING FOR WAYS TO SELL MORE ──
// Genie hunted for people shopping for a product: "VNTANA alternative", "best
// AR viewer". That only finds anyone when the buyer already knows the category.
// For anything new it finds nobody, because nobody is shopping for it.
//
// The fix is not to hunt complaints either. A furniture retailer rarely posts
// "my returns are too high" — but every week of their working life they look for
// ways to grow: how to increase store sales, which apps are worth installing,
// how to lift conversion, how to cut returns, what other shops are doing. That
// is an active, constant, crowded search, and it is where the seller already is.
//
// So Genie's job is to show up there as ONE OF THE WAYS, and to carry the reason
// it works. Not "we sell AR" but: shoppers see the sofa in their own room, they
// know it fits, they stop hesitating — more orders and fewer returns. The
// mechanism is the argument; the product is just how it is delivered.
//
// This file produces three things every engine can use:
//   growthQueries(ai)  — where a seller looks for ways to grow
//   mechanism(ai)      — why this product produces that growth, in one line
//   awarenessOf(ai)    — whether anyone is comparing products by name at all
//
// No AI call: it runs for every business inside the nightly budget.

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const lower = (s) => clean(s).toLowerCase();

// ── Who the seller is, in the words they would use about themselves ─────────
// "furniture stores and rug retailers" -> "furniture store". Singular, because
// that is how these searches are written: "how to increase furniture store
// sales", not "...furniture stores sales".
export function sellerWords(ai = {}) {
  const raw = Array.isArray(ai?.brief?.segments) && ai.brief.segments.length
    ? ai.brief.segments
    : String(ai?.targetCustomer || "").split(/,| and |;/);
  const out = [];
  for (const r of raw) {
    let s = lower(r).replace(/^(independent|small|local|online|boutique)\s+/, "");
    s = s.replace(/\b(owners?|managers?|businesses)\b/g, "").trim();
    // Singularise the common plural endings so the phrase reads naturally.
    s = s.replace(/\bstores\b/g, "store").replace(/\bshops\b/g, "shop")
         .replace(/\bretailers\b/g, "retailer").replace(/\bbrands\b/g, "brand")
         .replace(/\bsellers\b/g, "seller").replace(/\bcompanies\b/g, "company");
    s = clean(s);
    if (s && s.split(" ").length <= 4 && !out.includes(s)) out.push(s);
    if (out.length >= 2) break;
  }
  return out;
}

// What this product does for the seller's numbers. Read off the owner's own
// problem list where possible, so the words are theirs, and falling back to the
// three outcomes every seller cares about.
const OUTCOME_HINTS = [
  // Owners rarely write "returns". They write "a third of orders come back".
  { test: /return|refund|(?:sent?|come|coming|goes|go) back/i, goal: "reduce returns" },
  { test: /convert|conversion|abandon|basket|cart|checkout/i, goal: "improve conversion rate" },
  { test: /fit|size|scale|dimension|imagine|visuali[sz]|picture it|in their room/i, goal: "help shoppers decide" },
  { test: /traffic|visitor|footfall|reach|awareness/i, goal: "get more customers" },
  { test: /trust|confiden|hesitat|unsure|doubt/i, goal: "build buyer confidence" },
];

export function sellerGoals(ai = {}) {
  const text = [
    Array.isArray(ai?.brief?.problems) ? ai.brief.problems.join(" ") : "",
    ai?.painPoints, ai?.whatTheySell, ai?.differentiator, ai?.summary,
  ].filter(Boolean).join(" ");
  const goals = OUTCOME_HINTS.filter((h) => h.test.test(text)).map((h) => h.goal);
  // Every seller wants this one, and it is the phrase they actually search.
  if (!goals.includes("increase sales")) goals.unshift("increase sales");
  return goals.slice(0, 4);
}

/**
 * Where a seller looks for ways to grow. These are the searches they already
 * run — not questions about this product, which they have never heard of.
 *
 *   "how to increase furniture store sales"
 *   "best apps for furniture store"
 *   "how to reduce returns furniture store"
 *
 * Someone reading or writing these is a seller working on their growth, which
 * is exactly the moment to show them another way.
 */
export function growthQueries(ai = {}, { limit = 6 } = {}) {
  const who = sellerWords(ai);
  if (!who.length) return [];
  const goals = sellerGoals(ai);
  const out = [];
  const push = (q, stage, weight) => {
    const query = clean(q).slice(0, 90);
    if (query.split(" ").length >= 3 && !out.some((x) => x.query === query)) {
      out.push({ query, stage, weight, group: "growth" });
    }
  };

  for (const w of who) {
    // The search every seller runs, and the one this product has to appear in.
    push(`how to increase ${w} sales`, "solution_aware", 0.99);
    // Sellers look for tools by category before they look for a product.
    push(`best apps for ${w}`, "comparing", 0.95);
    push(`${w} marketing ideas`, "solution_aware", 0.88);
    // Then the specific outcome this product moves, in the seller's words.
    for (const g of goals.slice(1, 3)) push(`how to ${g} ${w}`, "solution_aware", 0.93);
  }
  return out.slice(0, limit);
}

/**
 * Why this product grows their sales, as a chain a seller can follow. This is
 * the argument every article, reply and pitch has to make — "we sell AR" means
 * nothing to a furniture retailer; "shoppers see it in their own room, so they
 * stop wondering whether it fits, so fewer orders come back" is the whole case.
 *
 * Built from the owner's own words, never invented: the offer is what they
 * bought, the problems are what it removes, the goals are what it moves.
 */
export function mechanism(ai = {}) {
  const offer = clean(ai?.brief?.offer || ai?.whatTheySell || "");
  const problems = (Array.isArray(ai?.brief?.problems) ? ai.brief.problems : [])
    .map((p) => clean(p)).filter(Boolean).slice(0, 2);
  const goals = sellerGoals(ai);
  if (!offer) return "";
  const parts = [`What it is: ${offer}.`];
  if (problems.length) parts.push(`What it removes for the shopper: ${problems.join("; ")}.`);
  parts.push(`What that does for the seller: ${goals.join(", ")}.`);
  return parts.join(" ");
}

/**
 * How much the buyer already knows, which decides whether comparison queries
 * are worth running at all. "Alternative to X" finds people only when X is a
 * name they have heard of.
 */
export function awarenessOf(ai = {}) {
  const rivals = (ai?.competitors || []).map((c) => c?.name).filter(Boolean);
  if (rivals.length >= 2) return "product";
  if (rivals.length === 1) return "solution";
  return "growth";
}
