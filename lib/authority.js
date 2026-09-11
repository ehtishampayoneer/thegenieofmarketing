// lib/authority.js
// ── IS THIS SITE WORTH PITCHING? ──
// Every earned-media play finds sites and drafts outreach for them, and until
// now it had no idea whether any of them mattered. A dead blog with four readers
// got the same effort as a trade publication, and the owner spent their daily
// send limit finding out.
//
// OpenPageRank gives a 0-10 authority score and a referring-domain count for a
// domain. Free tier is 30,000 domains a month, 60 requests a minute, 100 domains
// per call, which is far beyond anything Genie will use.
//
// HONESTY. This is an open-data estimate of authority, not Google's opinion, and
// it is not Ahrefs DR or Moz DA even though it looks like them. It is used for
// RANKING and FILTERING only. It is never shown as though it were a real Google
// metric, and a site is never rejected on this number alone, because a small,
// perfectly relevant niche blog will always score low and is often the better
// pitch.
//
// Without OPENPAGERANK_API_KEY everything here returns nulls and every caller
// carries on exactly as before. Scoring is an improvement, never a dependency.

const ENDPOINT = "https://openpagerank.keywordseverywhere.com/v1/domains/bulk";
const BATCH = 100;   // the API's own per-request maximum

// Cached for the process lifetime. A domain's authority does not change between
// two calls a minute apart, and discovery meets the same big names constantly.
const CACHE = new Map();
const TTL_MS = 12 * 60 * 60 * 1000;

const clean = (d) => String(d || "").trim().toLowerCase()
  .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];

/**
 * Score domains. Returns a Map of domain -> { score, rank, referringDomains }.
 * Unknown or unscored domains are simply absent, never guessed at.
 */
export async function scoreDomains(domains = []) {
  const out = new Map();
  const key = process.env.OPENPAGERANK_API_KEY;

  const wanted = [...new Set(domains.map(clean).filter(Boolean))];
  if (!wanted.length) return out;

  // Serve what we can from cache first, so a repeat run costs no quota at all.
  const now = Date.now();
  const misses = [];
  for (const d of wanted) {
    const hit = CACHE.get(d);
    if (hit && now - hit.at < TTL_MS) out.set(d, hit.value);
    else misses.push(d);
  }
  if (!key || !misses.length) return out;

  for (let i = 0; i < misses.length; i += BATCH) {
    const chunk = misses.slice(i, i + BATCH);
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ domains: chunk }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) break;   // out of quota or rate limited: stop, keep what we have
      const j = await r.json();
      const rows = Array.isArray(j?.domains) ? j.domains : Array.isArray(j?.data) ? j.data : [];
      for (const row of rows) {
        const d = clean(row?.domain || row?.url);
        if (!d) continue;
        const value = {
          score: Number(row?.open_page_rank ?? row?.page_rank_decimal ?? 0) || 0,
          rank: Number(row?.rank) || null,
          referringDomains: Number(row?.referring_domains) || null,
        };
        CACHE.set(d, { value, at: now });
        out.set(d, value);
      }
    } catch { break; }   // never let a scoring problem break a discovery run
  }
  return out;
}

/**
 * Attach authority to a list of items that each carry a `domain`, then order by
 * it. Items the API did not score keep their original relative order at the end
 * rather than being dropped: an unscored domain is unknown, not bad.
 */
export async function rankByAuthority(items = [], { min = 0 } = {}) {
  if (!items.length) return items;
  const scores = await scoreDomains(items.map((i) => i.domain));
  if (!scores.size) return items;

  const withScore = items.map((i, idx) => {
    const a = scores.get(clean(i.domain));
    return { ...i, authority: a ? a.score : null, referringDomains: a ? a.referringDomains : null, _idx: idx };
  });

  // `min` exists to drop the genuinely dead, not to chase big numbers. Anything
  // unscored survives regardless, because absence of data is not evidence.
  const kept = min > 0 ? withScore.filter((i) => i.authority == null || i.authority >= min) : withScore;

  return kept
    .sort((a, b) => {
      if (a.authority == null && b.authority == null) return a._idx - b._idx;
      if (a.authority == null) return 1;
      if (b.authority == null) return -1;
      return b.authority - a.authority;
    })
    .map(({ _idx, ...rest }) => rest);
}

// A plain-language label. The number alone means nothing to a business owner,
// and showing "4.2" without context invites them to read it as a Google score.
export function authorityLabel(score) {
  if (score == null) return null;
  if (score >= 6) return "Major site";
  if (score >= 4) return "Strong site";
  if (score >= 2) return "Established";
  return "Small site";
}
