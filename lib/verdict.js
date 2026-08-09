// lib/verdict.js
// ── THE PUBLIC AI-VERDICT (the growth hook) ──
// Anyone pastes a URL; we run a light, anonymous, SSRF-guarded scan (reusing the
// audit engine), infer a one-line business profile, then ask the REAL free AI
// models (Gemini + an open Llama model) what they recommend for that business's
// buyer questions — and detect whether the business is named. Zero account, zero
// stored data. Same engine (runVerdict) as the in-app War Room, so the marketing
// weapon and the product are one and the same.

import { runAudit } from "@/lib/audit";
import { callAI } from "@/lib/ai-router";
import { buildIntentQueries } from "@/lib/intent";
import { runVerdict } from "@/lib/ai-search";

export async function publicVerdict(rawUrl, { ctx = null, maxQuestions = 4 } = {}) {
  // 1) Live, SSRF-safe scan of the homepage (no account needed).
  const audit = await runAudit(rawUrl);
  if (!audit.ok) return { ok: false, reason: audit.reason || "scan_failed" };
  const s = audit.signals || {};
  const host = s.host || "";

  // 2) Infer a light profile (one free call). Falls back to the page title so a
  //    verdict is still possible if the model is momentarily unavailable.
  const profile = await inferProfile(s, audit.pageText, ctx);

  const ai = {
    businessName: profile.businessName || null,
    industry: profile.category || null,
    subCategory: profile.category || null,
    competitors: (profile.competitors || []).map((n) => ({ name: n })),
    host,
  };
  const entity = { label: profile.businessName || host, name: profile.businessName || host, type: "business", host };

  // 3) Build the buyer questions, then ask the real free models — never the paid
  //    fallback (public traffic must not spend a paid budget).
  const questions = (buildIntentQueries(entity, ai, profile.keywords || []) || []).slice(0, maxQuestions);
  if (!questions.length) return { ok: false, reason: "no_questions", host, business: entity.label };

  const verdict = await runVerdict({ entity, ai, questions, ctx, allowPaid: false });
  if (!verdict.engineCount) return { ok: false, reason: "no_ai_engine", host, business: entity.label };

  return {
    ok: true,
    host,
    business: entity.label,
    category: profile.category || null,
    engines: verdict.engines.map((e) => e.label),
    score: verdict.score,
    visible: verdict.visible,
    total: verdict.total,
    topCompetitors: (verdict.topCompetitors || []).map((c) => c.name).slice(0, 4),
    questions: verdict.perQuestion.map((r) => ({
      question: r.question,
      named: !!r.aiCitesYou,
      namedBy: r.enginesNaming || [],
      recommendsInstead: (r.competitorsCited || []).slice(0, 3),
    })),
  };
}

async function inferProfile(signals, pageText, ctx) {
  const brief = [
    `Website: ${signals.host || ""}`,
    `Title: ${signals.title || ""}`,
    `Description: ${signals.metaDesc || ""}`,
    `Main heading: ${signals.h1Text || ""}`,
    `Page text: ${String(pageText || "").slice(0, 1200)}`,
  ].join("\n");

  try {
    const r = await callAI({
      only: ["gemini", "groq", "openrouter"], // free engines only
      json: true, temperature: 0.2, maxTokens: 600,
      system: "You extract a concise, accurate business profile from a homepage. Terse. Never invent competitors — leave the array empty if unsure.",
      prompt: `From this homepage, identify:
- businessName: the brand's name
- category: the ONE thing it sells, in a buyer's words (e.g. "project management software", "cold brew coffee subscription", "local wedding photography")
- competitors: up to 4 real, well-known competitor brands in that category (empty if you're not sure)
- keywords: up to 4 short phrases a buyer would type/ask to find this kind of product

${brief}

Return ONLY JSON: {"businessName":"","category":"","competitors":[],"keywords":[]}`,
      ctx,
    });
    const j = r.json || {};
    return {
      businessName: str(j.businessName) || fallbackName(signals),
      category: str(j.category),
      competitors: arr(j.competitors),
      keywords: arr(j.keywords),
    };
  } catch {
    return { businessName: fallbackName(signals), category: "", competitors: [], keywords: [] };
  }
}

function fallbackName(signals) {
  const fromTitle = String(signals.title || "").split(/[|\-–—:]/)[0].trim();
  return fromTitle || signals.host || "this business";
}
function str(v) { return typeof v === "string" ? v.trim().slice(0, 80) : ""; }
function arr(v) { return Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 4) : []; }
