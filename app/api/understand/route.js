// app/api/understand/route.js
// ── GENIE'S UNDERSTANDING CHECK ──
// Right after a scan, Genie confirms what it thinks the business actually is
// BEFORE it builds any strategy. Getting the identity right here is what makes
// every downstream thing (keywords, content, outreach) correct. A wrong guess
// silently poisons everything — so we confirm, in the owner's own words.
//
//   POST { ai, message, lastQuestion, lastTopic, skipped } -> one interview turn:
//         extract what the owner said into the business brief, then ask about
//         the most important thing still missing.
//   PUT  { host, ai }            -> persist the understanding onto the latest
//         scan so the entity and all features read the corrected truth.

import { callAI } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";
import { interviewTurn, InterviewUnavailable } from "@/lib/interview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIELDS = ["businessName", "businessType", "whatTheySell", "targetCustomer", "industry", "subCategory", "differentiator", "idealCustomer", "painPoints", "whyChooseYou", "conversionGoal", "keyProducts", "proof", "avoid", "tone"];

// Fallback agenda if the model can't generate business-specific questions.
const DEFAULT_QUESTIONS = [
  "Who's your single best type of customer — the one you wish you had ten more of?",
  "When someone chooses between you and a competitor, why do the ones who pick you say yes?",
  "What's the one action you most want a visitor to take?",
  "What have your happiest customers actually gotten out of you (a result, a number, a story)?",
  "Is there anything I should never say, claim, or promise about you?",
];

// One turn of the "did I get you right?" conversation.
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { ai = {}, message = "", action = "" } = body || {};

  // ── Investigation agenda ── the highest-value questions to ask THIS owner before
  // building anything. Called once when the confirm step opens.
  if (action === "questions") {
    // The text the scan actually read. Without this the generator only ever saw
    // a dozen extracted fields, which is why it asked owners for things printed
    // on their own homepage.
    const pageText = String(body?.pageText || "").slice(0, 4000);
    try {
      const result = await callAI({
        system:
          "You are Genie, an AI marketing employee who has just read this business's website closely. " +
          "You are talking to the owner. You must sound like someone who READ THE SITE, never like a form. " +
          "The single worst thing you can do is ask for something that is written on their own page: it tells them you did not really look. " +
          "Return ONLY valid JSON.",
        json: true, maxTokens: 800, temperature: 0.5,
        prompt: `What I worked out about the business:
${describe(ai)}
${pageText ? `
WHAT I ACTUALLY READ ON THEIR SITE:
"""
${pageText}
"""` : ""}

Write 4-5 short lines to send the owner. Two rules decide the shape of each one:

1. If the answer IS on their site, do NOT ask for it. Say what you found and ask
   them to confirm or add to it. Quote the real detail back, with their actual
   numbers, names or wording:
     "I can see your plans start at $49 and Pro is $149. Is that current, and which one do you most want people on?"
     "It looks like you mainly sell to furniture and rug retailers. Is that who you want more of, or is there a better fit?"

2. Only ask an open question when the site genuinely does not answer it. The
   things a homepage almost never says: why buyers actually choose them over a
   competitor, their single best type of customer, real results or numbers from
   happy customers, anything you must never claim, and their preferred tone.

Order them with the confirmations first, so the owner sees you read the site before you ask them for anything.
Plain-spoken, one line each, no jargon, no em-dashes. Never invent a number or a detail that is not in what I read.

Return ONLY: {"questions":["...","..."]}`,
      });
      const qs = Array.isArray(result.json?.questions) ? result.json.questions.map((q) => String(q || "").trim()).filter(Boolean).slice(0, 5) : [];
      return json({ ok: true, questions: qs.length ? qs : DEFAULT_QUESTIONS });
    } catch {
      return json({ ok: true, questions: DEFAULT_QUESTIONS });
    }
  }

  if (!String(message).trim()) return json({ ok: false, error: "Tell me what to fix." }, 400);

  try {
    const out = await interviewTurn({
      ai, message,
      lastQuestion: body?.lastQuestion, lastTopic: body?.lastTopic, skipped: body?.skipped,
      describe,
    });
    return json(out);
  } catch (e) {
    // The owner's message is kept on their side, so a failure here costs a
    // retry, never the words they typed.
    const unavailable = e instanceof InterviewUnavailable;
    return json({
      ok: false, retryable: true,
      message: unavailable
        ? "I could not read that just now. Nothing is lost, press Retry and I will read it again."
        : "Something went wrong reading that. Press Retry.",
    }, unavailable ? 503 : 500);
  }
}

// Persist the confirmed understanding so entity resolution + every feature that
// reads the latest scan works from the corrected truth (not the first guess).
export async function PUT(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, ai } = body || {};
  if (!host || !ai) return json({ ok: false, error: "Missing host or understanding." }, 400);

  try {
    const { data: latest } = await supabase
      .from("scans")
      .select("id, ai")
      .eq("user_id", user.id)
      .or(`final_url.ilike.%${host}%,url.ilike.%${host}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id) {
      await supabase.from("scans").update({ ai: { ...(latest.ai || {}), ...ai } }).eq("id", latest.id);
    }
  } catch {
    // best-effort: even if persistence fails, the client still rebuilds keywords
    // with the corrected ai passed directly, so the user's fix isn't lost.
  }
  return json({ ok: true });
}

// Build a compact plain-text description of the current understanding for the prompt.
function describe(ai = {}) {
  const rows = [
    ["Name", ai.businessName],
    ["Type", ai.businessType],
    ["Sells", ai.whatTheySell],
    ["Customers", ai.targetCustomer],
    ["Ideal customer", ai.idealCustomer],
    ["Industry", ai.industry],
    ["Niche", ai.subCategory],
    ["Edge", ai.differentiator || ai.summary],
    ["Why chosen", ai.whyChooseYou],
    ["Goal", ai.conversionGoal],
    ["Key products", ai.keyProducts],
    ["Proof", ai.proof],
    ["Avoid", ai.avoid],
    ["Tone", ai.tone],
  ].filter(([, v]) => v && String(v).trim());
  return rows.map(([k, v]) => `- ${k}: ${v}`).join("\n") || "- (almost nothing known yet)";
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
