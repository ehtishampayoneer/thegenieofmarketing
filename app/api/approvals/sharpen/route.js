// app/api/approvals/sharpen/route.js
// ── THE SECOND PASS ──
// lib/platform-craft.js teaches the craft rules on the way OUT, inside the call
// that writes everything at once. That call is doing a lot: an article, a
// carousel, an image prompt, a CTA, and six social variants. Some drafts come
// out fine and some come out flat, which is normal for a single wide call.
//
// This is the narrow one. It looks at ONE draft, against the rules for the ONE
// place it is going, and rewrites it harder. Being narrow is the whole point:
// all the model's attention goes on a single piece.
//
// It is a button, never automatic. That matters for cost: the AI router runs on
// daily free-tier budgets, and a second pass on every draft of every nightly run
// would burn through them for output the owner may not even look at. Pressed by
// hand, it costs one call when someone actually wants one.
//
// It never saves. The rewrite comes back to the edit box so the owner reads it
// and decides. Cancel discards it, which means Sharpen can never quietly replace
// something the owner preferred.

import { createClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai-router";
import { craftBlock, PLATFORMS } from "@/lib/platform-craft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The item's platform string is loose ("twitter/x", "Twitter/X", "gbp"), so map
// it onto a craft key. Anything unmapped falls back to the prose treatment.
function craftKeyFor(platform = "", kind = "") {
  const p = String(platform).toLowerCase();
  if (/\b(x|twitter)\b/.test(p)) return "twitter";
  if (p.includes("linkedin")) return "linkedin";
  if (p.includes("instagram")) return "instagram";
  if (p.includes("facebook")) return "facebook";
  if (p.includes("reddit")) return "reddit";
  if (p.includes("quora")) return "quora";
  if (p.includes("pinterest")) return "pinterest";
  if (p.includes("tiktok")) return "tiktok";
  // A Google Business post is short and capped at 1500 chars. Without this it
  // fell through to the prose branch, which says there is no limit, so Sharpen
  // could happily make one too long to post.
  if (p.includes("gbp") || p.includes("google")) return "gbp";
  if (kind === "article") return null;   // prose, not a platform post
  return null;
}

// Light per-user ceiling. The router's daily provider budgets are the real
// backstop; this just stops a stuck finger costing a hundred calls.
const RECENT = new Map();
function tooMany(userId) {
  const now = Date.now();
  const hits = (RECENT.get(userId) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 12) { RECENT.set(userId, hits); return true; }
  hits.push(now);
  RECENT.set(userId, hits);
  return false;
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  if (tooMany(user.id)) return json({ ok: false, error: "Give it a moment before sharpening again." }, 429);

  let body = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { id, source } = body || {};
  if (!id || !source) return json({ ok: false, error: "id and source are required." }, 400);

  // Read the row back rather than trusting the client for platform/kind, and so
  // ownership is enforced. RLS scopes these to the caller anyway; the explicit
  // user_id filter makes that non-negotiable rather than incidental.
  let platform = "", kind = "", stored = "", title = "";
  try {
    if (source === "placement") {
      const { data } = await supabase.from("placements")
        .select("platform, draft, target_title").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!data) return json({ ok: false, error: "That item is no longer in your queue." }, 404);
      platform = data.platform || "";
      stored = data.draft || "";
      title = data.target_title || "";
      kind = "placement";
    } else {
      const { data } = await supabase.from("actions")
        .select("type, payload, title").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (!data) return json({ ok: false, error: "That item is no longer in your queue." }, 404);
      const p = data.payload || {};
      platform = String(p.platform || p.channel || "");
      kind = data.type || "";
      title = data.title || "";
      stored = p.body || p.text || (Array.isArray(p.draft) ? p.draft.join("\n\n") : p.draft) || "";
    }
  } catch {
    return json({ ok: false, error: "Could not load that item." }, 500);
  }

  // Prefer whatever is in the edit box, so Sharpen builds on the owner's own
  // wording rather than throwing their changes away and starting from the row.
  const text = String(body.text || stored || "").trim();
  if (!text) return json({ ok: false, error: "There is nothing to sharpen yet." }, 400);
  if (text.length > 14000) return json({ ok: false, error: "That draft is too long to sharpen in one pass." }, 400);

  const key = craftKeyFor(platform, kind);
  const spec = key ? PLATFORMS[key] : null;
  const rules = key ? craftBlock([key]) : "";

  // Voice matters more than rules: a sharpened post that no longer sounds like
  // the business is a worse post, however tight it reads.
  let biz = "";
  try {
    const { data: prof } = await supabase.from("profiles")
      .select("company_name, company_pitch").eq("id", user.id).maybeSingle();
    if (prof) biz = [prof.company_name, prof.company_pitch].filter(Boolean).join(" — ");
  } catch {}

  const target = spec
    ? `This is going on ${spec.label}. Hard limit ${spec.limit} characters${spec.fold < spec.limit ? `, and only about ${spec.fold} show before the reader has to expand it` : ""}.`
    : "This is prose on the business's own site, not a social post. There is no character limit, so judge it on whether someone keeps reading.";

  const proseRules = spec ? "" : `
For prose, sharpen means:
  - The first sentence has to earn the second. Cut any warm-up, throat-clearing or scene-setting that delays the point.
  - Replace abstractions with the concrete thing. A number, a name, a scenario.
  - Vary sentence length. Long, then short. Short carries weight.
  - Cut every sentence that only restates the previous one.
  - No em-dashes, and none of the AI tells (unlock, elevate, seamless, delve, leverage, game-changer, in today's world).
  - Keep the meaning and the facts exactly. This is a rewrite, not a rethink.
`;

  const result = await callAI({
    system:
      "You are a ruthless copy editor. You rewrite a draft so it holds attention, without changing what it claims. " +
      "You never invent facts, numbers, names or results that are not already in the draft. " +
      "You never make it longer for the sake of it: shorter and sharper wins. " +
      "You never use em-dashes, emoji spam or exclamation marks. Return ONLY valid JSON.",
    json: true,
    temperature: 0.7,
    maxTokens: 3000,
    prompt: `${biz ? `THE BUSINESS: ${biz}\n` : ""}${title ? `INTERNAL LABEL (context only, do not quote it): ${title}\n` : ""}
${target}
${rules}${proseRules}
THE DRAFT TO SHARPEN:
"""
${text}
"""

Rewrite it so it holds attention from the first line. Keep the same claims, the same facts and the same voice. Do not add anything the draft does not already say.

Return this JSON:
{
  "notes": ["3-5 short notes on what you actually changed and why, each under 12 words"],
  "text": "the rewritten draft, and nothing else"
}`,
  });

  let parsed;
  try {
    parsed = JSON.parse(String(result.text || "").replace(/```json|```/g, "").trim());
  } catch {
    return json({ ok: false, error: "That did not come back cleanly. Try once more." }, 502);
  }

  const out = String(parsed.text || "").trim();
  if (!out) return json({ ok: false, error: "Nothing came back. Try once more." }, 502);

  // Honest guard: if the rewrite blows the platform's hard limit, say so rather
  // than handing back something that cannot be posted.
  const overBy = spec && out.length > spec.limit ? out.length - spec.limit : 0;

  return json({
    ok: true,
    text: out,
    notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 5) : [],
    platform: spec?.label || "your site",
    before: text.length,
    after: out.length,
    limit: spec?.limit || null,
    overBy,
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
