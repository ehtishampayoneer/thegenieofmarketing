// lib/search-health.js
// ── THREE THINGS SEARCH CONSOLE KNOWS THAT GENIE NEVER ASKED ──
// Genie already pulls queries and pages from Search Console to grade keywords.
// It never used that data to catch three problems that quietly cost traffic:
//
//   1. CANNIBALIZATION. Two of your pages show up for the same search, so Google
//      splits the credit and neither ranks as well as one strong page would.
//
//   2. DECLINE. A page is losing clicks. Genie's refresh loop picked pages by AGE
//      (30 days untouched), so a page falling out of Google was never noticed, and
//      a stable page was refreshed for no reason. This compares the last 28 days
//      with the 28 before, per page, and names the searches that fell away.
//
//   3. INDEXING. Genie asks Google to crawl pages but never checked whether they
//      got indexed. The URL Inspection API says, per page, whether it is on Google
//      and if not why: blocked by robots.txt, a noindex tag, a canonical pointing
//      elsewhere, crawled but not indexed. A noindex someone put there on purpose
//      is reported as intentional, not as an error.
//
// All of this reads the OWNER'S site through their Search Console property. It
// never edits their site: findings are reported with a specific next step.
//
// Not included, and why: Google's "Generative AI" impressions report (June 2026)
// exists only in the Search Console website. The API does not expose it, so any
// tool claiming to pull it automatically is reading something else.
//
// The analysis functions are pure (no I/O) and tested; the fetchers are thin.

import { resolveGscProperty, gscQuery, gscDaysAgo } from "@/lib/gsc";
import { safeFetch } from "@/lib/ssrf";

const pathOf = (u) => { try { const x = new URL(u); return x.pathname + (x.search || ""); } catch { return String(u || ""); } };
const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;

// ── 1. CANNIBALIZATION ───────────────────────────────────────────────────────
/**
 * rows: [{ keys:[query, page], clicks, impressions, position }]
 * A query counts when it has real demand and at least two pages each take a real
 * share of its impressions. A second page with 2% of the impressions is noise, not
 * competition.
 */
export function findCannibalization(rows = [], { minQueryImpressions = 50, minShare = 0.15, limit = 10 } = {}) {
  const byQuery = new Map();
  for (const r of rows || []) {
    const [q, page] = r.keys || [];
    if (!q || !page) continue;
    if (!byQuery.has(q)) byQuery.set(q, []);
    byQuery.get(q).push({ page, clicks: Math.round(r.clicks || 0), impressions: Math.round(r.impressions || 0), position: round1(r.position) });
  }
  const out = [];
  for (const [query, pages] of byQuery) {
    const total = pages.reduce((n, p) => n + p.impressions, 0);
    if (total < minQueryImpressions) continue;
    const competing = pages.filter((p) => p.impressions / total >= minShare);
    if (competing.length < 2) continue;
    competing.sort((a, b) => b.clicks - a.clicks || a.position - b.position);
    const [keep, ...others] = competing;
    // Close positions mean Google genuinely cannot tell the pages apart: merge.
    // Far apart means one clearly wins: point the weaker one at it.
    const close = others.every((o) => Math.abs(o.position - keep.position) <= 5);
    out.push({
      query,
      impressions: total,
      keep: keep.page,
      pages: competing,
      advice: close
        ? `Google can't tell ${competing.length} of your pages apart for "${query}". Merge them into ${pathOf(keep.page)} and redirect the others there, or rewrite each so it answers a clearly different question.`
        : `${pathOf(keep.page)} is your strongest page for "${query}". On ${others.map((o) => pathOf(o.page)).join(", ")}, stop targeting that phrase and add a link to ${pathOf(keep.page)} using it as the link text.`,
    });
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, limit);
}

// ── 2. DECLINING PAGES ───────────────────────────────────────────────────────
/**
 * current / previous: [{ keys:[page, query], clicks, impressions, position }]
 * for two equal-length periods. A page is declining when it had enough clicks to
 * matter and lost a real share of them; small pages bounce around by chance.
 */
