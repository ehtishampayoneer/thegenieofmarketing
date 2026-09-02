// lib/intent-sources.js
// ── RELIABLE, FREE, KEYLESS BUYER-INTENT SOURCES ──
// The buyer-intent brain (lib/intent.js) was starved because every surface ran
// through web search, which is blocked from datacenter IPs. These sources use real
// public APIs that work from ANY server, with no key and no scraping — so the radar
// finally gets a flood of real "recommend me / alternative to / best X" buyers.
// Each returns [{ title, url, snippet }] shaped like the search results the radar
// already consumes. All best-effort: any error returns [].

const UA = "GenieBot/1.0 (marketing assistant)";
const strip = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Cheap relevance guard: keep a result only if its text shares a meaningful word with
// the query. Cuts the loose noise these keyword APIs return (e.g. an unrelated "Ask HN"
// story) while keeping the gold — anything mentioning the queried product/competitor.
// The radar's intent scorer + AI fit-check do the fine filtering after this.
const STOP = new Set("the a an for to of and or best how do i is are with in on at by vs versus alternative alternatives need looking recommend recommendation suggestion app apps tool tools software service services platform online free".split(" "));
function relevant(text, query) {
  const qWords = (String(query || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));
  if (!qWords.length) return true;
  const t = String(text || "").toLowerCase();
  return qWords.some((w) => t.includes(w));
}

async function getJson(url, headers = {}) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Hacker News via the free Algolia API. Goldmine of "Ask HN: best tool for X" and
// "alternative to Y" — high-intent tech/SaaS buyers, exactly the target market.
export async function hnSearch(query, { limit = 6 } = {}) {
  const data = await getJson(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=(story,comment)&hitsPerPage=${Math.min(limit * 2, 20)}`);
  const hits = data?.hits || [];
  const out = [];
  for (const h of hits) {
    const title = strip(h.title || h.story_title || h.comment_text);
    if (!title || title.length < 12) continue;
    const url = h.objectID ? `https://news.ycombinator.com/item?id=${h.objectID}` : h.url;
    if (!url) continue;
    const snippet = strip(h.comment_text || h.story_text || h.title);
    if (!relevant(`${title} ${snippet}`, query)) continue;
    out.push({ title: title.slice(0, 180), url, snippet: snippet.slice(0, 300) });
    if (out.length >= limit) break;
  }
  return out;
}

// Stack Exchange search. NOT one site — the network runs ~180 of them on this
// same free keyless API, and only the `site` parameter changes. That matters a
// lot: pinned to "softwarerecs" this source only ever found software buyers, so
// a bakery or a plumber got nothing from it. lib/intent-verticals.js decides
// which sites fit the business, and this queries them together.
//
// "Home Improvement" (diy) is where someone asks which contractor or material to
// use. "Seasoned Advice" (cooking) is food. "Hardware Recommendations" is
// literally "recommend me a product that does X" — pure buyer intent for anyone
// selling physical things.
//
// An unknown slug is harmless: the API returns an error, getJson turns that into
// null, and this returns nothing for that site while the others still run.
export async function stackExchangeSearch(query, { site = null, sites = null, limit = 6 } = {}) {
  const targets = (sites && sites.length ? sites : [site || "softwarerecs"]).slice(0, 4);

  // Per-site cap so one chatty site cannot crowd out the rest of the blend.
  const perSite = Math.max(2, Math.ceil(limit / targets.length) + 1);

  const batches = await Promise.allSettled(targets.map(async (s) => {
    const data = await getJson(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=${encodeURIComponent(s)}&pagesize=${Math.min(perSite, 10)}&filter=default`);
    return (data?.items || [])
      .filter((i) => i.title && i.link && relevant(i.title, query))
      .map((i) => ({
        title: strip(i.title).slice(0, 180),
        url: i.link,
        snippet: `${i.answer_count || 0} answers · score ${i.score || 0}`,
        seSite: s,
      }));
  }));

  // Interleave so every site gets representation rather than the first one
  // filling the whole quota.
  const lists = batches.filter((b) => b.status === "fulfilled").map((b) => b.value);
  const out = [];
  const seen = new Set();
  for (let i = 0; out.length < limit; i++) {
    let added = false;
    for (const list of lists) {
      if (i >= list.length) continue;
      const r = list[i];
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      out.push(r);
      added = true;
      if (out.length >= limit) break;
    }
    if (!added) break;
  }
  return out;
}

// GitHub issues/discussions search — devs & companies hunting tools or ditching a
// competitor. Free, no key (rate-limited to ~10/min unauthenticated, fine here).
export async function githubSearch(query, { limit = 6 } = {}) {
  const data = await getJson(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}+in:title&per_page=${Math.min(limit, 10)}&sort=updated`, { Accept: "application/vnd.github+json" });
  const items = data?.items || [];
  return items
    .filter((i) => i.title && i.html_url && relevant(`${i.title} ${i.body || ""}`, query))
    .map((i) => ({ title: strip(i.title).slice(0, 180), url: i.html_url, snippet: strip(i.body || "").slice(0, 300) }))
    .slice(0, limit);
}
