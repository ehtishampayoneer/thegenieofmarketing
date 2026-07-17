// app/api/genie/plan/route.js
// ── GENIE'S CAMPAIGN PLAYBOOKS ──
// The owner asks for a campaign ("make my Meta ads", "plan my Google Ads",
// "social content for the month"). Genie returns a real, structured plan built
// on THIS business: the goal, a step-by-step guide, ready-to-use ad copy, and a
// dated schedule the owner can follow. Exportable to Word / PDF on the client.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The playbooks Genie knows how to build. Kept server-side so the prompt is
// grounded and consistent no matter what the client sends.
const KINDS = {
  meta_ads: {
    label: "Meta ads (Facebook + Instagram)",
    brief: "A Meta Ads campaign for Facebook and Instagram. Include audience targeting suggestions, 3 ad variations (primary text + headline + description), a budget guide, and a launch + optimisation schedule.",
  },
  google_ads: {
    label: "Google Ads (Search)",
    brief: "A Google Search Ads campaign. Include the best keyword themes to bid on (grounded in the keywords below), 3 responsive search ad variations (headlines + descriptions), match-type and budget guidance, and a schedule to launch and optimise.",
  },
  social_content: {
    label: "Social content plan",
    brief: "A 2-week organic social content plan across the channels that fit this business. Include post ideas with hooks and captions, the format for each, and a posting schedule.",
  },
  seo_content: {
    label: "Blog / SEO content plan",
    brief: "A blog content plan that targets buyer-intent searches. Include article titles that answer real buyer questions, the search intent each one wins, and a publishing schedule.",
  },
  launch: {
    label: "Product / offer launch",
    brief: "A multi-channel launch plan for a new product or offer. Include the sequence across email, social, and ads, key messages, and a day-by-day schedule leading up to and following launch.",
  },
};

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const kind = String(body?.kind || "").trim();
  const extra = String(body?.note || "").trim().slice(0, 400); // optional free-text refinement
  const spec = KINDS[kind];
  if (!spec) return json({ ok: false, error: "Unknown playbook." }, 400);

  // Ground the plan in the real business + directives the owner has set.
  let ai = {}, host = null;
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { ai = scan.ai || {}; host = hostOf(scan); }
  } catch {}

  let keywords = [];
  try {
    const { data } = await supabase.from("keywords").select("keyword").eq("user_id", user.id).order("priority", { ascending: true }).limit(12);
    keywords = (data || []).map((k) => k.keyword).filter(Boolean);
  } catch {}

  let profile = {};
  try { const { data } = await supabase.from("profiles").select("company_name, company_pitch, company_website").eq("id", user.id).maybeSingle(); profile = data || {}; } catch {}

  let directives = [];
  try {
    const { data } = await supabase.from("growth_memory").select("insight").eq("user_id", user.id).ilike("mkey", "directive:%").order("updated_at", { ascending: false }).limit(10);
    directives = (data || []).map((d) => d.insight).filter(Boolean);
  } catch {}

  const name = profile.company_name || ai.businessName || host || "this business";
  const sells = profile.company_pitch || ai.whatTheySell || "";

  const system = `You are Genie — an elite marketing strategist building a real, ready-to-run campaign plan for ${name}. Be concrete and specific to THIS business, never generic. Every piece of ad copy must be usable as written. No hype, no em-dashes, no clichés. Honour the owner's standing instructions.
Return ONLY JSON in this exact shape:
{
  "title": "short plan title",
  "goal": "one sentence on what this campaign achieves for the business",
  "summary": "2-3 sentence overview of the approach and why it fits this business",
  "steps": [ { "title": "step name", "detail": "what to do and why, 1-2 sentences" } ],
  "assets": [ { "name": "e.g. 'Ad 1 — primary text' or 'Article title'", "copy": "the actual ready-to-use text" } ],
  "schedule": [ { "when": "e.g. 'Day 1' or 'Week 1, Mon'", "task": "the specific action", "channel": "e.g. Meta, Google, Blog, Email" } ]
}
Provide 4-7 steps, 3-6 assets, and 5-10 schedule rows. Keep copy tight.`;

  const prompt = `BUILD THIS PLAYBOOK: ${spec.brief}
${extra ? `\nOWNER'S SPECIFIC ASK: ${extra}` : ""}

THE BUSINESS: ${name}${sells ? ` — ${sells}` : ""}.
${ai.targetCustomer ? `Ideal customer: ${ai.targetCustomer}.` : ""}${profile.company_website || host ? ` Website: ${profile.company_website || host}.` : ""}
${ai.competitors?.length ? `Competitors: ${(ai.competitors || []).map((c) => (typeof c === "string" ? c : c?.name)).filter(Boolean).slice(0, 3).join(", ")}.` : ""}

BUYER-INTENT KEYWORDS TO USE: ${keywords.slice(0, 10).join(", ") || "(derive sensible ones from what they sell)"}

STANDING INSTRUCTIONS TO HONOUR:
${directives.length ? directives.map((d) => `- ${d}`).join("\n") : "- (none)"}

Return the complete plan as JSON, specific to ${name}.`;

  try {
    const result = await callAI({ system, prompt, json: true, maxTokens: 1600, temperature: 0.7, ctx: { supabase, userId: user.id, host, tag: "plan" } });
    const p = result.json || {};
    const plan = {
      kind,
      label: spec.label,
      title: clean(p.title) || spec.label,
      goal: clean(p.goal),
      summary: clean(p.summary),
      steps: arr(p.steps).map((s) => ({ title: clean(s.title), detail: clean(s.detail) })).filter((s) => s.title || s.detail),
      assets: arr(p.assets).map((a) => ({ name: clean(a.name), copy: clean(a.copy) })).filter((a) => a.copy),
      schedule: arr(p.schedule).map((r) => ({ when: clean(r.when), task: clean(r.task), channel: clean(r.channel) })).filter((r) => r.task),
      business: name,
      createdAt: new Date().toISOString(),
    };
    if (!plan.steps.length && !plan.schedule.length) return json({ ok: false, error: "Couldn't build the plan just now, try again." }, 502);
    return json({ ok: true, plan });
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, error: "I'm briefly at capacity, ask again in a moment." }, 503);
    return json({ ok: false, error: "Couldn't build the plan just now." }, 500);
  }
}

function clean(s) { return String(s ?? "").replace(/\s*—\s*/g, ", ").trim(); }
function arr(a) { return Array.isArray(a) ? a : []; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }

export const PLAYBOOKS = KINDS;
