// app/api/engagement/route.js
// STAGE 7 — THE ENGAGEMENT LOOP (the learning brain).
// For posted placements, Genie tracks back what happened, scores each, then:
//   - WINNING → drafts a follow-up tap (double down) + boosts that keyword
//   - DUD     → bins it + down-weights that keyword (learn the pattern)
//   - FLAT    → leaves it
// This is what makes Genie "get smarter every day." Runs on demand (user opens
// Growth) and from the overnight cron. Everything happens inside Genie.

import { callAI } from "@/lib/ai-router";
import { resolveRadarUser } from "@/lib/radar-auth";
import { readEngagement, classifyPerformance } from "@/lib/engagement";
import { cooldownFor } from "@/lib/cadence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, ai } = body || {};
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  // Posted placements we haven't checked recently (check at most ~daily).
  const cutoff = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
  const { data: posted } = await supabase
    .from("placements").select("*")
    .eq("user_id", userId).eq("host", host).eq("status", "posted")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .limit(25);

  if (!posted?.length) return json({ ok: true, checked: 0, winners: 0, duds: 0, followupsDrafted: 0 });

  let checked = 0, winners = 0, duds = 0, followupsDrafted = 0;
  const keywordDelta = {}; // keyword -> score change

  for (const p of posted) {
    const snap = await readEngagement(p);
    checked++;
    const ageHours = (Date.now() - new Date(p.posted_at || p.created_at).getTime()) / 3600000;
    const perf = classifyPerformance(p.platform, snap, ageHours);

    await supabase.from("placements").update({
      engagement: snap || p.engagement || null,
      performance: perf,
      last_checked_at: new Date().toISOString(),
    }).eq("id", p.id);

    if (perf === "winning") {
      winners++;
      if (p.keyword) keywordDelta[p.keyword] = (keywordDelta[p.keyword] || 0) + 8;
      // Double down: draft a follow-up tap if the thread has discussion + we haven't already.
      if ((p.followups || 0) < 2 && (snap?.comments || 0) >= 2) {
        const draft = await draftFollowup(p, ai, host);
        if (draft) {
          await supabase.from("placements").insert({
            user_id: userId, host, platform: p.platform, owned: false, keyword: p.keyword,
            target_url: p.target_url, target_title: `Follow-up · ${p.target_title || ""}`.slice(0, 200),
            kind: "reply", draft, status: "ready", cooldown_days: cooldownFor(p.platform),
            meta: { ...(p.meta || {}), followupOf: p.id, reason: "This one is getting traction — Genie wrote a follow-up to keep the momentum." },
          });
          await supabase.from("placements").update({ followups: (p.followups || 0) + 1 }).eq("id", p.id);
          followupsDrafted++;
        }
      }
    } else if (perf === "dud") {
      duds++;
      if (p.keyword) keywordDelta[p.keyword] = (keywordDelta[p.keyword] || 0) - 6;
    }
  }

  // Feed learning back into keyword health (real engagement moves the score).
  for (const [keyword, delta] of Object.entries(keywordDelta)) {
    if (!delta) continue;
    try {
      const { data: kw } = await supabase.from("keywords")
        .select("id, traffic_potential").eq("user_id", userId).eq("host", host).eq("keyword", keyword).maybeSingle();
      if (kw) {
        const next = Math.max(0, Math.min(100, (kw.traffic_potential ?? 50) + delta));
        await supabase.from("keywords").update({ traffic_potential: next, last_scored_at: new Date().toISOString() }).eq("id", kw.id);
      }
    } catch {}
  }

  return json({ ok: true, checked, winners, duds, followupsDrafted });
}

async function draftFollowup(placement, ai, host) {
  try {
    const result = await callAI({
      system: "You are Genie. A post you made is getting engagement. Write ONE natural, value-adding follow-up comment that continues the conversation helpfully — never repeat yourself, never pitch. Return ONLY the comment text, no preamble.",
      maxTokens: 500, temperature: 0.7,
      prompt: `Product: ${ai?.businessName || host}
Original placement (${placement.platform}): ${placement.target_title || placement.target_url}
Your original post:
${(placement.draft || "").slice(0, 800)}

The thread has replies. Write a brief, genuinely useful follow-up comment.`,
    });
    return (result.text || "").trim() || null;
  } catch {
    return null;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
