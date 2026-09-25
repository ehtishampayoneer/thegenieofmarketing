// lib/wikidata.js
// ── THE BIG FISH LANE ──
//
// Genie finds companies by searching the web, which is excellent at finding the
// shop down the road and poor at finding the chain with two hundred of them. Web
// search returns whoever wrote the best page about themselves; it has no idea who
// is large. So the list skewed small, every night, and nobody could see it
// happening — the results looked fine, they were simply never the companies worth
// the most.
//
// Wikidata is the correction. It is free, needs no key and no signup, and it knows
// what web search does not: that this company is a furniture retail chain, that it
// employs thirty thousand people, and that it operates in Denmark. Verified
// working from a serverless box: a real query returned IKEA, Jysk, Habitat,
// Ashley, DFS and Freedom Furniture in about two seconds.
//
// WHAT IT DOES NOT DO. It never supplies a contact address, and it must not. Every
// email Genie sends has to come from an address the company published on its own
// site — that rule is the load-bearing wall of the whole product (lib/contact-source).
// Wikidata contributes a name and a website; the address is still read off that
// website exactly as before, so provenance is untouched.
//
// AND IT IS A LEAD, NOT A TRUTH. Community-maintained data is uneven: some entries
// are stale, some companies are missing entirely, some are duplicated across
// countries. So it adds candidates and never filters anyone out.

import { logger } from "@/lib/log";

// Wikidata asks every tool to identify itself and to be gentle. Both are cheap.
const UA = "MarketingGenie/1.0 (https://thegenieofmarketing.vercel.app; prospect research)";
const SPARQL = "https://query.wikidata.org/sparql";
const SEARCH = "https://www.wikidata.org/w/api.php";
const TIMEOUT_MS = 12000;

// The same niche is searched every night. One in-process cache spares the endpoint
// and makes the second call of a run instant. Small and short-lived on purpose:
// this is a serverless box, not a database.
const CACHE = new Map();
const CACHE_MS = 6 * 3600 * 1000;
const cached = (k) => { const h = CACHE.get(k); return h && Date.now() - h.at < CACHE_MS ? h.v : null; };
const remember = (k, v) => { CACHE.set(k, { at: Date.now(), v }); if (CACHE.size > 60) CACHE.delete(CACHE.keys().next().value); return v; };

async function get(url, { accept = "application/json" } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: accept },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`wikidata_${res.status}`);
  return res.json();
}

/**
 * Turn a niche in the owner's words into the thing Wikidata calls it.
 * "furniture retailers" → Q104817981 (a company selling furniture).
 * Returns null when there is no sensible match, which is common and fine.
 */
// Owners write "furniture retailers"; Wikidata files it under "furniture
// retailer". That one letter was the difference between six global chains and
// nothing at all, so the plural is undone before asking.
function singular(word) {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, "y");
  if (/(ch|sh|ss|x|z)es$/i.test(word)) return word.replace(/es$/i, "");
  if (/[^s]s$/i.test(word)) return word.replace(/s$/i, "");
  return word;
}

// What to ask for, narrowest first. Wikidata's coverage of retail categories is
// good and its coverage of service niches is thin, so an owner selling to "rug
// shops" gets nothing here — which is the correct answer, not a failure. It
// simply adds nobody and web search carries the night as before.
function candidates(term) {
  const q = String(term || "").trim().toLowerCase().replace(/\s+/g, " ");
  const words = q.split(" ").filter(Boolean);
  const sing = words.map((w, i) => (i === words.length - 1 ? singular(w) : w)).join(" ");
  const head = words.slice(0, -1).join(" ");
  const out = [q, sing];
  // "furniture stores" also files as "furniture retailer" and "furniture company".
  if (head) out.push(`${head} retailer`, `${head} company`);
  return [...new Set(out.filter((x) => x.length >= 3))].slice(0, 4);
}

