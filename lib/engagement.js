// lib/engagement.js
// Reads what actually happened to a placement Genie posted. Platform-aware and
// honest about reliability:
//   - reddit : strong — public .json exposes upvotes + comment count
//   - quora / forum / guest : best-effort — we fetch the page and look for
//     coarse signals; less reliable, clearly weaker than Reddit.
// Everything runs server-side, inside Genie. Returns a normalized snapshot.

import * as cheerio from "cheerio";

export async function readEngagement(placement) {
  const url = placement.target_url;
  if (!url) return null;
  try {
    if (placement.platform === "reddit") return await readReddit(url);
    return await readGeneric(url);
  } catch {
    return null;
  }
}

async function readReddit(url) {
  // Reddit exposes clean JSON by appending .json to a thread URL.
  const jsonUrl = url.replace(/\/?$/, "") + ".json";
  const res = await fetch(jsonUrl, {
    headers: { "User-Agent": "Genie/1.0 (marketing assistant)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  // The thread's own post is the first listing's first child.
  const post = data?.[0]?.data?.children?.[0]?.data;
  if (!post) return null;
  const upvotes = post.ups ?? post.score ?? 0;
  const comments = post.num_comments ?? 0;
  // Score = upvotes weighted + comments (discussion is high value).
  const score = upvotes + comments * 3;
  return { upvotes, comments, views: null, score, checked_at: new Date().toISOString(), source: "reddit-json" };
}

async function readGeneric(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Genie/1.0)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const $ = cheerio.load(html);
  const text = $("body").text();
  // Coarse signals — look for view/answer/upvote counts in the page text.
  const views = firstNumberNear(text, /([\d,.]+)\s*(views|reads)/i);
  const answers = firstNumberNear(text, /([\d,.]+)\s*(answers|replies|comments)/i);
  const upvotes = firstNumberNear(text, /([\d,.]+)\s*(upvotes|likes)/i);
  const score = (upvotes || 0) + (answers || 0) * 3 + Math.round((views || 0) / 50);
  if (views == null && answers == null && upvotes == null) return null;
  return { upvotes: upvotes ?? null, comments: answers ?? null, views: views ?? null, score, checked_at: new Date().toISOString(), source: "page-scrape" };
}

function firstNumberNear(text, re) {
  const m = text.match(re);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[,.]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// Classify a placement's performance from its latest snapshot + platform norms.
// Thresholds are deliberately modest — the goal is winner/dud separation, not
// precise analytics.
export function classifyPerformance(platform, snapshot, ageHours) {
  if (!snapshot) return "pending";
  const s = snapshot.score || 0;
  // Give a post time to breathe before judging it a dud.
  const young = ageHours < 18;
  if (platform === "reddit") {
    if (s >= 25) return "winning";
    if (young) return "pending";
    if (s <= 1) return "dud";
    return "flat";
  }
  // Non-reddit: coarser
  if (s >= 40) return "winning";
  if (young) return "pending";
  if (s <= 0) return "dud";
  return "flat";
}
