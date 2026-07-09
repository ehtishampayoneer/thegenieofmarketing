// app/api/keywords/route.js
// Genie derives the product's SEO keyword strategy HIMSELF from the scan.
// The user never supplies keywords — Genie reads what the product is, decides
// what it should rank for, and stores a prioritized target list. This list is
// the fuel the Placement Engine burns: every keyword gets spread across many
// places over time (coverage tracks how well each is covered).

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";
import { gradePortfolio } from "@/lib/keyword-health";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_INTENT = new Set(["informational", "commercial", "transactional", "community"]);

// GET ?host= → the graded keyword portfolio (health, scores, summary)
export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const host = new URL(request.url).searchParams.get("host");
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  const { data } = await supabase
    .from("keywords")
    .select("*")
    .eq("user_id", user.id)
    .eq("host", host);

  const portfolio = gradePortfolio(data || []);
  return json({ ok: true, ...portfolio });
}

// POST { host, ai } → Genie derives + stores the keyword strategy
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, ai, productOverride } = body || {};
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  let derived = null;
  try {
    const result = await callAI({
      system:
        "You are Genie, an elite SEO strategist. From a business profile, you derive the keyword strategy YOURSELF — the user gives you nothing. Think like someone who will rank this product across Google, Reddit, Quora, and forums. Produce a focused, high-intent keyword set: a mix of informational (blog-rankable), commercial/transactional (buyer intent), and community (how people phrase it in discussions). Prioritize by rankability × buyer value. Return ONLY valid JSON.",
      json: true,
      maxTokens: 1800,
      temperature: 0.5,
      prompt: buildPrompt(host, ai, productOverride),
    });
    derived = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, message: "Genie is busy — try again." }, 503);
    return json({ ok: false, error: "Couldn't derive keywords." }, 500);
  }

  const list = Array.isArray(derived?.keywords) ? derived.keywords : [];
  if (list.length === 0) return json({ ok: false, error: "No keywords produced." }, 500);

  const rows = list.slice(0, 40).map((k) => {
    const traffic_potential = clampInt(k.traffic_potential, 50);
    const competition = clampInt(k.competition, 50);
    return {
      user_id: user.id,
      host,
      keyword: String(k.keyword || "").slice(0, 120).trim().toLowerCase(),
      intent: VALID_INTENT.has(k.intent) ? k.intent : "informational",
      priority: Number.isInteger(k.priority) && k.priority >= 1 && k.priority <= 5 ? k.priority : 3,
      rationale: k.rationale || null,
      traffic_potential,
      competition,
      health: "new",
      last_scored_at: new Date().toISOString(),
    };
  }).filter((r) => r.keyword);

  // Upsert (Genie can re-derive; keep coverage + real GSC data on existing rows).
  // If the owner corrected the product, wipe the wrong keywords first so the
  // fresh, correct set fully replaces them (not merged).
  if (productOverride) {
    await supabase.from("keywords").delete().eq("user_id", user.id).eq("host", host);
  }
  await supabase.from("keywords").upsert(rows, { onConflict: "user_id,host,keyword", ignoreDuplicates: true });

  const { data: saved } = await supabase.from("keywords").select("*").eq("user_id", user.id).eq("host", host);
  const portfolio = gradePortfolio(saved || []);
  await logActivity(supabase, user.id, { host, verb: "keywords", message: `Built your keyword strategy — ${(saved || []).length} targets`, detail: (portfolio.graded || []).slice(0,3).map((k)=>k.keyword).join(", "), meta: { count: (saved||[]).length } });
  return json({ ok: true, ...portfolio, strategy: derived.strategy || null });
}

function clampInt(n, dflt) {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function buildPrompt(host, ai, productOverride) {
  const correction = productOverride
    ? `\n\nIMPORTANT — the owner has clarified what this product actually is. This description OVERRIDES anything inferred from the page. Build the keyword strategy for THIS:\n"${productOverride}"\n`
    : "";
  return `Product/business: ${ai?.businessName || host}
Website: ${host}
Industry: ${ai?.industry || "(infer)"} ${ai?.subCategory ? "/ " + ai.subCategory : ""}
What they sell: ${ai?.whatTheySell || "(infer from the above)"}
Target customer: ${ai?.targetCustomer || "(infer)"}${correction}

CRITICAL: Derive keywords for what the CUSTOMER wants and searches for — the benefit and the product category — NOT the underlying technology used to build it. Example: for an online store that shows products in AR before buying, target shopper terms like "see furniture in my room before buying", "AR shopping app", "try before you buy furniture", NOT developer terms like "webgl", "3d website builder", or "how to build". Think like the buyer, not the engineer.

Derive the SEO keyword strategy yourself. Return ONLY this JSON:
{
  "strategy": "2 sentences: how you'll rank this product and where the traffic will come from",
  "keywords": [
    { "keyword": "lowercase phrase people actually search", "intent": "informational|commercial|transactional|community", "priority": 1, "traffic_potential": 0-100, "competition": 0-100, "rationale": "why this one, short" }
  ]
}
Give 20-30 keywords. Balance: some high-intent buyer terms, some informational blog terms, some phrased the way people ask in Reddit/Quora threads. Priority 1 = attack first.
traffic_potential = your estimate of monthly search demand (0=none, 100=huge). competition = how hard to rank (0=easy/open, 100=dominated by giants). Favor high potential + low competition. These are honest estimates, not measured data.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
