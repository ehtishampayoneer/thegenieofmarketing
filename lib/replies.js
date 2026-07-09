// lib/replies.js
// Detects new replies on placements Genie posted, so he can answer every one
// and never go silent. Platform-aware and honest about reliability:
//   - reddit : STRONG — public .json lists all comments on the thread
//   - quora / forum : best-effort scrape (may miss)
//   - x / linkedin : not reliably readable without paid APIs → skipped here,
//     surfaced via traffic/self-report instead.

import * as cheerio from "cheerio";

// Returns { newReplies: [{id, author, text, permalink}], total } or null.
export async function findNewReplies(placement) {
  if (!placement?.target_url) return null;
  try {
    if (placement.platform === "reddit") return await redditReplies(placement);
    if (placement.platform === "quora" || placement.platform === "forum") return await scrapeReplies(placement);
    return null; // x / linkedin / guest — not reliably readable for free
  } catch {
    return null;
  }
}

async function redditReplies(placement) {
  const jsonUrl = placement.target_url.replace(/\/?$/, "") + ".json";
  const res = await fetch(jsonUrl, { headers: { "User-Agent": "Genie/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const data = await res.json();
  const comments = data?.[1]?.data?.children || [];
  const seen = new Set(placement.seen_reply_ids || []);
  const newReplies = [];
  let total = 0;

  function walk(children) {
    for (const c of children) {
      if (c.kind !== "t1" || !c.data) continue;
      total++;
      const id = c.data.id;
      if (!seen.has(id)) {
        newReplies.push({
          id,
          author: c.data.author || "someone",
          text: (c.data.body || "").slice(0, 600),
          permalink: c.data.permalink ? `https://www.reddit.com${c.data.permalink}` : placement.target_url,
        });
      }
      // Recurse into nested replies.
      const kids = c.data.replies?.data?.children;
      if (Array.isArray(kids)) walk(kids);
    }
  }
  walk(comments);
  return { newReplies: newReplies.slice(0, 10), total };
}

async function scrapeReplies(placement) {
  const res = await fetch(placement.target_url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Genie/1.0)" }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const html = await res.text();
  const $ = cheerio.load(html);
  const text = $("body").text();
  // We can often read a reply COUNT even if we can't read each reply cleanly.
  const m = text.match(/([\d,]+)\s*(answers|comments|replies)/i);
  const count = m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
  const prev = placement.reply_count || 0;
  if (count != null && count > prev) {
    // We know there are new replies but can't extract each reliably — flag it.
    return { newReplies: [], total: count, grew: true };
  }
  return { newReplies: [], total: count ?? prev, grew: false };
}
