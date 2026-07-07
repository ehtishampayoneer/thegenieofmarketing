// app/api/radar/reddit/route.js
// STAGE 2 — THE REDDIT RADAR.
// Genie takes his STRONG keywords, finds live Reddit threads discussing them,
// and writes a genuinely helpful, value-first reply (or a new post) that markets
// the product WITHOUT reading like an ad. Each opening is staged into placement
// memory, tap-ready. Honest constraints, enforced in code:
//   - Reddit is NOT owned → owned:false → the human taps to post (never auto).
//   - Respects cooldowns: won't re-stage a subreddit already targeted recently.
//   - Value-first: the draft helps first; the product is mentioned only where it
//     genuinely fits — this is what avoids bans and actually ranks.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { resolveRadarUser } from "@/lib/radar-auth";
import { redditSearch } from "@/lib/search";
import { gradePortfolio } from "@/lib/keyword-health";
import { cooldownFor, nextEligible } from "@/lib/cadence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  const { host, ai } = body || {};
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  // 1) Pull Genie's keyword portfolio; attack STRONG + GROWING first.
  const { data: kwRows } = await supabase.from("keywords").select("*").eq("user_id", userId).eq("host", host);
  if (!kwRows || kwRows.length === 0) {
    return json({ ok: false, needsKeywords: true, error: "Genie needs to derive keywords first." }, 400);
  }
  const { graded } = gradePortfolio(kwRows);
  const targets = graded.filter((k) => k.health === "strong" || k.health === "growing").slice(0, 6);
  const pool = targets.length ? targets : graded.slice(0, 6);

  // 2) Don't re-stage subreddits still in cooldown or already staged/ready.
  const { data: existing } = await supabase
    .from("placements").select("target_url, meta, status, next_eligible_at")
    .eq("user_id", userId).eq("host", host).eq("platform", "reddit");
  const now = new Date();
  const blockedSubs = new Set();
  const seenUrls = new Set();
  for (const p of existing || []) {
    if (p.target_url) seenUrls.add(p.target_url);
    const sub = p.meta?.subreddit;
    if (sub && p.next_eligible_at && new Date(p.next_eligible_at) > now) blockedSubs.add(sub.toLowerCase());
    if (sub && p.status === "ready") blockedSubs.add(sub.toLowerCase()); // one live opening per sub at a time
  }

  // 3) Find live threads for each keyword.
  const candidates = [];
  for (const kw of pool) {
    const threads = await redditSearch(kw.keyword, { limit: 4 });
    for (const t of threads) {
      if (seenUrls.has(t.url)) continue;
      if (t.subreddit && blockedSubs.has(t.subreddit.toLowerCase())) continue;
      candidates.push({ ...t, keyword: kw.keyword });
      seenUrls.add(t.url);
      blockedSubs.add((t.subreddit || "").toLowerCase()); // spread across subs, not many in one
    }
    if (candidates.length >= 8) break;
  }

  if (candidates.length === 0) {
    return json({ ok: true, staged: 0, message: "No fresh Reddit openings found right now — Genie will keep looking." });
  }

  // 4) Genie writes a value-first placement for each candidate.
  let drafted;
  try {
    const result = await callAI({
      system:
        "You are Genie, doing authentic Reddit community marketing. For each thread, write a GENUINELY helpful reply that a knowledgeable human would post. Value first — actually answer or add insight. Mention the product ONLY if it truly helps the reader, and never as a pitch — no marketing voice, no links unless natural, no 'check out'. Redditors instantly smell ads and ban them; the goal is to be helpful and let the product surface naturally. If a thread doesn't fit the product at all, set fit:false. Return ONLY valid JSON.",
      json: true,
      maxTokens: 3000,
      temperature: 0.75,
      prompt: buildPrompt(candidates, ai, host),
    });
    drafted = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, message: "Genie is busy — try again." }, 503);
    return json({ ok: false, error: "Couldn't write placements." }, 500);
  }

  const items = Array.isArray(drafted?.placements) ? drafted.placements : [];
  const rows = [];
  items.forEach((it, idx) => {
    const c = candidates[it.index] || candidates[idx];
    if (!c || it.fit === false || !it.draft) return;
    rows.push({
      user_id: userId,
      host,
      platform: "reddit",
      owned: false,               // Reddit is not ours → human taps
      keyword: c.keyword,
      target_url: c.url,
      target_title: `${c.subreddit || "reddit"} · ${c.title}`.slice(0, 200),
      kind: it.kind === "new_post" ? "new_post" : "reply",
      draft: it.draft,
      status: "ready",
      cooldown_days: cooldownFor("reddit"),
      meta: { subreddit: c.subreddit, threadId: c.threadId, snippet: c.snippet, reason: it.reason || null },
    });
  });

  if (rows.length === 0) {
    return json({ ok: true, staged: 0, message: "Genie reviewed the threads but none were a genuine fit — that's the point (no spam)." });
  }

  const { data: inserted, error } = await supabase.from("placements").insert(rows).select("id");
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, staged: (inserted || []).length, keywordsAttacked: pool.map((k) => k.keyword) });
}

function buildPrompt(candidates, ai, host) {
  const list = candidates.map((c, i) =>
    `[${i}] subreddit: ${c.subreddit || "?"} | keyword: "${c.keyword}"
title: ${c.title}
context: ${c.snippet || "(none)"}`
  ).join("\n\n");

  return `Product: ${ai?.businessName || host} — ${ai?.whatTheySell || ai?.industry || ""}
Who it helps: ${ai?.targetCustomer || "(infer)"}

Threads Genie found (write a placement for each that fits):
${list}

Return ONLY this JSON:
{
  "placements": [
    {
      "index": 0,
      "fit": true,
      "kind": "reply",
      "draft": "a genuinely helpful reply in a natural human Reddit voice — value first, no marketing tone, product mentioned only if it truly helps",
      "reason": "one line: why this is a real fit / how it helps the ranking"
    }
  ]
}
Only include threads that genuinely fit (fit:true). It's correct and expected to reject threads that don't fit — never force a placement.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
