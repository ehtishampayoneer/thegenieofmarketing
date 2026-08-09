// app/api/understand/route.js
// ── GENIE'S UNDERSTANDING CHECK ──
// Right after a scan, Genie confirms what it thinks the business actually is
// BEFORE it builds any strategy. Getting the identity right here is what makes
// every downstream thing (keywords, content, outreach) correct. A wrong guess
// silently poisons everything — so we confirm, in the owner's own words.
//
//   POST { ai, message, history } -> one conversation turn: merge the owner's
//         correction into a structured understanding + a warm reply.
//   PUT  { host, ai }            -> persist the confirmed understanding onto the
//         latest scan so the entity and all features read the corrected truth.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";

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
  const { ai = {}, message = "", history = [], action = "" } = body || {};

  // ── Investigation agenda ── the highest-value questions to ask THIS owner before
  // building anything. Called once when the confirm step opens.
  if (action === "questions") {
    try {
      const result = await callAI({
        system:
          "You are Genie, an AI marketing employee. Before building a business's marketing you interview the owner to learn what a website can't tell you. Ask the FEWEST, highest-value questions that will most sharpen the marketing — only what you genuinely can't infer from the site. Return ONLY valid JSON.",
        json: true, maxTokens: 700, temperature: 0.5,
        prompt: `Business as I understand it so far:
${describe(ai)}

Give the 4-5 most valuable questions to ask this owner so I market them correctly — the gaps a homepage can't answer: who exactly the ideal customer is, why buyers really choose them over competitors, the #1 action they want a visitor to take, which products/services to push, proof or results worth leading with, anything I must NOT say, and their preferred tone. Each question must be specific to THIS business, short, and plain-spoken. Return ONLY: {"questions":["...","..."]}`,
      });
      const qs = Array.isArray(result.json?.questions) ? result.json.questions.map((q) => String(q || "").trim()).filter(Boolean).slice(0, 5) : [];
      return json({ ok: true, questions: qs.length ? qs : DEFAULT_QUESTIONS });
    } catch {
      return json({ ok: true, questions: DEFAULT_QUESTIONS });
    }
  }

  if (!String(message).trim()) return json({ ok: false, error: "Tell me what to fix." }, 400);

  try {
    const result = await callAI({
      system:
        "You are Genie, an AI marketing employee INTERVIEWING a business owner to understand them deeply BEFORE you build their marketing. Capture everything they tell you into a structured profile — believe the owner over any website guess. Distinguish THE PRODUCTS/SERVICES customers buy from THE DIFFERENTIATOR (the special way this business does it). After absorbing what they said, reply warmly and briefly (1-2 sentences): acknowledge what you learned, then ask the SINGLE most useful thing you still don't know (ideal customer, why buyers choose them, the main action they want, proof, anything to avoid, or tone). When you have a strong picture — or the owner signals they're done — set resolved:true and say you're ready to build. Return ONLY valid JSON.",
      json: true,
      maxTokens: 900,
      temperature: 0.4,
      prompt: `Current understanding of the business:
${describe(ai)}

Conversation so far:
${(history || []).map((m) => `${m.role === "genie" ? "You" : "Owner"}: ${m.content}`).join("\n") || "(none yet)"}

The owner just said: "${String(message).trim()}"

Absorb it, update your understanding, and reply. Only fill a field when the site or the owner gives real signal; otherwise keep it unchanged. Return ONLY:
{
  "businessName": "...",
  "businessType": "one of: E-commerce, Local service, SaaS, Content/Media, Marketplace, Agency, Other",
  "whatTheySell": "one short sentence — the ACTUAL products/services customers buy (not the technology behind it)",
  "targetCustomer": "who buys it, 1 sentence",
  "idealCustomer": "the BEST / most-wanted customer segment, if they said",
  "industry": "short label",
  "subCategory": "more specific niche",
  "differentiator": "what makes them different / their edge (the angle, not the main product)",
  "whyChooseYou": "why buyers pick them over competitors, if said",
  "conversionGoal": "the main action they want a visitor to take (buy, book, sign up, get a quote…), if said",
  "keyProducts": "specific products/services to push, if said",
  "proof": "results, credentials, or social proof worth leading with, if said",
  "avoid": "anything to never say/claim/promise, if said",
  "tone": "preferred voice / tone, if said",
  "reply": "1-2 sentence warm reply: acknowledge what you learned + ask the next most useful question (or say you're ready to build)",
  "resolved": false
}
Set "resolved": true only when you have a strong picture or the owner clearly signals they're done (e.g. 'that's it', 'build it').`,
    });
    const j = result.json || {};
    const updated = { ...ai };
    for (const f of FIELDS) if (j[f] != null && String(j[f]).trim()) updated[f] = j[f];
    return json({
      ok: true,
      reply: j.reply || "Got it — I've updated how I see you. Anything else, or shall I get to work?",
      ai: updated,
      resolved: !!j.resolved,
    });
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, message: "I'm a little busy — try that once more." }, 503);
    return json({ ok: false, error: "I couldn't process that — try rephrasing." }, 500);
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
