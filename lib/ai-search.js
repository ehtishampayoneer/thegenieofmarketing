// lib/ai-search.js
// ── AI-SEARCH VISIBILITY (AEO/GEO), FUSED WITH BUYER INTENT ──
// Not "are you cited somewhere" — "for the exact BUYER questions we found, is
// Genie the answer AI assistants give, and if not, what content wins the
// citation?" This turns AEO from a vanity audit into a buyer-capture engine.
//
// How it models AI search honestly (no paid APIs): retrieval + synthesis — the
// same shape as Perplexity / Google AI Overviews. We retrieve the top sources
// for a buyer question, then have the LLM compose the answer an AI engine would
// give and report who it cites. Always labeled AI-MODELLED (estimated), never
// presented as measured.

import { buildIntentQueries } from "@/lib/intent";

// The buyer questions to check — same universe the Buyer-Intent Radar hunts, so
// AI-search visibility and buyer intent stay fused, not separate audits.
export function aiSearchQuestions(entity, ai = {}, keywords = []) {
  return buildIntentQueries(entity, ai, keywords).slice(0, 6);
}

export function buildVisibilityPrompt(items, entity, ai = {}) {
  const name = ai.businessName || entity?.label || "the entity";
  const competitors = (ai.competitors || []).map((c) => c?.name).filter(Boolean).join(", ") || "(infer)";
  const blocks = items.map((it, i) => {
    const src = (it.sources || []).slice(0, 4).map((s) => `  - ${s.title} — ${(s.snippet || "").slice(0, 140)} (${host(s.url)})`).join("\n") || "  - (no strong sources found)";
    return `[${i}] BUYER QUESTION: "${it.query}"  (journey: ${it.stage})\nTop sources an AI engine would draw from:\n${src}`;
  }).join("\n\n");

  return `You model how AI search engines (ChatGPT, Perplexity, Google AI Overviews, Gemini) answer BUYER questions, grounded in the sources provided plus general knowledge.

Entity we care about: "${name}". Known/likely competitors: ${competitors}.

For EACH question, decide what the AI would actually recommend, then report:
- aiCitesYou: would "${name}" be named/cited in that AI answer? (true/false — be honest; usually false for smaller brands)
- citedBrands: the specific brands/products the AI would name (array)
- competitorsCited: which of the competitors (or peers) get cited (array)
- gap: the single biggest reason "${name}" is missing (one line)
- recommendation: the ONE piece of content that would win the citation — { "title": "...", "type": "comparison|listicle|faq|guide|answer-page", "why": "one line" }
- expectedOutcome: the business result if published (one line, phrased as an estimate)
- confidence: 0-100 (your confidence in this assessment)

Questions:
${blocks}

Return ONLY: {"results":[{"index":0,"aiCitesYou":false,"citedBrands":[],"competitorsCited":[],"gap":"...","recommendation":{"title":"...","type":"comparison","why":"..."},"expectedOutcome":"...","confidence":70}]}`;
}

// Roll up the per-question results into an entity-level visibility picture.
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
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u || ""; } }
