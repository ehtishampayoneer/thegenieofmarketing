// lib/ai-search.js
// ── AI-SEARCH VERDICT (real, multi-engine) ──
// The question buyers ask now isn't only Google — it's "ChatGPT, what should I
// buy?" This engine asks the REAL AI models we can reach (Google Gemini, and —
// when their keys are set — a GPT-class model and an open Llama-class model) the
// exact buyer questions, WITHOUT ever naming the business, then checks
// DETERMINISTICALLY whether the business shows up in each model's actual answer.
//
// Why this is honest by construction:
//   • Engines are labelled for the model that ACTUALLY answered (provider+model),
//     never a model we didn't call.
//   • "Are you named?" is string/entity matching WE control — not the LLM's own
//     opinion of whether it cited you (which it can't judge reliably).
//   • It reflects each model's trained knowledge. We do NOT claim live web search;
//     the UI says "asked directly", which is exactly what happened.
// The same core (runVerdict) powers the in-app War Room and the public AI-Verdict
// hook, so the growth weapon and the product feature are one engine.

import { buildIntentQueries } from "@/lib/intent";
import { callAI } from "@/lib/ai-router";

// Buyer questions to test — the same universe the Buyer-Intent Radar hunts, so
// AI-search visibility and buyer intent stay fused, not separate audits.
export function aiSearchQuestions(entity, ai = {}, keywords = []) {
  return buildIntentQueries(entity, ai, keywords).slice(0, 6);
}

// The engines we try. Each entry restricts the AI router to a DISTINCT provider
// group, so we get distinct real models instead of the same one three times.
// An engine whose provider has no API key simply drops out (askEngine → null);
// the verdict then reports only the models we could genuinely reach.
const ENGINES = [
  { only: ["gemini"] },              // Google Gemini — a real consumer AI assistant
  { only: ["paid"] },                // a GPT-class frontier model, when a paid key is set
  { only: ["groq", "openrouter"] },  // an open Llama-class model
];

// The heart of the feature: ask every reachable model, detect you in each answer.
// allowPaid=false keeps public/anonymous callers (the /verdict hook) on the free
// engines only, so open traffic can never spend the paid fallback's budget.
export async function runVerdict({ entity, ai = {}, questions = [], ctx = null, allowPaid = true } = {}) {
  const qs = (questions || []).slice(0, 6);
  if (!qs.length) return { score: 0, visible: 0, total: 0, byStage: {}, gaps: [], topCompetitors: [], engineCount: 0, engines: [], perQuestion: [] };

  const engineDefs = allowPaid ? ENGINES : ENGINES.filter((e) => !e.only.includes("paid"));
  const asked = await Promise.all(engineDefs.map((e) => askEngine(e.only, qs, ctx)));
  // Keep one result per distinct provider that actually answered.
  const engines = [];
  const seen = new Set();
  for (const r of asked) { if (!r || seen.has(r.provider)) continue; seen.add(r.provider); engines.push(r); }

  const perQuestion = qs.map((q, i) => {
    const byEngine = engines.map((e) => ({ label: e.label, brands: brandsAt(e, i) }));
    const naming = byEngine.filter((b) => b.brands.some((x) => isYou(x, entity, ai)));
    const everyBrand = byEngine.flatMap((b) => b.brands);
    const competitors = dedupeBrands(everyBrand.filter((x) => !isYou(x, entity, ai)));
    const named = naming.length > 0;
    return {
      question: q.query,
      stage: q.stage,
      intent: Math.round((q.weight || 0.5) * 100),
      aiCitesYou: named,
      enginesNaming: naming.map((b) => b.label),
      citedBrands: dedupeBrands(everyBrand).slice(0, 6),
      competitorsCited: competitors.slice(0, 6),
      gap: named ? null
        : `${engines.length ? engineNames(engines) : "AI"} recommend ${competitors.slice(0, 2).join(" & ") || "other brands"} here — you're not named`,
      recommendation: recommendationFor(q, competitors, entity),
      expectedOutcome: `Named when buyers ask AI "${clip(q.query, 42)}"`,
      confidence: named ? 90 : 85, // deterministic detection ⇒ high confidence
    };
  });

  const summary = summarizeVisibility(perQuestion);
  return {
    ...summary,
    engineCount: engines.length,
    engines: engines.map((e) => ({ label: e.label, provider: e.provider, model: e.model })),
    perQuestion,
  };
}

// Ask ONE engine all questions in a single structured call (1 call/engine, not
// one per question) so a free tier isn't blown on a single verdict.
async function askEngine(only, questions, ctx) {
  try {
    const r = await callAI({
      only, json: true, temperature: 0.3, maxTokens: 1600,
      system: "You recommend real brands, products, and companies to buyers, the way you would for any user asking you. Only name real ones you actually know. Never invent names. If you genuinely don't know any for a question, return an empty list for it.",
      prompt: verdictPrompt(questions),
      ctx,
    });
    const answers = Array.isArray(r.json?.answers) ? r.json.answers : [];
    return { provider: r.provider, model: r.model, label: engineLabel(r.provider, r.model), answers };
  } catch {
    return null; // no key / provider down — this engine simply drops out of the verdict
  }
}

