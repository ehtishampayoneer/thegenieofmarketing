// app/api/audit/route.js
// Runs the verified HTML scan AND the Google PageSpeed scan in parallel,
// merges them, then asks the AI brain for the plain-English layer.

import { runAudit, runSpeed, computeScores } from "@/lib/audit";
import { callAI, AllProvidersFailedError } from "@/lib/ai-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const { url } = body || {};
  if (!url) return json({ ok: false, error: "Enter a website address." }, 400);

  // 1. Run the HTML scan and the speed scan at the same time.
  const [audit, speed] = await Promise.all([runAudit(url), runSpeed(url)]);

  if (!audit.ok) {
    const messages = {
      bad_url: "That doesn't look like a valid web address. Try again, like nike.com.",
      timeout: "That site took too long to respond. It might be slow or blocking bots — try another.",
      fetch_failed: "Couldn't reach that site. Double-check the address and try again.",
      bad_status: `The site responded with an error (status ${audit.status || "?"}). Try another page.`,
    };
    return json(
      { ok: false, reason: audit.reason, message: messages[audit.reason] || "Couldn't scan that site." },
      422
    );
  }

  // 2. Merge speed results (if we got them) and re-score.
  let checks = audit.checks;
  let scores = audit.scores;
  let speedMetrics = null;
  if (speed.ok) {
    checks = [...audit.checks, ...speed.checks];
    scores = computeScores(checks);
    speedMetrics = speed.metrics;
  }

  // 3. AI plain-English layer.
  let ai = null;
  let aiProvider = null;
  try {
    const result = await callAI({
      system:
        "You are Genie, an expert business growth advisor. Plain English, 7th-grade reading level, no jargon. When you give a number that is an estimate (potential revenue, lost customers, impact), phrase it clearly as an estimate ('likely', 'roughly', 'an estimated'). Competitors, keyword suggestions, and primary market are your INFERENCES from the page — treat them as informed guesses, not facts. Never state estimates as measured facts. Be honest, not flattering. Return ONLY valid JSON, no markdown.",
      json: true,
      maxTokens: 1800,
      temperature: 0.6,
      prompt: buildPrompt({ ...audit, scores }, speedMetrics),
    });
    ai = result.json;
    aiProvider = result.provider;
  } catch (e) {
    if (!(e instanceof AllProvidersFailedError)) {
      // still degrade gracefully
    }
  }

  // NEVER STOP: if the AI layer came back empty, build a useful analysis
  // locally from the verified checks so the report is never blank.
  if (!ai) {
    ai = localFallback(checks, scores, audit.signals);
    aiProvider = "genie-core";
  }

  return json({
    ok: true,
    url: audit.url,
    finalUrl: audit.finalUrl,
    scores,
    speed: speedMetrics, // null if PageSpeed wasn't available
    speedAvailable: speed.ok,
    checks,
    signals: publicSignals(audit.signals),
    ai,
    meta: { engine: aiProvider }, // internal — for your debugging, not shown as a brand
  });
}

function buildPrompt(audit, speedMetrics) {
  const failing = audit.checks
    .filter((c) => c.status !== "pass")
    .map((c) => `- [${c.status.toUpperCase()}/${c.impact}] ${c.label}: ${c.detail}`)
    .join("\n");

  const speedLine = speedMetrics
    ? `Speed: ${speedMetrics.performance}/100, LCP ${speedMetrics.lcpSec}s, CLS ${speedMetrics.cls}`
    : "Speed: not measured this run";

  return `A business website was scanned. Here is the raw data.

URL: ${audit.finalUrl}
Overall score: ${audit.scores.overall}/100
Sub-scores: SEO ${audit.scores.seo}, Speed ${audit.scores.speed ?? "n/a"}, Trust ${audit.scores.trust}, Technical ${audit.scores.technical}, Social ${audit.scores.social}
${speedLine}

Page title: ${audit.signals.title || "(none)"}
Meta description: ${audit.signals.metaDesc || "(none)"}
Main heading: ${audit.signals.h1Text || "(none)"}

Issues found:
${failing || "(no major issues)"}

Page text excerpt:
"""${audit.pageText.slice(0, 2500)}"""

Return ONLY this JSON shape (fill every field; use best inference where data is thin):
{
  "businessName": "best guess at the business name",
  "industry": "short industry label",
  "subCategory": "more specific niche within that industry",
  "businessType": "one of: E-commerce, Local service, SaaS, Content/Media, Marketplace, Agency, Other",
  "whatTheySell": "one short sentence",
  "primaryMarket": "best-guess country or region (an estimate)",
  "targetCustomer": "1-2 sentences describing their likely ideal customer",
  "brandVoice": {
    "tone": "2-4 words, e.g. 'Warm, aspirational'",
    "formality": "one of: Casual, Balanced, Formal",
    "note": "one short sentence on their writing style"
  },
  "competitors": [
    { "name": "likely competitor (inferred)", "why": "short reason" }
  ],
  "keywordsToOwn": ["5 to 8 short keyword phrases they should rank for"],
  "strengths": ["2 to 4 real strengths visible from the page"],
  "weaknesses": ["2 to 4 weaknesses, drawn from the issues above"],
  "summary": "2-3 plain sentences: what this business is and its single biggest growth opportunity",
  "topFixes": [
    {
      "title": "short fix name",
      "whatItMeans": "1 sentence in plain English",
      "whatItCosts": "1 sentence on the cost of ignoring it. If you cite a number, mark it as an estimate.",
      "howToFix": "1-2 concrete sentences"
    }
  ]
}
Competitors: give 2-3 plausible inferred guesses based on the industry. Pick the 3 highest-impact fixes from the issues. If there are no issues, give 3 growth ideas instead.`;
}

function localFallback(checks, scores, signals) {
  const rank = { high: 0, medium: 1, low: 2 };
  const problems = checks
    .filter((c) => c.status !== "pass")
    .sort((a, b) => rank[a.impact] - rank[b.impact])
    .slice(0, 3);

  const name =
    (signals.title || "").split(/[|\-–—·]/)[0].trim() ||
    signals.host ||
    "This business";

  const level =
    scores.overall >= 75
      ? "in good shape overall"
      : scores.overall >= 60
      ? "solid but with clear room to grow"
      : "leaving real growth on the table";

  return {
    businessName: name,
    industry: "",
    subCategory: "",
    businessType: "",
    whatTheySell: "",
    primaryMarket: "",
    targetCustomer: "",
    brandVoice: null,
    competitors: [],
    keywordsToOwn: [],
    strengths: [],
    weaknesses: problems.map((c) => c.label),
    summary: `${name} scores ${scores.overall}/100 and is ${level}. Fixing the items below is the fastest way to get found by more customers.`,
    topFixes: problems.map((c) => ({
      title: c.label,
      whatItMeans: c.detail,
      whatItCosts:
        c.impact === "high"
          ? "This is a high-impact issue — leaving it likely costs you visitors and customers."
          : "Worth fixing to improve how you show up and convert.",
      howToFix: "See the detail above; this is a well-known, fixable issue.",
    })),
  };
}

function publicSignals(s) {
  return {
    host: s.host,
    title: s.title,
    h1Text: s.h1Text,
    imgAltPct: s.imgAltPct,
    imgTotal: s.imgTotal,
    socialLinkCount: s.socialLinkCount,
    hasAnalytics: s.hasAnalytics,
    isHttps: s.isHttps,
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
