// app/api/audit/route.js
// Runs the real audit, then asks the AI brain to turn the raw findings into
// a plain-English business profile + the top 3 fixes that matter most.

import { runAudit } from "@/lib/audit";
import { callAI, AllProvidersFailedError } from "@/lib/ai-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const { url } = body || {};
  if (!url) return json({ ok: false, error: "Enter a website address." }, 400);

  // 1. The verified scan
  const audit = await runAudit(url);

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

  // 2. The AI plain-English layer
  let ai = null;
  let aiProvider = null;
  try {
    const result = await callAI({
      system:
        "You are Genie, an expert business growth advisor. Plain English, 7th-grade reading level, no jargon. Always quantify impact in customers or money where you can. Be honest, not flattering. Return ONLY valid JSON, no markdown.",
      json: true,
      maxTokens: 1200,
      temperature: 0.6,
      prompt: buildPrompt(audit),
    });
    ai = result.json;
    aiProvider = result.provider;
  } catch (e) {
    // Never stop — return the verified scan even if the AI layer is busy.
    if (!(e instanceof AllProvidersFailedError)) {
      // unexpected, but still degrade gracefully
    }
  }

  return json({
    ok: true,
    url: audit.url,
    finalUrl: audit.finalUrl,
    scores: audit.scores,
    checks: audit.checks,
    signals: publicSignals(audit.signals),
    ai, // { businessName, industry, whatTheySell, summary, topFixes:[...] } or null
    meta: { aiProvider },
  });
}

function buildPrompt(audit) {
  const failing = audit.checks
    .filter((c) => c.status !== "pass")
    .map((c) => `- [${c.status.toUpperCase()}/${c.impact}] ${c.label}: ${c.detail}`)
    .join("\n");

  return `A business website was scanned. Here is the raw data.

URL: ${audit.finalUrl}
Overall score: ${audit.scores.overall}/100
Sub-scores: SEO ${audit.scores.seo}, Trust ${audit.scores.trust}, Technical ${audit.scores.technical}, Social ${audit.scores.social}

Page title: ${audit.signals.title || "(none)"}
Main heading: ${audit.signals.h1Text || "(none)"}

Issues found:
${failing || "(no major issues)"}

Page text excerpt:
"""${audit.pageText.slice(0, 1500)}"""

Return ONLY this JSON shape:
{
  "businessName": "best guess at the business name",
  "industry": "short industry label",
  "whatTheySell": "one short sentence",
  "summary": "2-3 plain sentences: what this business is and its single biggest growth opportunity",
  "topFixes": [
    {
      "title": "short fix name",
      "whatItMeans": "1 sentence in plain English",
      "whatItCosts": "1 sentence on what ignoring it costs, in customers or money",
      "howToFix": "1-2 concrete sentences"
    }
  ]
}
Pick the 3 highest-impact fixes from the issues. If there are no issues, give 3 growth ideas instead.`;
}

function publicSignals(s) {
  // Only expose what's useful to the UI, not the whole internal blob.
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