export async function resolveIndustry(term) {
  const q = String(term || "").trim().toLowerCase();
  if (q.length < 3) return null;
  const key = `ind:${q}`;
  const hit = cached(key);
  if (hit !== undefined && hit !== null) return hit;
  if (CACHE.has(key)) return CACHE.get(key).v; // a remembered "no match" is an answer

  // An entry whose description says it is a kind of COMPANY, not an industry
  // classification code or a profession. "Furniture Retailers (NAICS industry
  // classification)" has no instances at all and returns an empty list.
  const isCompanyClass = (r) => /company|business|retailer|chain|manufacturer|firm|store|agency/i.test(r?.description || "");

  for (const candidate of candidates(q)) {
    try {
      const url = `${SEARCH}?action=wbsearchentities&search=${encodeURIComponent(candidate)}&language=en&type=item&limit=8&format=json&origin=*`;
      const j = await get(url);
      const pick = (Array.isArray(j?.search) ? j.search : []).find(isCompanyClass);
      if (pick) return remember(key, { id: pick.id, label: pick.label, description: pick.description || "", matched: candidate });
    } catch (e) {
      // The search API throttles quickly, and its refusal is plain text rather
      // than JSON. Stop asking rather than walking the rest of the list into the
      // same wall; the nightly run will have it from cache next time.
      logger.warn("wikidata.resolve_failed", { term: candidate, error: String(e?.message || e).slice(0, 120) });
      break;
    }
  }
  return remember(key, null);
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

/**
 * Companies of a given kind, largest first, each with the website Genie will then
 * read a published address from.
 *
 * @param niche     the owner's own words for who they sell to
 * @param country   optional English country name to narrow to, e.g. "United Kingdom"
 * @returns [{ name, website, domain, employees, country, source: "wikidata" }]
 *          Always an array. Never throws.
 */
export async function bigCompanies(niche, { country = null, limit = 25 } = {}) {
  const industry = await resolveIndustry(niche);
  if (!industry) return [];

  const key = `co:${industry.id}:${String(country || "").toLowerCase()}:${limit}`;
  const hit = cached(key);
  if (hit) return hit;

  // wdt:P31/wdt:P279* walks up the subclass tree, so "furniture retail chain"
  // counts as a "furniture retailer" without naming every sub-kind by hand.
  // A website is required: a company Genie cannot read is a company it cannot
  // find an address for, and would only take a slot from one it can.
  const filter = country
    ? `?c wdt:P17 ?country . ?country rdfs:label "${String(country).replace(/["\\]/g, "")}"@en .`
    : "OPTIONAL { ?c wdt:P17 ?country }";
  const query = `SELECT ?c ?cLabel ?site ?emp ?countryLabel WHERE {
  ?c wdt:P31/wdt:P279* wd:${industry.id} ; wdt:P856 ?site .
  OPTIONAL { ?c wdt:P1128 ?emp }
  ${filter}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT ${Math.min(120, Math.max(10, limit * 4))}`;

  let rows = [];
  try {
    const j = await get(`${SPARQL}?format=json&query=${encodeURIComponent(query)}`, { accept: "application/sparql-results+json" });
    rows = j?.results?.bindings || [];
  } catch (e) {
    logger.warn("wikidata.query_failed", { industry: industry.id, error: String(e?.message || e).slice(0, 120) });
    return [];
  }

  // One row per company. The same chain appears once per country it trades in,
  // and a duplicate in the list is a second email to the same inbox.
  const byDomain = new Map();
  for (const r of rows) {
    const website = r?.site?.value || "";
    const domain = domainOf(website);
    const name = r?.cLabel?.value || "";
    // An unresolved label comes back as the raw Q-number, which is not a company
    // name and must never reach an email.
    if (!domain || !name || /^Q\d+$/.test(name)) continue;
    const employees = Number(r?.emp?.value);
    const prior = byDomain.get(domain);
    if (prior && !(Number.isFinite(employees) && employees > (prior.employees || 0))) continue;
    byDomain.set(domain, {
      name, website, domain,
      employees: Number.isFinite(employees) ? employees : null,
      country: r?.countryLabel?.value || null,
      source: "wikidata",
    });
  }

  // Largest known first: that is the entire point of this lane. Companies with no
  // headcount recorded keep their place behind the ones that do rather than being
  // dropped, because a missing number is a gap in Wikidata, not a small company.
  const out = [...byDomain.values()].sort((a, b) => (b.employees || 0) - (a.employees || 0)).slice(0, limit);
  return remember(key, out);
}

/** One line for the log and the prospect card, so the source is never a mystery. */
export function bigFishNote(company) {
  if (!company || company.source !== "wikidata") return "";
  const size = company.employees ? `${company.employees.toLocaleString()} employees` : "a chain";
  const where = company.country ? `, ${company.country}` : "";
  return `Found in public company records as ${size}${where} — a larger buyer than web search alone surfaces.`;
}
