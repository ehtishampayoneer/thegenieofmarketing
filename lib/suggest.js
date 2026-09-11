// lib/suggest.js
// ── WHAT TO TYPE IN THE BOX ──
// Buyer Hunt, Get Featured and Find clients all open with an empty text field and
// no clue what belongs in it. An owner who does not already think in search terms
// types their own brand name, gets nothing back, and concludes the feature is
// broken. The examples that used to sit under Find clients were worse than
// nothing: they were hardcoded for one furniture business, so a plumber was told
// to go after rug e-commerce brands.
//
// Everything here is derived from what the scan already read off the owner's own
// site, so every chip is about THEIR business. Pure and deterministic — no I/O,
// no model call — which is why it can run on every page load and can be tested.
//
// Three surfaces, three different shapes, because they are not the same question:
//
//   featured   — a SPACE you want written about ("handmade wool rugs"). The play
//                wraps it as "best {niche}" / "{niche} write for us", so the chip
//                must be a bare noun phrase. "best area rugs online" would come
//                out as "best best area rugs online" and find nothing. That is
//                why search terms are stripped back to their noun before use.
//   prospects  — a KIND OF COMPANY to sell to ("boutique furniture stores").
//   hunt       — a RIVAL's brand name, because that box hunts people asking for
//                an alternative to a named competitor.
//
// Every chip carries a `why`, naming where it came from. That matters more than
// it looks: a suggestion with no provenance reads as a guess and the owner has no
// way to judge it. "from your homepage" is checkable.

