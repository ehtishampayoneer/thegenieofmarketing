// lib/spread.js
// ── ONE ARTICLE, MANY PLACES ──
// Genie publishes each approved article to a hosted Genie page. That page is real
// and public, but it sits on GENIE's domain, so Google credits Genie's domain, not
// the owner's. Publishing to the same one place every night is therefore not an
// SEO strategy, and saying otherwise would be a lie.
//
// What actually moves an owner's own search position:
//   1. The article ON THEIR OWN DOMAIN. Automatic for WordPress; for every other
//      site Genie hands over clean HTML to paste, then tracks the URL they give
//      back so links, CTAs and indexing point at the real page.
//   2. Links FROM other people's sites — Get featured, a separate engine.
//   3. Being present where buyers and AI assistants read: Medium, LinkedIn,
//      Dev.to, Reddit, Quora. This is REACH and citations, not authority: every
//      republish carries a canonical link back, which tells Google the original
//      is the owner's, and stops the copy competing with it.
//
// This file prepares (3) and (1): per-channel drafts the owner pastes, with the
// honest label for what each one does. Nothing here posts anything.

export const CHANNELS = [
  {
    id: "own_site", label: "Your own website", kind: "own",
    effect: "The only version that builds YOUR site's ranking. Everything else points at it.",
    how: "Paste it into your site's blog. Then give Genie the URL so it can link to it, point your calls to action at it, and ask Google to crawl it.",
  },
  {
    id: "medium", label: "Medium", kind: "republish", url: "https://medium.com/new-story",
    effect: "Reach and AI citations. The canonical tag keeps the original yours.",
    how: "Paste, then Story settings → Advanced → add the canonical link Genie gives you.",
  },
  {
    id: "linkedin", label: "LinkedIn article", kind: "republish", url: "https://www.linkedin.com/article/new/",
    effect: "Reach among business buyers, and your own network sees it.",
    how: "Paste, publish, and add the link to the original at the end.",
  },
  {
    id: "devto", label: "Dev.to", kind: "republish", url: "https://dev.to/new",
    effect: "Reach in technical audiences. Only worth it when the topic is technical.",
    how: "Paste, then set canonical_url in the post settings to the original.",
  },
  {
    id: "reddit", label: "Reddit", kind: "community",
    effect: "Buyers ask here. A genuinely useful comment gets read; an advert gets removed.",
    how: "Post it as a helpful answer in a subreddit where the question is live, not as a link drop.",
  },
  {
    id: "quora", label: "Quora", kind: "community",
    effect: "Answers keep earning views for years and are quoted by AI assistants.",
    how: "Answer a real question with the substance of the article, link only if it helps.",
  },
];

export const CHANNEL_INDEX = Object.fromEntries(CHANNELS.map((c) => [c.id, c]));

/** Prompt for the per-channel drafts. One call produces the whole pack. */
export function spreadPrompt({ article, ai, canonical, ownUrl, plan = "" }) {
  const target = ownUrl || canonical;
  return `ARTICLE
Title: ${article.title}
${article.body ? `Body:\n"""\n${String(article.body).slice(0, 6000)}\n"""` : ""}

BUSINESS: ${ai?.businessName || ""} — ${ai?.whatTheySell || ""}${ai?.targetCustomer ? `. Customers: ${ai.targetCustomer}` : ""}.
${plan}
LINK TO THE ORIGINAL: ${target}

Write one version for each channel. Never invent facts that are not in the article.

- medium: the full article rewritten for Medium readers. A strong first line, short paragraphs, subheads. 500-900 words. End with one line linking to the original.
- linkedin: a LinkedIn article for business readers. 400-700 words, plain and concrete, no hashtags in the body, ends with one question to the reader.
- devto: the same article for a technical audience. Practical, specific, code or steps where the article has them. Skip it (empty string) if the topic is not technical.
- reddit: a genuinely helpful comment-style post that answers the question the article answers. No marketing voice, no link in the first half, 120-250 words. Mention the business only if it is the honest answer.
- quora: an answer to the question this article answers, written to be useful on its own. 200-350 words.

Return ONLY:
{"medium":{"title":"","body":""},"linkedin":{"title":"","body":""},"devto":{"title":"","body":""},"reddit":{"title":"","body":""},"quora":{"title":"","body":""}}`;
}

/** Keep only channels that came back with real text, and tag each honestly. */
export function normalizePack(json = {}) {
  const out = [];
  for (const c of CHANNELS) {
    if (c.kind === "own") continue;
    const v = json?.[c.id];
    const body = String(v?.body || "").trim();
    if (body.length < 80) continue;
    out.push({ id: c.id, label: c.label, kind: c.kind, title: String(v?.title || "").trim(), body, effect: c.effect, how: c.how, url: c.url || null });
  }
  return out;
}
