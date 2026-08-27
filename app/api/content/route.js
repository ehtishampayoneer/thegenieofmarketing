// app/api/content/route.js
// The Content Engine. Genie writes a complete, publish-ready article + the
// social posts derived from it, in the business's brand voice.
// Output is designed to be AUTO-PUBLISHED (Phase F3). Copy-to-clipboard is a
// temporary stopgap until the WordPress/Shopify write integrations land.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRadarUser } from "@/lib/radar-auth";
import { hostOf } from "@/lib/business";
import { selectTargets, recordUsage } from "@/lib/keyword-usage";
import { pickPostImage } from "@/lib/media";
import { classifyEntity } from "@/lib/entity";
import { deDash } from "@/lib/markdown";

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

  let { ai, gsc, topic, scanId, host } = body || {};

  // Resolve the caller up front (browser session or trusted cron).
  const { supabase, userId } = await resolveRadarUser(request, body);

  // Self-sufficient: with no business context passed, use the caller's latest
  // scan — so a one-tap "draft my content" works without re-onboarding.
  if (!ai && userId) {
    try {
      const { data: scan } = await supabase.from("scans").select("ai, final_url, url, id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (scan) { ai = scan.ai; host = host || hostOf(scan); scanId = scanId || scan.id; }
    } catch {}
  }
  if (!ai) return json({ ok: false, error: "No business yet — run a scan first." }, 400);

  // Standing instructions the owner gave Genie in chat (tone, focus, dos/don'ts).
  // These make "write more casually" actually stick across everything Genie writes.
  let directives = [];
  if (userId) {
    try {
      const { data: dirs } = await supabase.from("growth_memory").select("insight").eq("user_id", userId).ilike("mkey", "directive:%").order("updated_at", { ascending: false }).limit(10);
      directives = (dirs || []).map((d) => d.insight).filter(Boolean);
    } catch {}
  }

  // ── PICK FROM THE REAL STRATEGY ──
  // Unless a topic was forced, choose the next keyword to write for straight from
  // the portfolio (wave-aware: uncovered + easy wins first), with its related
  // cluster. This is what connects the keyword strategy to what actually gets
  // written — instead of the scan's rough guesses.
  let pick = null;
  if (!topic && userId && host) {
    try { const picks = await selectTargets(supabase, userId, host, { count: 1 }); pick = picks[0] || null; } catch {}
  }

  // ── INTERNAL LINKING ── Pull the related articles Genie already wrote on this
  // site so the new piece can link to them (markdown → /slug). Internal links
  // between topically-related pages are how a cluster builds ranking authority.
  let existingLinks = [];
  if (userId && host) {
    try {
      const seed = String(pick?.keyword || topic || "").toLowerCase();
      const words = new Set(seed.split(/[^a-z0-9]+/).filter((w) => w.length > 3));
      // Only link to pages that are actually LIVE (have a real published URL in
      // result.url). Using the absolute URL means the link renders and resolves —
      // a relative slug wouldn't linkify and could 404.
      const { data: arts } = await supabase.from("actions")
        .select("payload, result").eq("user_id", userId).eq("type", "article")
        .order("created_at", { ascending: false }).limit(40);
      existingLinks = (arts || [])
        .map((a) => ({ p: a.payload, url: a.result?.url }))
        .filter((x) => x.p && x.p.title && x.url)
        .map((x) => ({ title: x.p.title, url: x.url, overlap: `${x.p.title} ${x.p.targetKeyword || ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => words.has(w)).length }))
        .filter((x) => x.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 3);
    } catch {}
  }

  // ── PEOPLE ALSO ASK ── Real questions people type into Google about this topic,
  // harvested free from Autocomplete. Fed into the FAQ so the page answers questions
  // buyers actually ask — and those FAQs become FAQPage schema on publish, which is
  // exactly what AI answer engines cite.
  let paa = [];
  if (userId) {
    try {
      const { peopleAlsoAsk } = await import("@/lib/paa");
      const seed = pick?.keyword || topic || (ai.keywordsToOwn && ai.keywordsToOwn[0]) || ai.whatTheySell || "";
      paa = await peopleAlsoAsk(seed);
    } catch {}
  }

  let data = null;
  let provider = null;
  try {
    // Flagship AEO pages are where AI citations are won — quality is the moat, so
    // spend the extra token budget on being the single best answer for those.
    const aeo = !!pick?.aeo;
    const result = await callAI({
      system:
        "You are Genie, an expert SEO content writer. Write genuinely useful, specific content — never generic filler. Match the brand voice given, and follow the owner's standing instructions exactly. Return ONLY valid JSON, no markdown fences.",
      json: true,
      maxTokens: aeo ? 4200 : 3500,
      temperature: 0.7,
      prompt: buildPrompt({ ai, gsc, topic, directives, pick, existingLinks, paa }),
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

  // Guarantee the em-dash "AI tell" is gone, whatever the model actually did.
  if (data.article) {
    data.article.body = deDash(data.article.body); data.article.title = deDash(data.article.title); data.article.metaDescription = deDash(data.article.metaDescription);
    if (Array.isArray(data.article.faq)) data.article.faq = data.article.faq.filter((f) => f && f.q && f.a).slice(0, 6).map((f) => ({ q: deDash(String(f.q)), a: deDash(String(f.a)) }));
  }
  if (data.social) {
    const cleanArr = (a) => (Array.isArray(a) ? a.map(deDash) : a);
    data.social.twitter = cleanArr(data.social.twitter);
    data.social.instagram = cleanArr(data.social.instagram);
    data.social.facebook = cleanArr(data.social.facebook);
    data.social.linkedin = deDash(data.social.linkedin);
    data.social.reddit = deDash(data.social.reddit);
    data.social.quora = deDash(data.social.quora);
  }

  // Persist everything Genie generated as PROPOSED actions (the autopilot spine).
  // Ephemeral no more — these are ready for approval + auto-publish (F2/F3).
  let actionIds = [];
  try {
    if (userId) {
      // The keyword this whole batch targets (real portfolio pick, else the AI's own).
      const primaryKw = pick?.keyword || data.article?.targetKeyword || null;
      if (data.article && pick) { data.article.targetKeyword = pick.keyword; data.article.relatedKeywords = pick.related; }

      // ── ON-BRAND IMAGERY ── Attach a REAL image at draft time, from the business's
      // own site first (the authentic, competitive option), then free stock matched
      // to the topic. This means the post ships with a visual AND the Approvals
      // preview shows exactly what publishes. Best-effort — text-only if none found.
      let heroPick = null, socialImage = null, pinData = null, carouselData = null;
      try {
        heroPick = await pickPostImage({ topic: data.article?.title || primaryKw || topic || "", siteUrl: host });
        if (heroPick && data.article) {
          data.article.heroImage = data.article.heroImage || heroPick.url; // article hero = the raw photo
          data.article.heroImageAlt = data.article.heroImageAlt || heroPick.alt;
          data.article.imageSource = heroPick.source;
          data.article.imageCredit = heroPick.credit;
        }
        // Social posts get a DESIGNED branded card: the photo + a hook + the
        // business's name/handle/colour, composed by /api/card (Satori).
        if (heroPick) {
          const appOrigin = (() => { try { return new URL(request.url).origin; } catch { return process.env.NEXT_PUBLIC_APP_URL || ""; } })();
          const bizName = ai.businessName || String(host || "").replace(/^www\./, "").replace(/\..*$/, "");
          const handle = "@" + String(bizName || "brand").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20);
          const headline = data.cardHeadline || data.article?.title || primaryKw || "";
          if (appOrigin) {
            const u = new URL("/api/card", appOrigin);
            u.searchParams.set("img", heroPick.url);
            u.searchParams.set("title", headline);
            u.searchParams.set("name", bizName || "");
            u.searchParams.set("handle", handle);
            if (ai.brandColor) u.searchParams.set("brand", ai.brandColor);
            u.searchParams.set("ratio", "square");
            socialImage = u.href;

            // Pinterest pin: a vertical (2:3) branded card + keyword-rich title and
            // description, linking back to the business. Evergreen visual-search reach.
            const pin = new URL("/api/card", appOrigin);
            pin.searchParams.set("img", heroPick.url);
            pin.searchParams.set("title", headline);
            pin.searchParams.set("name", bizName || "");
            pin.searchParams.set("handle", handle);
            if (ai.brandColor) pin.searchParams.set("brand", ai.brandColor);
            pin.searchParams.set("ratio", "tall");
            const camelKw = String(primaryKw || "").replace(/[^a-z0-9]+/gi, "");
            const pinDesc = `${data.article?.metaDescription || headline}${camelKw ? ` #${camelKw}` : ""}`.slice(0, 480);
            const bizUrl = ai.businessUrl || ai.url || (host ? `https://${host}` : "");
            pinData = { image: pin.href, title: data.article?.title || headline, desc: pinDesc, dest: bizUrl };

            // Instagram/LinkedIn CAROUSEL — a photo cover + text slides teaching the
            // key points. The highest-engagement social format, same card composer.
            const slides = Array.isArray(data.carousel) ? data.carousel.filter((s) => s && s.heading).slice(0, 4) : [];
            if (slides.length >= 2) {
              const mk = (extra) => { const c = new URL("/api/card", appOrigin); c.searchParams.set("name", bizName || ""); c.searchParams.set("handle", handle); if (ai.brandColor) c.searchParams.set("brand", ai.brandColor); c.searchParams.set("ratio", "square"); for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") c.searchParams.set(k, String(v)); return c.href; };
              const total = slides.length + 1;
              const cover = mk({ img: heroPick.url, title: data.cardHeadline || data.article?.title || headline });
              const slideUrls = slides.map((s, i) => mk({ title: s.heading, body: s.text || "", index: i + 2, total }));
              carouselData = { images: [cover, ...slideUrls], caption: `${data.article?.metaDescription || headline}` };
            }
          }
        }
      } catch {}

      const rows = [];
      // Validate AI priorities; reject unknowns → 'medium'.
      const VALID = new Set(["high", "quick_win", "strategic", "low", "medium"]);
      const validate = (p) => (VALID.has(p) ? p : "medium");
      const articlePriority = validate(data.articlePriority);
      const socialPriority = validate(data.socialPriority);
      // Google Business Profile posts only matter for local businesses (map pack /
      // "near me"). Gate on the entity's local importance so we don't spam online-only
      // businesses with a channel they don't have.
      const isLocal = ((classifyEntity(ai)?.dims?.localImportance) || 0) >= 0.6;

      if (data.article) {
        rows.push({
          user_id: userId,
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
          user_id: userId,
          scan_id: scanId || null,
          type: "social_post",
          title: `${platform} post`,
          payload: { platform, text, targetKeyword: primaryKw, image: socialImage || heroPick?.url || null, imageRaw: heroPick?.url || null, imageAlt: heroPick?.alt || null, imageSource: heroPick?.source || null, imageCredit: heroPick?.credit || null, branded: !!socialImage },
          target: { platform: platform.toLowerCase(), host: host || null },
          priority: socialPriority,
          status: "proposed",
        });
      (social.twitter || []).forEach((t) => pushSocial("Twitter/X", t));
      if (social.linkedin) pushSocial("LinkedIn", social.linkedin);
      if (social.reddit) pushSocial("Reddit", social.reddit);
      if (social.quora) pushSocial("Quora", social.quora);
      (social.instagram || []).forEach((t) => pushSocial("Instagram", t));
      (social.facebook || []).forEach((t) => pushSocial("Facebook", t));
      if (pinData) rows.push({
        user_id: userId, scan_id: scanId || null, type: "social_post", title: "Pinterest pin",
        payload: { platform: "pinterest", text: pinData.desc, pinTitle: pinData.title, targetKeyword: primaryKw, image: pinData.image, imageRaw: heroPick?.url || null, imageSource: heroPick?.source || null, imageCredit: heroPick?.credit || null, branded: true, dest: pinData.dest },
        target: { platform: "pinterest", host: host || null }, priority: socialPriority, status: "proposed",
      });
      if (carouselData) rows.push({
        user_id: userId, scan_id: scanId || null, type: "social_post", title: "Instagram carousel",
        payload: { platform: "instagram", carousel: true, text: carouselData.caption, targetKeyword: primaryKw, images: carouselData.images, image: carouselData.images[0], imageRaw: heroPick?.url || null, imageSource: heroPick?.source || null, branded: true },
        target: { platform: "instagram", host: host || null }, priority: socialPriority, status: "proposed",
      });
      if (isLocal && data.gbpPost) rows.push({
        user_id: userId, scan_id: scanId || null, type: "social_post", title: "Google Business post",
        payload: { platform: "gbp", text: deDash(data.gbpPost), targetKeyword: primaryKw, image: socialImage || heroPick?.url || null, imageRaw: heroPick?.url || null, imageSource: heroPick?.source || null, branded: !!socialImage, dest: (ai.businessUrl || ai.url || (host ? `https://${host}` : "")) },
        target: { platform: "gbp", host: host || null }, priority: socialPriority, status: "proposed",
      });
      // Review request — a reusable "ask a happy customer for a Google review" template
      // (local only). Don't stack: only add one if none is already waiting in Approvals.
      if (isLocal && data.reviewRequest) {
        let hasPending = false;
        try { const { data: ex } = await supabase.from("actions").select("id").eq("user_id", userId).eq("status", "proposed").contains("payload", { platform: "review_request" }).limit(1); hasPending = !!ex?.length; } catch {}
        if (!hasPending) rows.push({
          user_id: userId, scan_id: scanId || null, type: "social_post", title: "Review request",
          payload: { platform: "review_request", text: deDash(data.reviewRequest), targetKeyword: primaryKw },
          target: { platform: "review_request", host: host || null }, priority: "quick_win", status: "proposed",
        });
      }

      if (rows.length) {
        // Persist with the service role (same as the nightly pipeline) so a strict
        // RLS insert policy can never silently drop a user-approved draft — the very
        // bug where "Approve this plan" reported success but nothing reached Approvals.
        // Still strictly this user's rows (every row carries user_id: userId).
        const admin = createAdminClient();
        const { data: inserted, error: insErr } = await admin.from("actions").insert(rows).select("id, type");
        if (insErr) throw insErr; // surface via saved:0 + honest message below
        actionIds = (inserted || []).map((r) => r.id);

        // ── RECORD THE CHAIN ── link the produced pieces back to the keyword they
        // target (and advance its coverage), so the user can see exactly what Genie
        // wrote for each keyword. Best-effort; never blocks returning the content.
        if (primaryKw && host) {
          const artId = (inserted || []).find((r) => r.type === "article")?.id;
          const socId = (inserted || []).find((r) => r.type === "social_post")?.id;
          if (artId) await recordUsage(supabase, userId, host, { primary: primaryKw, related: pick?.related || [], channel: pick?.aeo ? "answer" : "article", refType: "action", refId: artId, title: data.article?.title || "Article", status: "proposed" });
          if (socId) await recordUsage(supabase, userId, host, { primary: primaryKw, related: [], channel: "social", refType: "action", refId: socId, title: "Social posts", status: "proposed" });
        }
      }
    }
  } catch {
    // saving is best-effort; never block returning the content
  }

  // saved = how many drafts actually landed in Approvals. The UI reads this instead
  // of assuming success, so a failed insert is reported honestly, not masked.
  return json({ ok: true, saved: actionIds.length, content: data, actionIds, meta: { engine: provider } });
}

function buildPrompt({ ai, gsc, topic, directives = [], pick = null, existingLinks = [], paa = [] }) {
  const internalLinks = existingLinks.length
    ? `\nINTERNAL LINKS — Genie already published these related articles. Link to 1-3 of them NATURALLY inside the body using markdown to the FULL url, e.g. [natural anchor text](${existingLinks[0].url}), only where it genuinely helps the reader (this builds topical authority):\n${existingLinks.map((l) => `- "${l.title}" → ${l.url}`).join("\n")}`
    : "";
  const paaBlock = paa.length
    ? `\nPEOPLE ALSO ASK — these are REAL questions people search on Google about this topic. Use them (reword only for grammar) as the questions in the article's "faq" array, and answer each concisely, factually and quotably. Prefer these over invented questions — they're what AI answer engines cite:\n${paa.map((q) => `- ${q}`).join("\n")}`
    : "";
  const voice = ai.brandVoice
    ? `Brand voice: ${ai.brandVoice.tone || ""}, ${ai.brandVoice.formality || "balanced"}. ${ai.brandVoice.note || ""}`
    : "Brand voice: clear, warm, professional.";
  const standing = directives.length
    ? `OWNER'S STANDING INSTRUCTIONS — these OVERRIDE everything else, follow them exactly:\n${directives.map((d) => `- ${d}`).join("\n")}\n`
    : "";

  // What this piece targets. If Genie picked from the real portfolio, write FOR that
  // exact keyword, matched to its journey stage (problem/learn/compare/buy) — one
  // focused piece per topic, weaving related terms in naturally (never stuffing).
  let targetBlock;
  if (pick) {
    const kindByStage = {
      problem: "a genuinely helpful how-to / answer article that solves the reader's exact worry, then shows how the business removes it",
      learn: "an informative guide that teaches the topic and naturally introduces the business",
      compare: "a fair comparison / 'best options' article that includes the business as a strong choice",
      buy: "a focused, high-intent piece for a ready-to-buy searcher — clear value, why choose us, a strong call to action",
    };
    const aeoBlock = pick.aeo
      ? `\nAI-SEARCH (AEO) — this is a question AI assistants answer, so structure it to be CITED by ChatGPT, Perplexity, Google AI Overviews and Gemini:
- Open with a direct, quotable 1-2 sentence answer to the question, BEFORE any intro.
- Use clear question-style H2 headings with concise, factual answers under each.
- Include a short comparison or criteria list where relevant, and a real FAQ section (AI engines cite these most).
- Sound authoritative and neutral — factual and specific, not salesy. That's what gets quoted.
- Aim to be the single most useful, complete, quotable answer to this question on the internet — more specific and better-organized than any competitor's page. AI cites the best answer, not the longest.`
      : "";
    targetBlock = `TARGET KEYWORD (primary): "${pick.keyword}" — write the article to rank for this exact search, and set the article "targetKeyword" field to exactly "${pick.keyword}".
Content type: write ${kindByStage[pick.stage] || kindByStage.learn}.
Weave in these related searches NATURALLY where they genuinely fit — do NOT stuff or list them: ${pick.related.length ? pick.related.join(", ") : "(none)"}.${aeoBlock}`;
  } else {
    const kw = gsc?.available
      ? `Keywords they already rank for: ${gsc.topQueries.slice(0, 8).map((q) => q.query).join(", ")}.`
      : ai.keywordsToOwn?.length
      ? `Target keywords: ${ai.keywordsToOwn.slice(0, 6).join(", ")}.`
      : "";
    targetBlock = `${kw}\n${topic ? `Write about this specific topic: "${topic}".` : "Choose a high-value article topic that would attract this business's ideal customers via Google search."}`;
  }

  // What Genie learned by interviewing the owner (onboarding) — the details a
  // homepage can't give, that make the writing specific and on-brand.
  const insight = [
    ai.idealCustomer ? `Best customer to win: ${ai.idealCustomer}.` : "",
    ai.whyChooseYou ? `Why buyers choose them (lead with this): ${ai.whyChooseYou}.` : "",
    ai.painPoints ? `Buyer pain points to speak to: ${ai.painPoints}.` : "",
    ai.keyProducts ? `Products/services to push: ${ai.keyProducts}.` : "",
    ai.proof ? `Proof to weave in naturally: ${ai.proof}.` : "",
    ai.conversionGoal ? `The action to drive: ${ai.conversionGoal}.` : "",
    ai.avoid ? `NEVER say, claim, or promise: ${ai.avoid}.` : "",
    ai.tone ? `Owner's preferred tone: ${ai.tone}.` : "",
  ].filter(Boolean).join("\n");

  return `${standing}Business: ${ai.businessName || "the business"} — ${ai.industry || ""} ${ai.subCategory ? "/ " + ai.subCategory : ""}.
Sells: ${ai.whatTheySell || ""}.
Target customer: ${ai.targetCustomer || ""}.
${insight ? insight + "\n" : ""}${voice}
${targetBlock}${internalLinks}${paaBlock}

REACH THE BUYER WHO DOESN'T KNOW YOU EXIST. Most readers arrive with a PROBLEM, not
knowledge of your product or category. Open with THEIR problem in THEIR words (e.g.
"you found the perfect couch online, but will it actually fit — and look right — in
your room?"), make them feel understood, then bridge naturally to how ${ai.businessName || "the business"}
solves it. Never open by naming your product or technology. Earn the introduction.

WRITE LIKE A SHARP HUMAN, NOT AN AI. This is critical:
- No em-dashes (—). Use commas, periods, or parentheses.
- Ban AI clichés: "in today's fast-paced world", "furthermore", "moreover", "in conclusion", "unlock", "elevate", "seamless", "delve", "leverage", "game-changer", "navigate the landscape".
- Vary sentence length. Use short punchy sentences. Sound like a real person who knows this niche talking to a friend, not a press release.
- Be specific and concrete (real scenarios, numbers, examples), never generic filler.

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
  "cardHeadline": "a punchy 4 to 8 word hook to overlay on the social image (plain text, no hashtags, no quotes, no emoji)",
  "carousel": [{ "heading": "a punchy 3 to 6 word slide heading", "text": "one short supporting sentence, under 18 words" }],
  "gbpPost": "a short Google Business Profile update (2 to 3 sentences, friendly and community-rooted, ending with a soft call to action like 'Book now' or 'Stop by'). Only useful for local businesses.",
  "reviewRequest": "a warm, short message the owner can send to a happy customer asking them to leave a Google review (2 to 3 sentences, grateful and low-pressure, no link — the owner adds theirs). Only useful for local businesses.",
  "article": {
    "title": "click-worthy, SEO-friendly title",
    "targetKeyword": "the main keyword this targets",
    "metaTitle": "SEO meta title (<60 chars)",
    "metaDescription": "compelling meta description (150-160 chars)",
    "slug": "url-friendly-slug",
    "body": "the full article in markdown, 600-900 words, opening with the reader's problem, then bridging to the solution, with ## H2 subheadings, specific useful content, and a short ## FAQ section with 2-3 Q&As. No em-dashes anywhere.",
    "wordCount": approximate integer,
    "imagePrompt": "a vivid, specific prompt to generate a photorealistic hero image for this article (describe the scene, style, and mood — no text in the image)",
    "heroImageAlt": "descriptive alt text for the hero image",
    "faq": [{ "q": "a real question a buyer asks about this topic", "a": "a concise, quotable 1-3 sentence answer" }]
  },
  "social": {
    "twitter": ["3 different tweet-length posts promoting the article, each with 1-2 relevant hashtags"],
    "linkedin": "1 professional LinkedIn post version",
    "instagram": ["2 visual-first Instagram captions with hashtags"],
    "facebook": ["2 community-friendly Facebook posts"],
    "reddit": "1 genuinely helpful, value-first Reddit self-post a knowledgeable human would write — no marketing voice, no 'check out', mention the product ONLY if it truly helps. Start with a suggested subreddit in brackets, e.g. [r/subreddit], then the post.",
    "quora": "1 long-form, genuinely useful Quora answer to a real question buyers ask in this space — value first, product mentioned only where it truly helps, never as a pitch."
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
