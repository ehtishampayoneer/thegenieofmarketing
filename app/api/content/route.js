// app/api/content/route.js
// The Content Engine. Genie writes a complete, publish-ready article + the
// social posts derived from it, in the business's brand voice.
// Output is designed to be AUTO-PUBLISHED (Phase F3). Copy-to-clipboard is a
// temporary stopgap until the WordPress/Shopify write integrations land.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";

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

  const { ai, gsc, topic, scanId, host } = body || {};
  if (!ai) return json({ ok: false, error: "Missing business context." }, 400);

  let data = null;
  let provider = null;
  try {
    const result = await callAI({
      system:
        "You are Genie, an expert SEO content writer. Write genuinely useful, specific content — never generic filler. Match the brand voice given. Return ONLY valid JSON, no markdown fences.",
      json: true,
      maxTokens: 3500,
      temperature: 0.7,
      prompt: buildPrompt({ ai, gsc, topic }),
    });
    data = result.json;
    provider = result.provider;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      return json({ ok: false, retryable: true, message: "Genie is busy — try again in a moment." }, 503);
    }
    return json({ ok: false, error: "Couldn't write the content." }, 500);
  }

  if (!data) return json({ ok: false, error: "Couldn't write the content." }, 500);

  // Persist everything Genie generated as PROPOSED actions (the autopilot spine).
  // Ephemeral no more — these are ready for approval + auto-publish (F2/F3).
  let actionIds = [];
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const rows = [];
      // Validate AI priorities; reject unknowns → 'medium'.
      const VALID = new Set(["high", "quick_win", "strategic", "low", "medium"]);
      const validate = (p) => (VALID.has(p) ? p : "medium");
      const articlePriority = validate(data.articlePriority);
      const socialPriority = validate(data.socialPriority);

      if (data.article) {
        rows.push({
          user_id: user.id,
          scan_id: scanId || null,
          type: "article",
          title: `Article: ${data.article.title || "Untitled"}`,
          payload: data.article,
          target: { platform: "website", host: host || null },
          priority: articlePriority,
          status: "proposed",
        });
      }
      const social = data.social || {};
      const pushSocial = (platform, text) =>
        rows.push({
          user_id: user.id,
          scan_id: scanId || null,
          type: "social_post",
          title: `${platform} post`,
          payload: { platform, text },
          target: { platform: platform.toLowerCase(), host: host || null },
          priority: socialPriority,
          status: "proposed",
        });
      (social.twitter || []).forEach((t) => pushSocial("Twitter/X", t));
      if (social.linkedin) pushSocial("LinkedIn", social.linkedin);
      (social.instagram || []).forEach((t) => pushSocial("Instagram", t));
      (social.facebook || []).forEach((t) => pushSocial("Facebook", t));

      if (rows.length) {
        const { data: inserted } = await supabase.from("actions").insert(rows).select("id");
        actionIds = (inserted || []).map((r) => r.id);
      }
    }
  } catch {
    // saving is best-effort; never block returning the content
  }

  return json({ ok: true, content: data, actionIds, meta: { engine: provider } });
}

function buildPrompt({ ai, gsc, topic }) {
  const voice = ai.brandVoice
    ? `Brand voice: ${ai.brandVoice.tone || ""}, ${ai.brandVoice.formality || "balanced"}. ${ai.brandVoice.note || ""}`
    : "Brand voice: clear, warm, professional.";

  const kw = gsc?.available
    ? `Keywords they already rank for: ${gsc.topQueries.slice(0, 8).map((q) => q.query).join(", ")}.`
    : ai.keywordsToOwn?.length
    ? `Target keywords: ${ai.keywordsToOwn.slice(0, 6).join(", ")}.`
    : "";

  return `Business: ${ai.businessName || "the business"} — ${ai.industry || ""} ${ai.subCategory ? "/ " + ai.subCategory : ""}.
Sells: ${ai.whatTheySell || ""}.
Target customer: ${ai.targetCustomer || ""}.
${voice}
${kw}
${topic ? `Write about this specific topic: "${topic}".` : "Choose a high-value article topic that would attract this business's ideal customers via Google search."}

Also assign a PRIORITY to the article and to the social posts. Use EXACTLY one of these literal values:
- "high" = high impact AND the user should act soon
- "quick_win" = easy + fast + still meaningful impact
- "strategic" = long-term compounding value, not urgent
- "low" = nice-to-have, no urgency
Base it on impact + effort.

Write a complete, ready-to-publish blog article AND the social posts derived from it. Return ONLY this JSON:
{
  "articlePriority": "high | quick_win | strategic | low",
  "socialPriority": "high | quick_win | strategic | low",
  "article": {
    "title": "click-worthy, SEO-friendly title",
    "targetKeyword": "the main keyword this targets",
    "metaTitle": "SEO meta title (<60 chars)",
    "metaDescription": "compelling meta description (150-160 chars)",
    "slug": "url-friendly-slug",
    "body": "the full article in markdown, 600-900 words, with an engaging intro, ## H2 subheadings, useful specific content, and a short ## FAQ section with 2-3 Q&As",
    "wordCount": approximate integer
  },
  "social": {
    "twitter": ["3 different tweet-length posts promoting the article, each with 1-2 relevant hashtags"],
    "linkedin": "1 professional LinkedIn post version",
    "instagram": ["2 visual-first Instagram captions with hashtags"],
    "facebook": ["2 community-friendly Facebook posts"]
  }
}
Make it genuinely specific to this business — real value, not generic advice.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
