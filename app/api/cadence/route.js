// app/api/cadence/route.js
// G1 — the Marketing Cadence Planner. Genie PROPOSES a weekly rhythm per
// business, adapted to type/stage/platform norms. Honest framing throughout:
// distribution = reach (not authority), outreach/community = drafts you review,
// the plan is a proposal you can adjust.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const host = new URL(request.url).searchParams.get("host");
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  const { data } = await supabase
    .from("cadence_plans")
    .select("plan, updated_at")
    .eq("user_id", user.id)
    .eq("host", host)
    .maybeSingle();

  return json({ ok: true, plan: data?.plan || null, updatedAt: data?.updated_at || null });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, ai } = body || {};
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  let plan = null;
  try {
    const result = await callAI({
      system:
        "You are Genie, a marketing strategist. You PROPOSE a realistic weekly rhythm — a proposal the user can adjust, not a commitment. Respect real platform norms (LinkedIn ~1 post/day, Twitter/X 2-4/day, quality over quantity). Adapt to business type (e-commerce vs B2B vs local service) and stage. Be honest in framing: republishing to Medium/LinkedIn is 'amplify reach' NOT authority backlinks; outreach and community engagement are things Genie DRAFTS for the user to review and post, never auto-posts. Return ONLY valid JSON.",
      json: true,
      maxTokens: 1600,
      temperature: 0.6,
      prompt: buildPrompt(host, ai),
    });
    plan = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      return json({ ok: false, retryable: true, message: "Genie is busy — try again in a moment." }, 503);
    }
    return json({ ok: false, error: "Couldn't build the plan." }, 500);
  }

  if (!plan) return json({ ok: false, error: "Couldn't build the plan." }, 500);

  await supabase.from("cadence_plans").upsert(
    { user_id: user.id, host, plan, updated_at: new Date().toISOString() },
    { onConflict: "user_id,host" }
  );

  return json({ ok: true, plan });
}

function buildPrompt(host, ai) {
  return `Business: ${ai?.businessName || host}
Industry: ${ai?.industry || "(unknown)"} / ${ai?.subCategory || ""}
Type: ${ai?.businessType || "(infer)"}
Sells: ${ai?.whatTheySell || ""}
Target customer: ${ai?.targetCustomer || ""}

Infer the business stage (early / growing / established) from the above, then propose a weekly marketing rhythm. Return ONLY this JSON:
{
  "businessType": "e-commerce | B2B | local service | SaaS | content | other",
  "stage": "early | growing | established",
  "summary": "one honest sentence: this is a proposed rhythm you can adjust",
  "channels": [
    {
      "channel": "Articles",
      "cadence": "e.g. 2 / week",
      "framing": "distributed to WordPress, then amplified to Medium + LinkedIn for reach",
      "note": "one short why"
    },
    { "channel": "Twitter/X", "cadence": "...", "framing": "...", "note": "..." },
    { "channel": "LinkedIn", "cadence": "...", "framing": "...", "note": "..." },
    { "channel": "Instagram", "cadence": "...", "framing": "...", "note": "..." },
    { "channel": "Outreach", "cadence": "e.g. 15 emails / week", "framing": "Genie drafts these for you to review and send", "note": "..." },
    { "channel": "Directories & PR", "cadence": "...", "framing": "Genie finds and drafts submissions for you to approve", "note": "..." },
    { "channel": "Community", "cadence": "...", "framing": "Genie drafts comments for you to post — never auto-posted (protects your accounts)", "note": "..." }
  ],
  "rationale": "2-3 sentences on why this rhythm fits this business type and stage"
}
Only include channels that make sense for this business type. Keep cadences realistic and platform-appropriate.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
