// lib/search.js
// Lightweight discovery without paid APIs. Uses DuckDuckGo's HTML endpoint to
// find live pages/threads for a query. Returns {title, url, snippet}. Now wrapped
// in the resilience layer: cached (dedupe identical searches), retried on
// transient failure, with a gated paid fallback (SerpAPI) when the free source is
// blocked — and optional usage metering. Results are FOUND OPPORTUNITIES to
// verify, never guarantees.

import * as cheerio from "cheerio";
import { cacheGet, cacheSet } from "@/lib/cache";
import { retry } from "@/lib/resilience";
import { recordUsage } from "@/lib/usage";
import { getGenieContext } from "@/lib/context";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const REDDIT_UA = "web:marketing-genie:1.0 (buyer-intent radar)"; // Reddit blocks generic UAs
const CACHE_TTL = 6 * 3600 * 1000; // 6h — search results don't churn minute to minute

export async function webSearch(query, { site = "", limit = 8, ctx = null } = {}) {
  ctx = ctx || getGenieContext();
  const q = site ? `${query} site:${site}` : query;
  const key = `ddg:${limit}:${q}`;
  const started = Date.now();

  const cached = cacheGet(key);
  if (cached) {
    meter(ctx, { provider: "cache", tokensOut: cached.length, cached: true, latencyMs: 0, ok: true });
    return cached;
  }

  // Real search APIs first — they work from datacenter IPs (where DDG is blocked).
  // Each returns [] when unconfigured, so the free DDG path below still runs.
  //   1. Google Programmable Search — genuinely free (100 queries/day, no card).
  //   2. Brave — reliable but its free tier now needs a card on file.
  const gcse = await googleCseSearch(q, limit, ctx);
  if (gcse.length) { cacheSet(key, gcse, CACHE_TTL); return gcse; }
  const brave = await braveSearch(q, limit, ctx);
  if (brave.length) { cacheSet(key, brave, CACHE_TTL); return brave; }

  try {
    let out = await retry(() => ddgFetch(q, limit), { tries: 2, retryOn: () => true });
    // The html endpoint is frequently blocked from datacenter IPs (Vercel). The
    // "lite" endpoint is lighter and tolerates scraping more often — try it free
    // before spending the paid fallback.
    if (!out.length) { try { out = await ddgLiteFetch(q, limit); } catch {} }
    if (out.length) {
      cacheSet(key, out, CACHE_TTL);
      meter(ctx, { provider: "duckduckgo", tokensOut: out.length, cached: false, latencyMs: Date.now() - started, ok: true });
      return out;
    }
    // Still empty (often a block) → try the paid fallback if configured.
    const paid = await paidSearch(q, limit, ctx);
    return paid.length ? paid : out;
  } catch {
    meter(ctx, { provider: "duckduckgo", tokensOut: 0, cached: false, latencyMs: Date.now() - started, ok: false });
    try { const lite = await ddgLiteFetch(q, limit); if (lite.length) return lite; } catch {}
    return paidSearch(q, limit, ctx);
  }
}

