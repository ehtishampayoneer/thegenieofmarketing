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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const CACHE_TTL = 6 * 3600 * 1000; // 6h — search results don't churn minute to minute

export async function webSearch(query, { site = "", limit = 8, ctx = null } = {}) {
  const q = site ? `${query} site:${site}` : query;
  const key = `ddg:${limit}:${q}`;
  const started = Date.now();

  const cached = cacheGet(key);
  if (cached) {
    meter(ctx, { provider: "cache", tokensOut: cached.length, cached: true, latencyMs: 0, ok: true });
    return cached;
  }

  try {
    const out = await retry(() => ddgFetch(q, limit), { tries: 2, retryOn: () => true });
    if (out.length) {
      cacheSet(key, out, CACHE_TTL);
      meter(ctx, { provider: "duckduckgo", tokensOut: out.length, cached: false, latencyMs: Date.now() - started, ok: true });
      return out;
    }
    // Empty (often a block) → try the paid fallback if configured.
    const paid = await paidSearch(q, limit, ctx);
    return paid.length ? paid : out;
  } catch {
    meter(ctx, { provider: "duckduckgo", tokensOut: 0, cached: false, latencyMs: Date.now() - started, ok: false });
    return paidSearch(q, limit, ctx);
  }
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
  if (!ctx) return;
  recordUsage(ctx.supabase, { userId: ctx.userId, host: ctx.host, kind: "data", model: "search", ...u }).catch(() => {});
}

// Find live Reddit threads for a query. Returns results with subreddit parsed.
export async function redditSearch(query, { limit = 8, ctx = null } = {}) {
  const results = await webSearch(query, { site: "reddit.com", limit: limit * 2, ctx });
  return results
    .map((r) => {
      const m = r.url.match(/reddit\.com\/(r\/[A-Za-z0-9_]+)\/comments\/([A-Za-z0-9]+)/);
      if (!m) return null;
      return { ...r, subreddit: m[1], threadId: m[2] };
    })
    .filter(Boolean)
    .slice(0, limit);
}