export function findDecliningPages(current = [], previous = [], { minPrevClicks = 10, minDrop = 0.3, limit = 10 } = {}) {
  const roll = (rows) => {
    const pages = new Map();
    for (const r of rows || []) {
      const [page, query] = r.keys || [];
      if (!page) continue;
      if (!pages.has(page)) pages.set(page, { clicks: 0, impressions: 0, posSum: 0, posW: 0, queries: new Map() });
      const p = pages.get(page);
      const c = Number(r.clicks || 0), i = Number(r.impressions || 0);
      p.clicks += c; p.impressions += i; p.posSum += Number(r.position || 0) * i; p.posW += i;
      if (query) p.queries.set(query, (p.queries.get(query) || 0) + c);
    }
    return pages;
  };
  const cur = roll(current), prev = roll(previous);
  const out = [];
  for (const [page, before] of prev) {
    if (before.clicks < minPrevClicks) continue;
    const now = cur.get(page) || { clicks: 0, impressions: 0, posSum: 0, posW: 0, queries: new Map() };
    const drop = (before.clicks - now.clicks) / before.clicks;
    if (drop < minDrop) continue;
    // The searches that account for the loss are what a rewrite should win back.
    const lost = [...before.queries]
      .map(([q, c]) => ({ query: q, before: c, now: now.queries.get(q) || 0 }))
      .map((x) => ({ ...x, lost: x.before - x.now }))
      .filter((x) => x.lost > 0)
      .sort((a, b) => b.lost - a.lost)
      .slice(0, 5);
    const posBefore = before.posW ? round1(before.posSum / before.posW) : null;
    const posNow = now.posW ? round1(now.posSum / now.posW) : null;
    const fellInRank = posBefore != null && posNow != null && posNow - posBefore >= 2;
    out.push({
      page,
      clicksBefore: Math.round(before.clicks),
      clicksNow: Math.round(now.clicks),
      dropPct: Math.round(drop * 100),
      positionBefore: posBefore,
      positionNow: posNow,
      lostQueries: lost,
      advice: fellInRank
        ? `${pathOf(page)} slipped from about position ${posBefore} to ${posNow}. Update it for ${lost.slice(0, 2).map((l) => `"${l.query}"`).join(" and ") || "its main searches"}: fresher facts, a direct answer near the top, and anything competitors now cover that it does not.`
        : `${pathOf(page)} still ranks about where it did but gets fewer clicks, so the title and description are losing the click. Rewrite them for ${lost.slice(0, 2).map((l) => `"${l.query}"`).join(" and ") || "its main searches"}.`,
    });
  }
  return out.sort((a, b) => (b.clicksBefore - b.clicksNow) - (a.clicksBefore - a.clicksNow)).slice(0, limit);
}

// ── 3. INDEXING ──────────────────────────────────────────────────────────────
/** Turn one URL Inspection result into a plain verdict. */
export function explainInspection(url, result = {}) {
  const idx = result?.inspectionResult?.indexStatusResult || {};
  const verdict = idx.verdict || "VERDICT_UNSPECIFIED";
  const coverage = String(idx.coverageState || "");
  const base = { url, verdict, coverage, lastCrawl: idx.lastCrawlTime || null, googleCanonical: idx.googleCanonical || null, userCanonical: idx.userCanonical || null };

  if (verdict === "PASS") return { ...base, status: "indexed", intentional: false, advice: null };
  if (idx.indexingState === "BLOCKED_BY_META_TAG" || idx.indexingState === "BLOCKED_BY_HTTP_HEADER") {
    return { ...base, status: "noindex", intentional: true, advice: `${pathOf(url)} has a noindex instruction, so Google leaves it out on purpose. If this page should appear in search, remove the noindex tag.` };
  }
  if (idx.robotsTxtState === "DISALLOWED") {
    return { ...base, status: "blocked", intentional: false, advice: `robots.txt blocks Google from ${pathOf(url)}. If it should be in search, remove the Disallow rule that matches it.` };
  }
  if (idx.userCanonical && idx.googleCanonical && idx.userCanonical !== idx.googleCanonical) {
    return { ...base, status: "canonical", intentional: false, advice: `Google chose ${pathOf(idx.googleCanonical)} as the main version instead of ${pathOf(url)}. Make the page more distinct, or point its canonical tag at the version you want indexed.` };
  }
  if (/crawled.*not indexed/i.test(coverage)) {
    return { ...base, status: "crawled_not_indexed", intentional: false, advice: `Google read ${pathOf(url)} and decided not to index it, usually because it looks thin or too similar to another page. Add substance only this page has, and link to it from a page that is indexed.` };
  }
  if (/discovered.*not indexed/i.test(coverage) || /unknown to google/i.test(coverage)) {
    return { ...base, status: "not_crawled", intentional: false, advice: `Google has not crawled ${pathOf(url)} yet. Link to it from your homepage or another indexed page, and make sure it is in your sitemap.` };
  }
  if (idx.pageFetchState && idx.pageFetchState !== "SUCCESSFUL") {
    return { ...base, status: "fetch_error", intentional: false, advice: `Google could not load ${pathOf(url)} (${String(idx.pageFetchState).toLowerCase().replace(/_/g, " ")}). Check the page opens for visitors and returns a normal response.` };
  }
  return { ...base, status: "not_indexed", intentional: false, advice: `${pathOf(url)} is not on Google (${coverage || "no reason given"}). Open it in Search Console's URL Inspection for detail.` };
}

