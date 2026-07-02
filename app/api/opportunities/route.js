// app/api/opportunities/route.js
// The Opportunity Engine. Takes a scan's context (business profile, issues,
// and any real Search Console data) and produces a structured set of growth
// opportunities with estimated impact. All AI-inferred parts are labeled
// estimates — no fake precise numbers (per data-source decisions).

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const { finalUrl, ai, checks, gsc } = body || {};
  if (!ai) return json({ ok: false, error: "Missing scan context." }, 400);

  // Real, verified quick-wins from Search Console (if the user owns the site).
  const verifiedKeywordWins =
    gsc?.available && gsc.opportunities?.length
      ? gsc.opportunities.map((o) => ({
          keyword: o.query,
          detail: `Ranks #${Math.round(o.position)}, seen ${o.impressions} times, only ${o.ctr}% click through.`,
          action: "Rewrite the page title & meta description to earn more clicks on a keyword you already rank for.",
        }))
      : [];

  let data = null;
  let provider = null;
  try {
    const result = await callAI({
      system:
        "You are Genie, a growth strategist. Everything you output here is an INFORMED ESTIMATE, not measured data. Never invent precise numbers (no exact search volumes or exact dollar figures). Use demand bands (Low/Medium/High) and loose ranges. Plain English, 7th-grade level. Return ONLY valid JSON, no markdown.",
      json: true,
      maxTokens: 2000,
      temperature: 0.65,
      prompt: buildPrompt({ finalUrl, ai, checks, gsc }),
    });
    data = result.json;
    provider = result.provider;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      return json(
        { ok: false, retryable: true, message: "Genie is busy — try again in a moment." },
        503
      );
    }
    return json({ ok: false, error: "Couldn't generate opportunities." }, 500);
  }

  if (!data) {
    return json({ ok: false, error: "Couldn't generate opportunities." }, 500);
  }

  return json({
    ok: true,
    opportunities: {
      ...data,
      verifiedKeywordWins, // real GSC-based, shown as verified when present
    },
    meta: { engine: provider },
  });
}

function buildPrompt({ finalUrl, ai, checks, gsc }) {
  const weaknesses = (checks || [])
    .filter((c) => c.status === "fail" || c.status === "warn")
    .slice(0, 12)
    .map((c) => `- ${c.label}: ${c.detail}`)
    .join("\n");

  const realKw = gsc?.available
    ? `\nReal keywords they already rank for (from Search Console): ${gsc.topQueries
        .slice(0, 10)
        .map((q) => `"${q.query}" (#${Math.round(q.position)})`)
        .join(", ")}`
    : "";

  return `Business context:
Name: ${ai.businessName || "(unknown)"}
Industry: ${ai.industry || ""} / ${ai.subCategory || ""}
Type: ${ai.businessType || ""}
Sells: ${ai.whatTheySell || ""}
Target customer: ${ai.targetCustomer || ""}
Primary market: ${ai.primaryMarket || "(unknown)"}

Current weaknesses on the site:
${weaknesses || "(none major)"}
${realKw}

Produce a growth opportunity set. Return ONLY this JSON:
{
  "totalOpportunity": {
    "range": "a loose monthly revenue-opportunity range, e.g. '$500–$2,000/mo'",
    "basis": "one plain sentence on what this estimate is based on"
  },
  "keywordOpportunities": [
    {
      "keyword": "a keyword phrase they should target",
      "demand": "Low | Medium | High",
      "competition": "Low | Medium | High",
      "rationale": "one short sentence",
      "estValue": "loose range like '$100–$400/mo'"
    }
  ],
  "competitorWeaknesses": [
    { "competitor": "inferred competitor name", "gap": "where they're weak", "howToExploit": "one sentence" }
  ],
  "contentGaps": [
    { "topic": "content/article topic they're missing", "rationale": "why it matters", "estDemand": "Low | Medium | High" }
  ],
  "productOpportunities": [
    { "idea": "a product/offering opportunity", "rationale": "one sentence" }
  ],
  "partnershipOpportunities": [
    { "partnerType": "kind of partner to reach out to", "rationale": "one sentence" }
  ]
}
Give 4-6 keyword opportunities, 2-3 each of the others. Everything is an estimate — keep numbers loose, never precise. If real ranking keywords are listed above, suggest NEW keywords, not those.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