const QUOTES = /[“”‘’"']/g;

export function norm(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Modifiers that belong in a search box but ruin a niche. Stripped from both
// ends, repeatedly, because real keywords stack them ("best cheap rugs uk").
const LEAD = /^(the|a|an|best|top|cheap|cheapest|affordable|luxury|premium|buy|buying|order|shop|get|find|hire|book|custom|free|online|discount)\s+/i;
const TRAIL = /\s+(near me|nearby|online|for sale|in stock|reviews?|ratings?|prices?|pricing|cost|costs|deals?|discounts?|uk|usa|us|canada|australia|cheap|free)$/i;

/** Strip a search phrase back to the bare thing it is about. */
export function cleanNiche(raw) {
  let s = String(raw || "").toLowerCase().replace(QUOTES, "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 4 && LEAD.test(s); i++) s = s.replace(LEAD, "").trim();
  for (let i = 0; i < 4 && TRAIL.test(s); i++) s = s.replace(TRAIL, "").trim();
  // A dangling joining word is left over when a tail is cut off the end.
  return s.replace(/\s+(and|or|for|with|in)$/i, "").trim();
}

// A niche has to be searchable: long enough to mean something, short enough that
// a query built from it still matches pages, and never the owner's own brand —
// nobody publishes a "best <your brand>" roundup you are not already in.
function usable(text, brand) {
  const s = String(text || "").trim();
  if (s.length < 3 || s.length > 48) return false;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;
  if (/[|<>{}]/.test(s)) return false;
  const n = norm(s);
  if (!n) return false;
  if (brand && (n === brand || (brand.length >= 4 && n.includes(brand)))) return false;
  return true;
}

// `overlap: "drop"` also removes a chip that merely restates one already on the
// list. That is right for a niche — "rugs" and "wool rugs" send you to the same
// shelf, so the second is a wasted slot. It is wrong for a target, where
// "independent furniture retailers" is a deliberately narrower group than
// "furniture retailers" and worth searching separately.
function collector(brand, limit, overlap = "drop") {
  const out = [];
  const seen = new Set();
  return {
    add(text, why, extra = {}) {
      if (out.length >= limit) return;
      const t = String(text || "").trim().replace(/\s+/g, " ");
      if (!usable(t, brand)) return;
      const k = norm(t);
      if (!k || seen.has(k)) return;
      if (overlap === "drop") {
        for (const s of seen) if (s.includes(k) || k.includes(s)) return;
      }
      seen.add(k);
      out.push({ text: t, why, ...extra });
    },
    get list() { return out; },
  };
}

function clauses(raw) {
  return String(raw || "")
    .split(/\s*(?:,|;|\/|\band\b|\bor\b|\bplus\b|&)\s*/i)
    .map((s) => s.replace(QUOTES, "").trim())
    .filter(Boolean);
}

// ── GET FEATURED: spaces to be written about ─────────────────────────────────
// Ordered by how well each source describes the CATEGORY rather than the
// company. Real keywords come third because they are grounded in what people
// actually search — but only once the modifiers are stripped off them.
export function nicheSuggestions({ ai = {}, keywords = [], vertical = null, limit = 6 } = {}) {
  const brand = norm(ai.businessName);
  const c = collector(brand, limit);

  c.add(cleanNiche(ai.subCategory), "your category, from your homepage");
  c.add(cleanNiche(ai.industry), "your industry, from your homepage");

  // "handmade wool rugs and runners for modern homes" -> "handmade wool rugs".
  for (const part of clauses(ai.whatTheySell).slice(0, 2)) {
    c.add(cleanNiche(part), "what your site says you sell");
  }

  // The real keyword strategy, biggest demand first. Volume is only present when
  // it came from Google's own data, so a number is only ever shown when it is a
  // measured one.
  const kws = [...(keywords || [])]
    .filter((k) => k && k.keyword)
    .sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0)
      || (Number(a.priority) || 99) - (Number(b.priority) || 99));
  for (const k of kws) {
    const vol = Number(k.volume);
    const real = Number.isFinite(vol) && vol > 0;
    c.add(cleanNiche(k.keyword),
      real ? "people search this every month" : "from your keyword strategy",
      real ? { volume: Math.round(vol) } : {});
  }

  for (const kw of (ai.keywordsToOwn || []).slice(0, 4)) {
    c.add(cleanNiche(kw), "a term your site is built to win");
  }

  // Last resort, and deliberately broad: the vertical Buyer Hunt already tuned
  // itself to. Labels read "Furniture, decor & interiors", so only the first part
  // is used — a comma inside a search query matches nothing useful.
  for (const label of (vertical?.labels || []).slice(0, 2)) {
    c.add(cleanNiche(String(label).split(/[,&]/)[0]), "the market Genie tuned itself to");
  }

  return c.list;
}

// ── FIND CLIENTS: kinds of company to sell to ────────────────────────────────
// Names a GROUP of businesses, never one company. The templates below only fire
// when the phrase already reads as a business type, because "independent
// homeowners" is nonsense in a way that "independent furniture stores" is not.
const BIZ = /\b(stores?|shops?|retailers?|resellers?|brands?|sellers?|merchants?|companies|company|businesses|firms?|agencies|agency|studios?|clinics?|salons?|practices?|contractors?|dealers?|distributors?|manufacturers?|suppliers?|boutiques?|e-?commerce|startups?|vendors?|makers?|builders?|installers?|restaurants?|cafes?|hotels?|gyms?|schools?)\b/i;

export function targetSuggestions({ ai = {}, limit = 5 } = {}) {
  const brand = norm(ai.businessName);
  const c = collector(brand, limit, "keep");
  const parts = clauses(ai.targetCustomer).filter((p) => p.split(/\s+/).length <= 5);

  for (const p of parts.slice(0, 3)) c.add(p, "who your site says you sell to");

  const first = parts[0] || "";
  const market = String(ai.primaryMarket || "").trim();
  // A place narrows the search to companies you could realistically serve, which
  // matters far more to a local trade than to a global store.
  if (first && market && market.split(/\s+/).length <= 3) {
    c.add(`${first} in ${market}`, "your market, from your homepage");
  }
  if (first && BIZ.test(first)) c.add(`independent ${first}`, "smaller firms reply far more often");

  // Nothing usable on the page: build the group out of the category instead, so
  // the box is still not empty. Skipped when the category already names a company
  // type, which would give "furniture stores brands".
  const cat = cleanNiche(ai.subCategory || ai.industry);
  if (cat && !BIZ.test(cat)) c.add(`${cat} brands`, "built from your category");

  return c.list;
}

// ── BUYER HUNT: rivals to poach from ─────────────────────────────────────────
// These come from the scan, where they are explicitly inferred rather than
// verified, so the UI has to say so. A wrong rival costs one wasted hunt, not a
// wasted email, which is why showing them is still worth it.
export function rivalSuggestions({ ai = {}, limit = 6 } = {}) {
  const brand = norm(ai.businessName);
  const out = [];
  const seen = new Set();
  for (const raw of (ai.competitors || [])) {
    const name = String(typeof raw === "string" ? raw : raw?.name || "").trim();
    if (!name || name.length > 40) continue;
    const k = norm(name);
    if (!k || k === brand || seen.has(k)) continue;
    seen.add(k);
    out.push({ text: name, why: "named as a rival when Genie read your site" });
    if (out.length >= limit) break;
  }
  return out;
}

export function suggestionsFor(surface, input = {}) {
  if (surface === "hunt") return rivalSuggestions(input);
  if (surface === "prospects") return targetSuggestions(input);
  return nicheSuggestions(input);
}