// DuckDuckGo "lite" — a stripped table-only page, more scraper-tolerant than the
// html endpoint. Results are <a class="result-link"> rows; hrefs are direct or a
// /l/?uddg= redirect. Free, no key. Returns [] on any block/error.
async function ddgLiteFetch(q, limit) {
  const res = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html" },
    body: `q=${encodeURIComponent(q)}`,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`ddglite_${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const out = [];
  $("a.result-link").each((_, el) => {
    if (out.length >= limit) return;
    const a = $(el);
    const title = a.text().trim();
    let href = a.attr("href") || "";
    const m = href.match(/[?&]uddg=([^&]+)/);
    if (m) href = decodeURIComponent(m[1]);
    if (href.startsWith("//")) href = "https:" + href;
    const snippet = a.closest("tr").nextAll("tr").find(".result-snippet").first().text().trim();
    if (title && href && /^https?:\/\//.test(href)) out.push({ title, url: href, snippet });
  });
  return out;
}

async function ddgFetch(q, limit) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ddg_${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const out = [];
  $(".result").each((_, el) => {
    if (out.length >= limit) return;
    const a = $(el).find("a.result__a").first();
    const title = a.text().trim();
    let href = a.attr("href") || "";
    const m = href.match(/[?&]uddg=([^&]+)/);
    if (m) href = decodeURIComponent(m[1]);
    const snippet = $(el).find(".result__snippet").text().trim();
    if (title && href && /^https?:\/\//.test(href)) out.push({ title, url: href, snippet });
  });
  return out;
}

// Google Programmable Search (Custom Search JSON API) — genuinely free: 100 queries
// per day, NO credit card required. Needs a search-engine id (GOOGLE_CSE_ID, the
// "cx" from programmablesearchengine.google.com) and an API key (GOOGLE_CSE_KEY, or
// reuse the existing GOOGLE_API_KEY / PAGESPEED_API_KEY). Returns [] when either is
// missing or on quota/error, so callers fall through to the next source.
async function googleCseSearch(q, limit, ctx) {
  const cx = process.env.GOOGLE_CSE_ID;
  const key = process.env.GOOGLE_CSE_KEY || process.env.GOOGLE_API_KEY || process.env.PAGESPEED_API_KEY;
  if (!cx || !key) return [];
  const started = Date.now();
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&num=${Math.min(limit, 10)}&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`gcse_${res.status}`);
    const data = await res.json();
    const out = (data?.items || []).slice(0, limit)
      .map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || "" }))
      .filter((r) => r.title && /^https?:\/\//.test(r.url));
    meter(ctx, { provider: "google-cse", model: "search", tokensOut: out.length, cached: false, latencyMs: Date.now() - started, ok: true });
    return out;
  } catch {
    meter(ctx, { provider: "google-cse", model: "search", tokensOut: 0, cached: false, latencyMs: Date.now() - started, ok: false });
    return [];
  }
}

// Brave Search API — reliable from datacenter IPs, but its free tier now requires a
// card on file. Kept as an optional provider: needs BRAVE_SEARCH_API_KEY. Returns []
// on missing key / rate limit (429) / any error, so callers fall through.
async function braveSearch(q, limit, ctx) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  const started = Date.now();
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${Math.min(limit, 20)}`;
    const res = await fetch(url, { headers: { "X-Subscription-Token": key, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`brave_${res.status}`);
    const data = await res.json();
    const out = (data?.web?.results || []).slice(0, limit)
      .map((r) => ({ title: r.title, url: r.url, snippet: r.description || "" }))
      .filter((r) => r.title && /^https?:\/\//.test(r.url));
    meter(ctx, { provider: "brave", model: "search", tokensOut: out.length, cached: false, latencyMs: Date.now() - started, ok: true });
    return out;
  } catch {
    meter(ctx, { provider: "brave", model: "search", tokensOut: 0, cached: false, latencyMs: Date.now() - started, ok: false });
    return [];
  }
}

// Gated paid fallback (SerpAPI). Provider-agnostic: swap the adapter, not callers.
// Costs money, so only used when the free source fails AND a key is configured.
async function paidSearch(q, limit, ctx) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  const started = Date.now();
  try {
    const url = `https://serpapi.com/search.json?engine=google&num=${limit}&q=${encodeURIComponent(q)}&api_key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`serpapi_${res.status}`);
    const data = await res.json();
    const out = (data.organic_results || []).slice(0, limit).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || "" })).filter((r) => r.title && /^https?:\/\//.test(r.url));
    meter(ctx, { provider: "serpapi", model: "search-paid", tokensOut: out.length, cached: false, latencyMs: Date.now() - started, ok: true });
    return out;
  } catch {
    return [];
  }
}

function meter(ctx, u) {
  // Always metered — system client when no request context.
  recordUsage(ctx?.supabase, { userId: ctx?.userId || null, host: ctx?.host || null, kind: "data", model: "search", ...u }).catch(() => {});
}

// Find live Reddit threads for a query — FREE, ranked by "liveliness" (recent +
// discussed) so Genie replies where a comment will actually be seen. Three tiers,
// best first: (1) Reddit's official API via a FREE app (app-only OAuth) — reliable
// from datacenter IPs; (2) the public search JSON — works from some IPs; (3) the
// web-search site:reddit.com path. Richer than scraping: real upvotes/comments/age.
export async function redditSearch(query, { limit = 8, ctx = null } = {}) {
  ctx = ctx || getGenieContext();
  const cacheKey = `reddit:${limit}:${query}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let out = await redditApiSearch(query, limit, ctx);            // free app (OAuth) — reliable
  if (!out || !out.length) out = await redditJsonSearch(query, limit, ctx); // public .json — best-effort
  if (!out.length) {
    // Final fallback: the free web-search path (DuckDuckGo site:reddit.com, then paid).
    const web = await webSearch(query, { site: "reddit.com", limit: limit * 2, ctx });
    out = web
      .map((r) => {
        const m = r.url.match(/reddit\.com\/(r\/[A-Za-z0-9_]+)\/comments\/([A-Za-z0-9]+)/);
        return m ? { ...r, subreddit: m[1], threadId: m[2], comments: 0, score: 0, createdUtc: 0 } : null;
      })
      .filter(Boolean);
  }

  const nowS = Date.now() / 1000;
  out = out
    .map((r) => {
      const ageDays = r.createdUtc ? (nowS - r.createdUtc) / 86400 : 999;
      const freshness = ageDays < 365 ? Math.max(0, 1 - ageDays / 365) : 0;
      return { ...r, _live: (r.comments || 0) * 0.5 + (r.score || 0) * 0.1 + freshness * 20 };
    })
    .sort((a, b) => (b._live || 0) - (a._live || 0))
    .slice(0, limit);

  if (out.length) cacheSet(cacheKey, out, CACHE_TTL);
  return out;
}

function parseRedditChildren(data) {
  return (data?.data?.children || [])
    .map((c) => c?.data).filter(Boolean)
    .filter((d) => !d.over_18 && d.permalink && d.title && (d.num_comments || 0) >= 1)
    .map((d) => ({
      title: d.title,
      url: `https://www.reddit.com${d.permalink}`,
      snippet: String(d.selftext || "").slice(0, 200),
      subreddit: d.subreddit ? `r/${d.subreddit}` : null,
      threadId: d.id,
      comments: d.num_comments || 0,
      score: d.score || 0,
      createdUtc: d.created_utc || 0,
    }));
}

// Reddit's public search JSON — no key. Often 403'd from datacenter IPs (Vercel),
// so it's a best-effort middle tier; returns [] when blocked and we fall through.
async function redditJsonSearch(query, limit, ctx) {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&t=year&type=link&limit=${Math.min(limit * 3, 25)}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": REDDIT_UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`reddit_${res.status}`);
    const out = parseRedditChildren(await res.json());
    meter(ctx, { provider: "reddit", tokensOut: out.length, cached: false, latencyMs: Date.now() - started, ok: true });
    return out;
  } catch {
    meter(ctx, { provider: "reddit", tokensOut: 0, cached: false, latencyMs: Date.now() - started, ok: false });
    return [];
  }
}

// Reddit's official API via a FREE app (app-only OAuth). Reliable where the public
// .json is blocked. Needs REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (free, 2-min setup
// at reddit.com/prefs/apps). Returns null when no creds so the caller falls through.
let _redToken = { token: null, exp: 0 };
async function redditToken() {
  const id = process.env.REDDIT_CLIENT_ID, secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (_redToken.token && Date.now() < _redToken.exp) return _redToken.token;
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": REDDIT_UA,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j.access_token) return null;
    _redToken = { token: j.access_token, exp: Date.now() + Math.min((j.expires_in || 3600) - 300, 3300) * 1000 };
    return _redToken.token;
  } catch { return null; }
}
async function redditApiSearch(query, limit, ctx) {
  const token = await redditToken();
  if (!token) return null; // no free-app creds configured → let the caller fall through
  const url = `https://oauth.reddit.com/search?q=${encodeURIComponent(query)}&sort=relevance&t=year&type=link&limit=${Math.min(limit * 3, 25)}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "User-Agent": REDDIT_UA }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`reddit_oauth_${res.status}`);
    const out = parseRedditChildren(await res.json());
    meter(ctx, { provider: "reddit-oauth", tokensOut: out.length, cached: false, latencyMs: Date.now() - started, ok: true });
    return out;
  } catch {
    meter(ctx, { provider: "reddit-oauth", tokensOut: 0, cached: false, latencyMs: Date.now() - started, ok: false });
    return null;
  }
}
