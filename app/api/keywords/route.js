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
// volumeToPotential was used below but never imported. It only runs when Google
// Ads returns real volumes, i.e. right after the owner connects Google, so every
// keyword build then threw a ReferenceError and saved nothing.
import { enrichWithVolumes, volumeToPotential } from "@/lib/google-ads";
import { swallow } from "@/lib/log";
import { getUsageMap } from "@/lib/keyword-usage";
import { resolveRadarUser } from "@/lib/radar-auth";
import { briefBlock } from "@/lib/business-brief";
import { strategyPromptBlock } from "@/lib/strategy-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  // Attach each keyword's "used in …" trail so the UI can show exactly what Genie
  // wrote for it (article / social / reply / email).
  const usage = await getUsageMap(supabase, user.id, host);
  portfolio.graded = (portfolio.graded || []).map((k) => ({ ...k, usage: usage[k.keyword] || [] }));
  return json({ ok: true, ...portfolio });
}

// POST { host, ai } → Genie derives + stores the keyword strategy
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  // Accepts the nightly job as well as a signed-in owner. The nightly engine only
  // runs for businesses that HAVE keywords, so when the first derivation failed a
  // business was skipped every night with nothing to recover it. The job now
  // calls this to rebuild them (lib/genie-jobs.js).
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  const user = { id: userId };
  const { host, productOverride, rebuild } = body || {};
  let { ai } = body || {};
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  // The Growth page's "Rebuild strategy" sends only the host. Without this, the
  // model was asked for a keyword strategy knowing nothing but the domain name,
  // every field read "(infer)", and the owner's onboarding brief was ignored.
  if (!ai || !Object.keys(ai).length) {
    try {
      const { data: s } = await supabase.from("scans").select("ai")
        .eq("user_id", userId).or(`final_url.ilike.%${host}%,url.ilike.%${host}%`)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      ai = s?.ai || {};
    } catch { ai = {}; }
  }

  // The plan decides what this business is FOR, so the keywords follow it
  // rather than being re-derived from the same notes a second time.
  let plan = "";
  try { plan = await strategyPromptBlock(supabase, { userId, host, ai }); } catch {}

  // Layer 0 (free): ground candidates in REAL Google searches via Autocomplete.
  let realSearches = [];
  try {
    const seeds = [ai?.whatTheySell, ai?.subCategory, ai?.industry, ai?.businessName, productOverride]
      .filter(Boolean).flatMap((s) => String(s).split(/[,/]|\band\b/)).map((s) => s.trim()).filter((s) => s.length > 2).slice(0, 6);
    realSearches = await expandSeeds(seeds.length ? seeds : [host]);
  } catch (e) { swallow("keywords.derive.autocomplete", e, { userId: user.id, host }); }

  let derived = null;
  try {
    const result = await callAI({
      system:
        "You are Genie, an elite SEO strategist. From a business profile, you derive the keyword strategy YOURSELF — the user gives you nothing. Think like someone who will rank this product across Google, Reddit, Quora, and forums. Produce a focused, high-intent keyword set: a mix of informational (blog-rankable), commercial/transactional (buyer intent), and community (how people phrase it in discussions). Prioritize by rankability × buyer value. Return ONLY valid JSON.",
      json: true,
      maxTokens: 5000, timeoutMs: 50000,
      temperature: 0.5,
      prompt: buildPrompt(host, ai, productOverride, realSearches, plan),
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
  // If the owner corrected the product OR asked for a clean rebuild, wipe the old
  // Genie-derived keywords first so the fresh, correct set fully replaces them
  // (not merged with the stale ones). Keeps keywords the owner added by hand.
  if (productOverride || rebuild) {
    let del = supabase.from("keywords").delete().eq("user_id", user.id).eq("host", host);
    // On a plain rebuild, keep keywords the owner added by hand (source='user');
    // clear everything Genie derived — including legacy rows with a null source
    // (neq alone won't match nulls in Postgres, so match null explicitly).
    if (rebuild && !productOverride) del = del.or("source.is.null,source.neq.user");
    await del;
  }
  // Insert the new keywords, then REFRESH Genie's estimates on ones already tracked.
  // A plain upsert with ignoreDuplicates silently dropped the whole row for existing
  // keywords, so a sharper competition/potential estimate could never replace an old
  // one. Coverage, real GSC data, health and source are deliberately preserved —
  // those are earned, and re-deriving must never wipe them.
  try {
    const { data: existingRows } = await supabase.from("keywords").select("keyword")
      .eq("user_id", user.id).eq("host", host).in("keyword", rows.map((r) => r.keyword));
    const existing = new Set((existingRows || []).map((r) => r.keyword));

    const fresh = rows.filter((r) => !existing.has(r.keyword));
    if (fresh.length) {
      const { error } = await supabase.from("keywords").insert(fresh);
      if (error) throw error;
    }
    await Promise.all(rows.filter((r) => existing.has(r.keyword)).map((r) =>
      supabase.from("keywords").update({
        intent: r.intent, priority: r.priority, rationale: r.rationale,
        traffic_potential: r.traffic_potential, competition: r.competition,
        last_scored_at: r.last_scored_at,
      }).eq("user_id", user.id).eq("host", host).eq("keyword", r.keyword)
    ));
  } catch (e) {
    swallow("keywords.derive.save", e, { userId: user.id, host });
    // Last resort: at least get the new keywords in.
    await supabase.from("keywords").upsert(rows, { onConflict: "user_id,host,keyword", ignoreDuplicates: true });
  }

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
  // grounded = these keywords were shaped by REAL Google Autocomplete phrases, not
  // AI guesses alone. Surfaced so the owner knows which they're looking at.
  return json({ ok: true, ...portfolio, strategy: derived.strategy || null, grounded: realSearches.length > 0 });
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

function buildPrompt(host, ai, productOverride, realSearches = [], plan = "") {
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
${briefBlock(ai || {}, { max: 1800 })}
${plan}
${real}
════════ HOW TO THINK (read carefully — this is the whole game) ════════
FIRST, separate two different things:
  • THE PRODUCTS — the actual things this business sells and that people pay for
    (e.g. sofas, dining tables, rugs, sneakers, home decor). This is the DEMAND.
  • THE DIFFERENTIATOR — the special way this business does it (e.g. see it in your
    room in AR before buying, virtual try-on). This is the ANGLE that wins the click
    and the sale — it is NOT what most people search for.

The #1 mistake (do NOT make it): targeting the DIFFERENTIATOR as your main keywords.
Buyers search for the THING THEY WANT, never for the clever way you deliver it. They
have usually never heard of your method and will never type its name. Two examples
from unrelated trades, so the shape is clear and neither is a template:
  · A payroll tool for accountants: buyers type "payroll software for accountants"
    and "how to grow an accountancy practice" — never "automated payroll engine".
  · A firm that fits commercial kitchens: buyers type "commercial kitchen cost" and
    "restaurant kitchen layout" — never "kitchen workflow optimisation".
Build a strategy around the method's name and you will rank for a trickle of
curious traffic and miss every actual buyer. The differentiator is how you CONVERT
once they arrive and how the content stands out — the keyword itself has to be what
the buyer really types when they are trying to buy.

════════ THE TIERS (in priority order) ════════
TIER 1 — CORE COMMERCIAL / PRODUCT (the money keywords — make these the BACKBONE).
  The real words buyers type to BUY what this store sells. If it sells many categories
  (a marketplace), cover its MAIN product categories. Patterns:
  "buy [product] online", "[product] for sale", "[product] online", "best [product]",
  "affordable/cheap [product]", "modern/[style] [product]", "[product] store online",
  "online [category] shopping". Fill the brackets from what THIS business actually
  sells, in the words its buyers use, and cover its main categories if it has several.
  These carry the most buyer intent and real volume — they MUST dominate the list.
TIER 2 — DIFFERENTIATOR / SOLUTION (medium volume, low competition, HIGH conversion).
  The buyer's desire that your differentiator uniquely answers, written as the buyer
  would say it — the outcome they want, not the mechanism you use to deliver it.
TIER 3 — PROBLEM (warm, untapped, long-tail): the pain in plain words, from before
  they knew a solution existed. Usually a full sentence, often a worry or a regret.
TIER 4 — PRODUCT-AWARE / CATEGORY + COMPARISON (smallest share): the category name
  itself, "best [category] for [buyer]", "[competitor] alternative".

Never use engineer or industry jargon. If a phrase would only be typed by someone who
already works in this field, it belongs nowhere in the list.

════════ THE MIX (enforce this ratio) ════════
Return 24-32 keywords, weighted toward demand:
  ~45% TIER 1 (core commercial product terms — the backbone),
  ~25% TIER 2 (differentiator/solution),
  ~20% TIER 3 (problem long-tails),
  ~10% TIER 4 (tech/comparison).
Priority 1 = attack first (best mix of real demand, winnability, and buyer value) —
most Priority-1 keywords should be TIER 1. For each keyword, the rationale says how the
content ranks for that term AND uses this business's own differentiator to convert.

Return ONLY this JSON:
{
  "strategy": "2 sentences: the product demand you'll capture + how the differentiator converts it",
  "keywords": [
    { "keyword": "lowercase phrase people actually search", "stage": "commercial|solution|problem|comparison", "intent": "informational|commercial|transactional|community", "priority": 1, "traffic_potential": 0-100, "competition": 0-100, "monthly_volume": "rough real monthly searches, e.g. 90, 1200, 18000", "rationale": "why it wins + how content ranks for it and uses the differentiator to convert" }
  ]
}
traffic_potential = realistic RELATIVE monthly demand (a broad product head term = high; a niche long-tail = low). competition = how hard to rank (0=easy/open, 100=dominated by giants). monthly_volume = a rough real-number estimate so the owner sees scale. Commercial product terms should mostly be higher volume than problem long-tails. These are honest estimates, not measured data — real numbers come from Google Search Console once connected.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
