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
import { expandSeeds } from "@/lib/autocomplete";
import { enrichWithVolumes } from "@/lib/google-ads";

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

  // Layer 0 (free): ground candidates in REAL Google searches via Autocomplete.
  let realSearches = [];
  try {
    const seeds = [ai?.whatTheySell, ai?.subCategory, ai?.industry, ai?.businessName, productOverride]
      .filter(Boolean).flatMap((s) => String(s).split(/[,/]|\band\b/)).map((s) => s.trim()).filter((s) => s.length > 2).slice(0, 6);
    realSearches = await expandSeeds(seeds.length ? seeds : [host]);
  } catch {}

  let derived = null;
  try {
    const result = await callAI({
      system:
        "You are Genie, an elite SEO strategist. From a business profile, you derive the keyword strategy YOURSELF — the user gives you nothing. Think like someone who will rank this product across Google, Reddit, Quora, and forums. Produce a focused, high-intent keyword set: a mix of informational (blog-rankable), commercial/transactional (buyer intent), and community (how people phrase it in discussions). Prioritize by rankability × buyer value. Return ONLY valid JSON.",
      json: true,
      maxTokens: 1800,
      temperature: 0.5,
      prompt: buildPrompt(host, ai, productOverride, realSearches),
    });
    derived = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, message: "Genie is busy — try again." }, 503);
    return json({ ok: false, error: "Couldn't derive keywords." }, 500);
  }

  const list = Array.isArray(derived?.keywords) ? derived.keywords : [];
  if (list.length === 0) return json({ ok: false, error: "No keywords produced." }, 500);

  // Layer 1 (Google Ads Keyword Planner): real monthly volume + competition, when
  // the dev token + Google connection exist. Returns {} otherwise (AI estimates stand).
  const kwStrings = list.map((k) => String(k.keyword || "").slice(0, 120).trim().toLowerCase()).filter(Boolean);
  let vols = {};
  try { vols = await enrichWithVolumes(supabase, user.id, host, kwStrings); } catch {}

  const rows = list.slice(0, 40).map((k) => {
    const key = String(k.keyword || "").slice(0, 120).trim().toLowerCase();
    const real = vols[key];
    const competition = real ? clampInt(real.competition, 50) : clampInt(k.competition, 50);
    const traffic_potential = real ? volumeToPotential(real.volume) : clampInt(k.traffic_potential, 50);
    return {
      user_id: user.id,
      host,
      keyword: key,
      intent: VALID_INTENT.has(k.intent) ? k.intent : "informational",
      priority: Number.isInteger(k.priority) && k.priority >= 1 && k.priority <= 5 ? k.priority : 3,
      rationale: k.stage ? `[${String(k.stage).toLowerCase().trim()}] ${k.rationale || ""}`.trim() : (k.rationale || null),
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

  // Store the raw volume + 12-month history for real numbers + charts. Best-effort:
  // if the volume columns aren't added yet (db/keyword-volume.sql), this no-ops.
  if (Object.keys(vols).length) {
    try {
      for (const [kw, d] of Object.entries(vols)) {
        await supabase.from("keywords").update({ volume: d.volume, volume_history: d.history }).eq("user_id", user.id).eq("host", host).eq("keyword", kw);
      }
    } catch {}
  }

  const { data: saved } = await supabase.from("keywords").select("*").eq("user_id", user.id).eq("host", host);
  const portfolio = gradePortfolio(saved || []);
  await logActivity(supabase, user.id, { host, verb: "keywords", message: `Built your keyword strategy — ${(saved || []).length} targets`, detail: (portfolio.graded || []).slice(0,3).map((k)=>k.keyword).join(", "), meta: { count: (saved||[]).length } });
  return json({ ok: true, ...portfolio, strategy: derived.strategy || null });
}

// Add the user's OWN keyword.
export async function PATCH(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, keyword } = body || {};
  if (!host || !keyword?.trim()) return json({ ok: false, error: "Missing host or keyword." }, 400);

  const { error } = await supabase.from("keywords").upsert({
    user_id: user.id, host, keyword: keyword.trim().toLowerCase(),
    intent: "informational", priority: 2, source: "user",
    traffic_potential: 50, competition: 50, coverage: 0, health: "new",
    rationale: "You added this keyword.",
  }, { onConflict: "user_id,host,keyword", ignoreDuplicates: true });
  if (error) return json({ ok: false, error: error.message }, 500);

  const { data: saved } = await supabase.from("keywords").select("*").eq("user_id", user.id).eq("host", host);
  return json({ ok: true, ...gradePortfolio(saved || []) });
}

// Remove a keyword.
export async function DELETE(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const keyword = url.searchParams.get("keyword");
  if (!host || !keyword) return json({ ok: false, error: "Missing host or keyword." }, 400);
  await supabase.from("keywords").delete().eq("user_id", user.id).eq("host", host).eq("keyword", keyword);
  const { data: saved } = await supabase.from("keywords").select("*").eq("user_id", user.id).eq("host", host);
  return json({ ok: true, ...gradePortfolio(saved || []) });
}

function clampInt(n, dflt) {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function buildPrompt(host, ai, productOverride, realSearches = []) {
  const correction = productOverride
    ? `\n\nIMPORTANT — the owner has clarified what this product actually is. This description OVERRIDES anything inferred from the page. Build the keyword strategy for THIS:\n"${productOverride}"\n`
    : "";
  const real = realSearches.length
    ? `\nREAL searches people actually type (from Google Autocomplete) — these are grounded in reality, prioritise covering the relevant ones and phrase keywords the way these are phrased:\n${realSearches.slice(0, 40).map((s) => `- ${s}`).join("\n")}\n`
    : "";
  return `Product/business: ${ai?.businessName || host}
Website: ${host}
Industry: ${ai?.industry || "(infer)"} ${ai?.subCategory ? "/ " + ai.subCategory : ""}
What they sell: ${ai?.whatTheySell || "(infer from the above)"}
Target customer: ${ai?.targetCustomer || "(infer)"}${correction}
${real}
CRITICAL — target the BUYER'S problem in THEIR words, then bridge to the product.
Most buyers do NOT know your technology or category exists. Someone who needs a couch
searches "will this sofa fit my living room" or "buying furniture online tips" — NOT
"AR furniture", because they've never heard of it. If you only target your own
product-category terms, you miss the huge, warm crowd who have the PROBLEM but not the
VOCABULARY. Never use engineer/tech terms ("webgl", "3d website builder"). Think like
the buyer at every stage of their journey.

Derive keywords across the FULL buyer journey:
1. PROBLEM (they don't know your solution exists yet) — their pain/desire in plain
   words: e.g. "will this sofa fit my living room", "furniture looks different in person",
   "how to buy furniture online without regret". Highest volume, warmest untapped crowd.
2. SOLUTION-SEEKING (they want a way to solve it): "see furniture in my room before
   buying", "visualize furniture at home".
3. PRODUCT-AWARE (they know the category): "ar furniture app", "virtual try on furniture".
4. BUYING / COMPARISON: "best ar furniture apps", "[competitor] alternative".
BALANCE THE MIX — this is critical for real traffic. Do NOT return only obscure
long-tail problem phrases; a strategy of only tiny-volume terms will not move the
needle. You MUST include:
- HIGHER-VOLUME head / category terms buyers type in real numbers (e.g. "ar shopping
  app", "virtual try on", "3d product viewer", "augmented reality shopping"), even if
  more competitive.
- SOLUTION terms of medium volume.
- PROBLEM long-tails (lower volume each, but warm and winnable).
For each keyword, the rationale says HOW content bridges that searcher to the product.

Return ONLY this JSON:
{
  "strategy": "2 sentences: how you'll rank this product and where the traffic will come from",
  "keywords": [
    { "keyword": "lowercase phrase people actually search", "stage": "problem|solution|product|comparison", "intent": "informational|commercial|transactional|community", "priority": 1, "traffic_potential": 0-100, "competition": 0-100, "monthly_volume": "your best estimate of real monthly searches as a rough number, e.g. 90, 1200, 18000", "rationale": "why + how content bridges this searcher to the product" }
  ]
}
Give 24-32 keywords with a realistic SPREAD of volume: roughly a third higher-volume head terms, a third solution terms, a third problem long-tails. Priority 1 = attack first (best mix of demand, winnability, and buyer value).
traffic_potential = realistic RELATIVE monthly demand (a broad head term = high; a niche long-tail = low). competition = how hard to rank (0=easy/open, 100=dominated by giants). monthly_volume = a rough real-number estimate so the owner sees scale. These are honest estimates, not measured data — real numbers come from Google Search Console once connected.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
