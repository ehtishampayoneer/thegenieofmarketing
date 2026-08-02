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

const FIELDS = ["businessName", "businessType", "whatTheySell", "targetCustomer", "industry", "subCategory", "differentiator"];

// One turn of the "did I get you right?" conversation.
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { ai = {}, message = "", history = [] } = body || {};
  if (!String(message).trim()) return json({ ok: false, error: "Tell me what to fix." }, 400);

  try {
    const result = await callAI({
      system:
        "You are Genie, an AI marketing employee, confirming your understanding of a business with its owner BEFORE you build their strategy. The owner is correcting or clarifying what the business really is, what it sells, who buys it, and what makes it different. Carefully update your structured understanding from what they say — believe the owner over any earlier guess. Distinguish THE PRODUCTS/SERVICES customers actually buy from THE DIFFERENTIATOR (the special way this business does it). Reply warmly and briefly (1-2 sentences), restating what you now understand in plain words and asking if that's right or if there's more. Return ONLY valid JSON.",
      json: true,
      maxTokens: 900,
      temperature: 0.4,
      prompt: `Current understanding of the business:
${describe(ai)}

Conversation so far:
${(history || []).map((m) => `${m.role === "genie" ? "You" : "Owner"}: ${m.content}`).join("\n") || "(none yet)"}

The owner just said: "${String(message).trim()}"

Update your understanding and reply. Return ONLY:
{
  "businessName": "...",
  "businessType": "one of: E-commerce, Local service, SaaS, Content/Media, Marketplace, Agency, Other",
  "whatTheySell": "one short sentence — the ACTUAL products/services customers buy (not the technology behind it)",
  "targetCustomer": "who buys it, 1 sentence",
  "industry": "short label",
  "subCategory": "more specific niche",
  "differentiator": "what makes them different / their edge (the angle, not the main product)",
  "reply": "1-2 sentence warm reply restating what you now understand + asking to confirm or add more",
  "resolved": false
}
Set "resolved": true only if the owner clearly signals you've now got it right (e.g. 'yes', 'correct', 'that's it').`,
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
    ["Industry", ai.industry],
    ["Niche", ai.subCategory],
    ["Edge", ai.differentiator || ai.summary],
  ].filter(([, v]) => v && String(v).trim());
  return rows.map(([k, v]) => `- ${k}: ${v}`).join("\n") || "- (almost nothing known yet)";
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
