// app/api/ai-search/route.js
// ── AI-SEARCH VISIBILITY RADAR (intent-fused) ──
// For the buyer questions Genie is hunting, model the AI answer, measure whether
// the entity is cited, expose who wins instead, and recommend the content that
// captures the citation. Every gap + recommendation is written to the Decision
// Ledger and Growth Memory so it's explainable and compounds with content/outreach.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { resolveRadarUser } from "@/lib/radar-auth";
import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { webSearch } from "@/lib/search";
import { getBrief, recordDecision, recordLearning } from "@/lib/growth-memory";
import { aiSearchQuestions, buildVisibilityPrompt, summarizeVisibility } from "@/lib/ai-search";
import { logActivity, logActivityBatch } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { host, ai = {} } = body || {};
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  const { entity } = await getBrief(supabase, userId, host, ai);

  let keywords = [];
  try {
    const { data } = await supabase.from("keywords").select("keyword").eq("user_id", userId).eq("host", host).limit(6);
    keywords = (data || []).map((k) => k.keyword);
  } catch {}

  const questions = aiSearchQuestions(entity, ai, keywords);
  if (questions.length === 0) return json({ ok: false, needsContext: true, message: "Genie needs a scan or keyword to check AI search." }, 400);

  await logActivity(supabase, userId, {
    host, verb: "scanning", icon: "🔮",
    message: `Checking AI search on ${questions.length} buyer questions`,
    detail: "ChatGPT · Perplexity · Google AI Overviews · Gemini (modelled)",
  });

  // 1) Retrieve the sources an AI engine would draw from (parallel, bounded).
  const retrieved = await Promise.allSettled(questions.map((q) => webSearch(q.query, { limit: 4 })));
  const items = questions.map((q, i) => ({ ...q, sources: retrieved[i].status === "fulfilled" ? retrieved[i].value : [] }));

  // 2) Model the AI answers + citations in one structured call.
  let modelled;
  try {
    const result = await callAI({
      system: "You are a precise AEO/GEO analyst. Be honest — most smaller brands are NOT cited yet. Return ONLY valid JSON.",
      json: true, maxTokens: 3200, temperature: 0.4,
      prompt: buildVisibilityPrompt(items, entity, ai),
    });
    modelled = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, message: "Genie is busy — try again." }, 503);
    modelled = { results: [] };
  }

  const raw = Array.isArray(modelled?.results) ? modelled.results : [];
  const results = questions.map((q, i) => {
    const r = raw.find((x) => x.index === i) || raw[i] || {};
    return {
      question: q.query,
      stage: q.stage,
      intent: Math.round((q.weight || 0.5) * 100),
      aiCitesYou: !!r.aiCitesYou,
      citedBrands: r.citedBrands || [],
      competitorsCited: r.competitorsCited || [],
      gap: r.gap || null,
      recommendation: r.recommendation || null,
      expectedOutcome: r.expectedOutcome || null,
      confidence: clampNum(r.confidence, 65),
      sources: (items[i].sources || []).slice(0, 3).map((s) => ({ title: s.title, url: s.url })),
    };
  });

  const summary = summarizeVisibility(results);

  // 3) Record every gap (explainability) + the visibility learning (compounding).
  for (const g of summary.gaps.slice(0, 8)) {
    await recordDecision(supabase, {
      userId, host, kind: "aeo_gap", choice: g.question,
      rationale: g.gap || `Not cited by AI for a ${g.stage} buyer question`,
      confidence: g.confidence / 100,
      meta: { stage: g.stage, competitorsCited: g.competitorsCited, recommendation: g.recommendation, expectedOutcome: g.expectedOutcome },
    });
  }
  await recordLearning(supabase, {
    userId, host, key: "ai_search_visibility",
    insight: `AI-search visibility ~${summary.score}% across buyer questions${summary.topCompetitors[0] ? `; AI most often cites ${summary.topCompetitors[0].name}` : ""}. Win citations with comparison/answer content.`,
    weight: 2, meta: { score: summary.score, topCompetitors: summary.topCompetitors },
  });

  await logActivityBatch(supabase, userId, [
    { host, verb: "discovered", icon: "🔮", message: `AI cites you in ${summary.visible}/${summary.total} buyer answers`, detail: summary.gaps.slice(0, 2).map((g) => g.question).join(" · "), meta: { score: summary.score } },
    summary.gaps.length ? { host, verb: "learning", message: `${summary.gaps.length} AI-search gaps found — Genie drafted content plans to win them`, meta: { gaps: summary.gaps.length } } : null,
  ].filter(Boolean));

  return json({
    ok: true,
    entity: { type: entity.type, label: entity.label },
    score: summary.score,
    visible: summary.visible,
    total: summary.total,
    topCompetitors: summary.topCompetitors,
    byStage: summary.byStage,
    opportunities: results.sort((a, b) => Number(a.aiCitesYou) - Number(b.aiCitesYou) || b.intent - a.intent),
  });
}

// Read stored AI-search results (from the Decision Ledger) for the surface.
export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let host = new URL(request.url).searchParams.get("host");
  try {
    if (!host) {
      const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      host = data ? hostOf(data) : null;
    }
  } catch {}

  let decisions = [], score = null, competitors = [];
  try {
    let q = supabase.from("decisions").select("choice, rationale, confidence, meta, created_at").eq("user_id", user.id).eq("kind", "aeo_gap").order("created_at", { ascending: false }).limit(12);
    if (host) q = q.eq("host", host);
    const { data } = await q; decisions = data || [];
  } catch {}
  try {
    let q = supabase.from("growth_memory").select("meta").eq("user_id", user.id).eq("mkey", "ai_search_visibility").limit(1);
    if (host) q = q.eq("host", host);
    const { data } = await q;
    const m = data?.[0]?.meta;
    if (m) { score = m.score ?? null; competitors = (m.topCompetitors || []).map((c) => c.name); }
  } catch {}

  const opportunities = decisions.map((d) => {
    const rec = d.meta?.recommendation || {};
    return {
      discovered: `When buyers ask AI “${d.choice}”, you’re not cited`,
      badges: [{ label: String(d.meta?.stage || "comparing").replace(/_/g, " "), tone: "dawn" }, { label: "Not cited", tone: "danger" }],
      why: d.rationale || "AI recommends competitors instead at the moment of decision.",
      recommendation: rec.title || "Publish an AI-citable answer page.",
      ifApproved: "Genie writes it AEO-structured (direct answer, comparison table, FAQ schema) and publishes.",
      outcome: d.meta?.expectedOutcome || "Become citable for a high-intent AI answer.",
      rationale: d.rationale || null,
      confidence: Math.round((d.confidence ?? 0.7) * 100) || 70,
      tint: "dawn",
    };
  });

  return json({ ok: true, live: true, score, competitors, opportunities });
}

function clampNum(n, dflt) { const v = Number(n); return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : dflt; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