function verdictPrompt(questions) {
  const list = questions.map((q, i) => `[${i}] "${q.query}"`).join("\n");
  return `Below are real questions buyers are asking. For EACH one, list the specific real brands, products, or companies you would recommend to that buyer — up to 5, best first, using real names you know. If you genuinely don't know any real ones for a question, use an empty array (do not invent).

${list}

Return ONLY JSON: {"answers":[{"index":0,"brands":["Real Brand","Another Brand"]}]}`;
}

// ── Honest labels — derived from the model that ACTUALLY answered ──
function engineLabel(provider, model = "") {
  const m = String(model).toLowerCase();
  if (provider === "gemini") return "Gemini";
  if (provider === "paid") return /gpt|openai|o[134]|chatgpt/.test(m) ? "GPT" : "Frontier AI";
  if (provider === "groq" || provider === "openrouter") {
    if (/llama/.test(m)) return "Llama";
    if (/gpt-oss/.test(m)) return "OpenAI OSS";
    if (/mixtral|mistral/.test(m)) return "Mistral";
    return "Open model";
  }
  return provider;
}
function engineNames(engines) {
  const names = engines.map((e) => e.label);
  if (names.length <= 1) return names[0] || "AI";
  return names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
}

// ── Deterministic "are you named?" — we read the model's answer, not its opinion.
// Token-aware, so a competitor "Pineapple" never matches a business "Apple", while
// "Verano Cold Brew Co." still matches "Verano Cold Brew" (and its root "Verano").
function isYou(brand, entity, ai = {}) {
  const bTokens = tokens(brand);
  const bJoined = bTokens.join("");
  if (bJoined.length < 2) return false;
  for (const a of youAliases(entity, ai)) {
    if (bJoined === a.join("")) return true;   // whole-name match, spacing-insensitive
    if (containsSeq(bTokens, a)) return true;   // alias words appear as a contiguous run in the brand
  }
  return false;
}
// The names that ARE the business: its label(s), the bare domain, and the primary
// name's first distinctive word (so a shortened brand still matches).
function youAliases(entity, ai = {}) {
  const out = [];
  const add = (s) => { const t = tokens(s); if (t.length) out.push(t); };
  add(ai.businessName); add(entity?.label); add(entity?.name);
  const host = entity?.host || ai?.host || "";
  const bare = String(host).replace(/^www\./, "").split(".")[0].toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (bare) out.push([bare]); // veranocoldbrew.com → ["veranocoldbrew"]
  const primary = tokens(ai.businessName || entity?.label || entity?.name);
  if (primary[0] && primary[0].length >= 4) out.push([primary[0]]); // "Verano Cold Brew" → also ["verano"]
  const seen = new Set(); const uniq = [];
  for (const a of out) { const k = a.join(""); if (k.length < 3 || seen.has(k)) continue; seen.add(k); uniq.push(a); }
  return uniq;
}
function tokens(s) { return String(s || "").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean); }
function containsSeq(hay, needle) {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}
function norm(s) { return String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, ""); }
function dedupeBrands(arr) {
  const seen = new Set(); const out = [];
  for (const b of arr) { const k = norm(b); const label = String(b || "").trim(); if (!k || seen.has(k)) continue; seen.add(k); out.push(label); }
  return out;
}
function brandsAt(engine, i) {
  const a = engine.answers.find((x) => Number(x.index) === i) || engine.answers[i] || {};
  return (Array.isArray(a.brands) ? a.brands : []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 6);
}
function recommendationFor(q, competitors = [], entity = null) {
  const you = cap(entity?.label || entity?.name || "you");
  const type = q.stage === "comparing" ? "comparison" : q.stage === "ready_to_buy" ? "answer-page" : "guide";
  const title = q.stage === "comparing" && competitors[0]
    ? `${you} vs ${competitors[0]}: the honest comparison`
    : `The buyer's answer to "${clip(q.query, 56)}"`;
  return { title, type, why: "An AEO-structured page (direct answer, comparison table, FAQ schema) is what AI engines quote." };
}

// Roll up the per-question results into an entity-level visibility picture.
// (Shape unchanged, so the route, Growth Memory, and the Today War Room keep
// reading one contract regardless of how the answers were produced.)
export function summarizeVisibility(results = []) {
  const total = results.length || 0;
  const visible = results.filter((r) => r.aiCitesYou).length;
  const score = total ? Math.round((visible / total) * 100) : 0;
  const byStage = results.reduce((a, r) => { const s = r.stage || "unknown"; a[s] = a[s] || { total: 0, visible: 0 }; a[s].total++; if (r.aiCitesYou) a[s].visible++; return a; }, {});
  const gaps = results.filter((r) => !r.aiCitesYou).sort((a, b) => (b.intent || 0) - (a.intent || 0));
  const topCompetitors = tally(results.flatMap((r) => r.competitorsCited || []));
  return { score, visible, total, byStage, gaps, topCompetitors };
}

function tally(arr) {
  const m = {};
  for (const x of arr) { const k = String(x || "").trim(); if (k) m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
}
function clip(s, n) { const t = String(s || ""); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; }
function cap(s) { const t = String(s || ""); return t.charAt(0).toUpperCase() + t.slice(1); }
