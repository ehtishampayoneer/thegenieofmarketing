// app/api/genie/chat/route.js
// ── TALK TO GENIE ──
// Not an order-taker, not a Q&A bot: an expert growth partner. It understands
// what the user is really trying to achieve, and adds value — if the idea isn't
// the strongest or most scalable way, it respectfully reframes it into a better,
// professional approach and explains why, then says what it will do. Grounded in
// the user's real business + what Genie has actually been doing.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const messages = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
  const latest = messages.filter((m) => m.role === "user").slice(-1)[0]?.content?.trim();
  if (!latest) return json({ ok: false, error: "Say something first." }, 400);

  // Ground the conversation in the real business + real recent work.
  let ai = {}, host = null;
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { ai = scan.ai || {}; host = hostOf(scan); }
  } catch {}

  let activity = [];
  try {
    const { data } = await supabase.from("activity").select("message, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8);
    activity = (data || []).map((a) => a.message).filter(Boolean);
  } catch {}

  let keywords = [];
  try {
    const { data } = await supabase.from("keywords").select("keyword").eq("user_id", user.id).order("priority", { ascending: true }).limit(10);
    keywords = (data || []).map((k) => k.keyword);
  } catch {}

  const name = ai.businessName || host || "your business";
  const convo = messages.map((m) => `${m.role === "user" ? "Owner" : "Genie"}: ${m.content}`).join("\n");

  const system = `You are Genie — ${name}'s AI marketing employee and a world-class growth strategist (think elite CMO). Your job in chat is not to blindly obey and not to lecture. It is to UNDERSTAND what the owner is really trying to achieve, then ADD VALUE:
- If their idea is good, confirm it and make it sharper and more scalable.
- If their idea is weak, impractical, or could be done far better, respectfully reframe it into the stronger, professional way — and briefly say WHY.
- Always tie back to real growth for THIS business.
- Be warm, direct, and human. 2 to 5 short sentences. No corporate filler, no em-dashes, no clichés like "unlock" or "seamless".
- When it makes sense, end by stating the concrete next thing you'll do or recommend.
- Be honest about what you can and can't do; never invent results.`;

  const prompt = `THIS BUSINESS: ${name}${ai.whatTheySell ? ` — ${ai.whatTheySell}` : ""}.
${ai.targetCustomer ? `Ideal customer: ${ai.targetCustomer}.` : ""}${ai.competitors?.length ? ` Competitors: ${(ai.competitors || []).map((c) => (typeof c === "string" ? c : c?.name)).filter(Boolean).slice(0, 3).join(", ")}.` : ""}

WHAT I'VE BEEN DOING LATELY:
${activity.length ? activity.map((a) => `- ${a}`).join("\n") : "- (just getting started)"}

KEYWORDS I'M TARGETING: ${keywords.slice(0, 8).join(", ") || "(building them)"}

CONVERSATION:
${convo}

Reply as Genie — the expert partner. Understand the owner's real goal, elevate it, and say concretely what you'll do or recommend.`;

  try {
    const result = await callAI({ system, prompt, maxTokens: 500, temperature: 0.7, ctx: { supabase, userId: user.id, host, tag: "chat" } });
    const reply = (result.text || "").replace(/\s*—\s*/g, ", ").trim();
    return json({ ok: true, reply: reply || "Tell me a bit more about what you're after and I'll take it from there." });
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, reply: "I'm briefly at capacity, give me a moment and ask again." }, 503);
    return json({ ok: false, error: "Couldn't reply just now." }, 500);
  }
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
