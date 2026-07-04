// app/api/community/route.js
// G5 — Community Engagement Planner. Genie finds WHERE the business's
// customers actually gather, proposes a genuine participation rhythm, and
// drafts value-first contributions.
// GUARDRAILS (locked on the record, enforced in code):
//  - NOTHING here is ever auto-posted. Genie drafts; the human reviews & posts.
//  - Auto-posting to Reddit/Quora/forums violates platform ToS and gets
//    accounts banned — so humanPost is forced true on every item.
//  - Contributions must be genuinely helpful; self-promotion only where it
//    truly helps the reader.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_PRIO = new Set(["high", "quick_win", "strategic", "low", "medium"]);

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { ai, host, scanId } = body || {};
  if (!ai) return json({ ok: false, error: "Missing business context." }, 400);

  let data = null;
  try {
    const result = await callAI({
      system:
        "You are Genie's community strategist. You find where a business's real customers gather online and plan GENUINE participation. HARD RULES: (1) Nothing is auto-posted — you draft, the human reviews, adapts, and posts from their own account. (2) Communities ban promoters — drafts must be authentically helpful first; mention the business only where it genuinely serves the reader, often not at all. (3) Every community has rules — always remind the user to read them before posting. (4) Suggested communities are informed guesses the user must verify exist and fit. Return ONLY valid JSON.",
      json: true,
      maxTokens: 2800,
      temperature: 0.7,
      prompt: buildPrompt(ai, host),
    });
    data = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      return json({ ok: false, retryable: true, message: "Genie is busy — try again in a moment." }, 503);
    }
    return json({ ok: false, error: "Couldn't build the community plan." }, 500);
  }

  if (!data) return json({ ok: false, error: "Couldn't build the community plan." }, 500);

  // Normalize + enforce guardrails in code (never trust the model alone).
  const communities = (Array.isArray(data.communities) ? data.communities : []).map((c) => ({
    platform: c.platform || "Community",
    name: c.name || "",
    whyHere: c.whyHere || "",
    rhythm: c.rhythm || "",
    firstMove: c.firstMove || "",
    draft: c.draft || "",
    priority: VALID_PRIO.has(c.priority) ? c.priority : "strategic",
    humanPost: true, // forced — never auto-posted
    verifyNote: "AI-suggested — verify this community exists, fits, and read its rules before posting.",
  }));

  const rhythm = data.weeklyRhythm || null;

  // Persist each community as a spine action.
  let actionIds = [];
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user && communities.length) {
      const rows = communities.map((c) => ({
        user_id: user.id,
        scan_id: scanId || null,
        type: "community_engagement",
        title: `${c.platform}: ${c.name}`,
        payload: c,
        target: { host: host || null, humanPost: true },
        priority: c.priority,
        status: "proposed",
      }));
      const { data: inserted } = await supabase.from("actions").insert(rows).select("id");
      actionIds = (inserted || []).map((r) => r.id);
    }
  } catch {}

  return json({ ok: true, communities, weeklyRhythm: rhythm, actionIds });
}

function buildPrompt(ai, host) {
  return `Business: ${ai.businessName || host || "(unknown)"} — ${ai.industry || ""} ${ai.subCategory ? "/ " + ai.subCategory : ""}
Type: ${ai.businessType || "(infer)"}
Sells: ${ai.whatTheySell || ""}
Target customer: ${ai.targetCustomer || ""}

Find where these customers genuinely gather online and plan authentic participation. Return ONLY this JSON:
{
  "weeklyRhythm": {
    "cadence": "e.g. 5 helpful contributions / week across 2-3 communities",
    "principle": "one sentence on the give-first ratio (e.g. 9 helpful posts for every 1 that mentions the business)"
  },
  "communities": [
    {
      "platform": "Reddit | Quora | Facebook Group | Discord | Slack | Forum | Indie Hackers | other",
      "name": "the specific community, e.g. r/augmentedreality",
      "whyHere": "why their target customers are here (1 sentence)",
      "rhythm": "suggested participation frequency for THIS community",
      "firstMove": "the first genuine contribution to make (1 sentence)",
      "draft": "a complete, authentically helpful first post/comment/answer — value-first, business mentioned ONLY if it truly helps (often not at all)",
      "priority": "high | quick_win | strategic | low"
    }
  ]
}
3-5 communities that genuinely fit. Drafts must sound like a helpful human, never marketing copy.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
