// lib/search.js
// Lightweight discovery without paid APIs. Uses DuckDuckGo's HTML endpoint to
// find live pages/threads for a query. Returns {title, url, snippet}. Best-effort
// — results are FOUND OPPORTUNITIES to verify, never guarantees.

import * as cheerio from "cheerio";

export async function webSearch(query, { site = "", limit = 8 } = {}) {
  const q = site ? `${query} site:${site}` : query;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const out = [];
    $(".result").each((_, el) => {
      if (out.length >= limit) return;
      const a = $(el).find("a.result__a").first();
      const title = a.text().trim();
      let href = a.attr("href") || "";
      // DDG wraps links in a redirect — extract the real uddg= target.
      const m = href.match(/[?&]uddg=([^&]+)/);
      if (m) href = decodeURIComponent(m[1]);
      const snippet = $(el).find(".result__snippet").text().trim();
      if (title && href && /^https?:\/\//.test(href)) out.push({ title, url: href, snippet });
    });
    return out;
  } catch {
    return [];
  }
}

// Find live Reddit threads for a query. Returns results with subreddit parsed.
export async function redditSearch(query, { limit = 8 } = {}) {
  const results = await webSearch(query, { site: "reddit.com", limit: limit * 2 });
  return results
    .map((r) => {
      const m = r.url.match(/reddit\.com\/(r\/[A-Za-z0-9_]+)\/comments\/([A-Za-z0-9]+)/);
      if (!m) return null;
      return { ...r, subreddit: m[1], threadId: m[2] };
    })
    .filter(Boolean)
    .slice(0, limit);
}