// ── FETCHERS ─────────────────────────────────────────────────────────────────
async function inspect(token, siteUrl, url) {
  const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  return res.json();
}

// Pages worth inspecting: the ones in the sitemap, capped. Inspection is quota'd
// (about 2,000 a day per property), and a nightly check of the main pages is what
// catches a problem; re-inspecting thousands of URLs is not.
async function sitemapUrls(host, cap) {
  // Through the SSRF guard: the host comes from a scan the user typed in.
  const get = async (url) => {
    const { res } = await safeFetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "MarketingGenieBot/1.0" } });
    return res.ok ? res.text() : "";
  };
  try {
    const xml = await get(`https://${host}/sitemap.xml`);
    if (!xml) return [];
    let locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    // A sitemap index lists more sitemaps, not pages: read the first one.
    if (/<sitemapindex/i.test(xml) && locs[0]) {
      locs = [...(await get(locs[0])).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    }
    return locs.filter((u) => { try { return new URL(u).hostname.replace(/^www\./, "") === host; } catch { return false; } }).slice(0, cap);
  } catch { return []; }
}

/**
 * Run all three checks for one host. Returns { available:false, reason } when there
 * is no Search Console property for it.
 */
export async function runSearchHealth(token, host, { inspectCap = 15 } = {}) {
  const site = await resolveGscProperty(token, host);
  if (!site) return { available: false, reason: "no_property" };

  const end = gscDaysAgo(3);          // Search Console lags two to three days
  const mid = gscDaysAgo(31);
  const midPrev = gscDaysAgo(32);
  const start = gscDaysAgo(60);

  const [curPQ, prevPQ] = await Promise.all([
    gscQuery(token, site, { startDate: mid, endDate: end, dimensions: ["page", "query"], rowLimit: 5000 }),
    gscQuery(token, site, { startDate: start, endDate: midPrev, dimensions: ["page", "query"], rowLimit: 5000 }),
  ]);

  // Same rows, keys swapped to [query, page] for the cannibalization view.
  const cannibalization = findCannibalization((curPQ.rows || []).map((r) => ({ ...r, keys: [r.keys?.[1], r.keys?.[0]] })));
  const declining = findDecliningPages(curPQ.rows || [], prevPQ.rows || []);

  let urls = await sitemapUrls(host, inspectCap);
  if (!urls.length) urls = [`https://${host}/`];
  const inspections = [];
  for (const u of urls) {
    const r = await inspect(token, site, u);
    if (r) inspections.push(explainInspection(u, r));
  }
  const problems = inspections.filter((i) => i.status !== "indexed" && !i.intentional);

  return {
    available: true,
    site,
    checkedAt: new Date().toISOString(),
    period: { current: { start: mid, end }, previous: { start, end: midPrev } },
    cannibalization,
    declining,
    indexing: { checked: inspections.length, indexed: inspections.filter((i) => i.status === "indexed").length, intentional: inspections.filter((i) => i.intentional), problems },
  };
}
