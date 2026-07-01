// lib/audit.js
// The 360° Audit Engine — Phase A: 42 on-page checks + 4 speed checks.
// Fetches the live page (plus robots.txt & sitemap.xml), parses it, runs
// verified + heuristic checks, computes weighted scores. No accounts needed.

import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (compatible; MarketingGenieBot/1.0; +https://marketinggenie.app)";

export function normalizeUrl(raw) {
  let u = String(raw || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    return new URL(u).href;
  } catch {
    return "";
  }
}

export async function runAudit(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, reason: "bad_url", url: rawUrl };

  let res, html, finalUrl, status;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    status = res.status;
    finalUrl = res.url || url;
    html = await res.text();
  } catch (e) {
    return {
      ok: false,
      reason: e.name === "AbortError" ? "timeout" : "fetch_failed",
      url,
      detail: e.message,
    };
  }

  if (!res.ok || !html) {
    return { ok: false, reason: "bad_status", url, finalUrl, status };
  }

  // Two extra lightweight fetches for real SEO signals.
  const site = await fetchSiteFiles(finalUrl);

  const $ = cheerio.load(html);
  const signals = extractSignals($, finalUrl, html, site);
  const checks = runChecks(signals);
  const scores = computeScores(checks);
  const pageText = extractText($).slice(0, 3000);

  return { ok: true, url, finalUrl, status, signals, checks, scores, pageText };
}

async function fetchSiteFiles(finalUrl) {
  let origin;
  try {
    origin = new URL(finalUrl).origin;
  } catch {
    return { hasRobots: false, hasSitemap: false, robotsBlocksAll: false };
  }
  const grab = async (path) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(origin + path, {
        headers: { "User-Agent": UA },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      return r.ok ? await r.text() : null;
    } catch {
      return null;
    }
  };
  const [robots, sitemap] = await Promise.all([
    grab("/robots.txt"),
    grab("/sitemap.xml"),
  ]);
  const robotsBlocksAll =
    !!robots && /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\n|$)/i.test(robots);
  const sitemapInRobots = !!robots && /sitemap:\s*http/i.test(robots);
  return {
    hasRobots: !!robots,
    hasSitemap: (!!sitemap && /<urlset|<sitemapindex/i.test(sitemap)) || sitemapInRobots,
    robotsBlocksAll,
  };
}

// ---------------------------------------------------------------------------
// SIGNAL EXTRACTION
// ---------------------------------------------------------------------------
function extractSignals($, finalUrl, html, site) {
  const lower = html.toLowerCase();
  const host = safeHost(finalUrl);

  const title = ($("title").first().text() || "").trim();
  const metaDesc = ($('meta[name="description"]').attr("content") || "").trim();
  const h1s = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2count = $("h2").length;
  const h3count = $("h3").length;

  const images = $("img");
  const imgTotal = images.length;
  let imgWithAlt = 0;
  images.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt && alt.trim().length > 0) imgWithAlt++;
  });

  const links = $("a[href]").map((_, el) => $(el).attr("href")).get();
  const linkText = $("a").map((_, el) => $(el).text().toLowerCase()).get().join(" ");
  const hasLinkLike = (kw) =>
    links.some((h) => (h || "").toLowerCase().includes(kw)) || linkText.includes(kw);

  const internalLinks = links.filter(
    (h) => h && (h.startsWith("/") || h.includes(host))
  ).length;
  const externalLinks = links.length - internalLinks;

  const socialDomains = [
    "facebook.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "youtube.com", "tiktok.com", "pinterest.com",
  ];
  const platformsLinked = new Set(
    socialDomains.filter((d) => links.some((h) => (h || "").toLowerCase().includes(d)))
  );

  // clean body text (for word count / readability) without mutating $
  const bodyText = $("body").clone().find("script,style,noscript").remove().end()
    .text().replace(/\s+/g, " ").trim();
  const words = bodyText ? bodyText.split(/\s+/) : [];
  const wordCount = words.length;
  const sentences = bodyText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgWordsPerSentence = sentences.length
    ? Math.round(wordCount / sentences.length)
    : 0;

  // JSON-LD types
  const ldTypes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).text());
      const arr = Array.isArray(j) ? j : [j];
      arr.forEach((o) => o && o["@type"] && ldTypes.push(String(o["@type"]).toLowerCase()));
    } catch {}
  });
  const ldHas = (t) => ldTypes.some((x) => x.includes(t));

  const ctaWords = ["buy", "shop", "get started", "sign up", "subscribe",
    "book now", "add to cart", "contact us", "order", "start free", "try free"];

  return {
    host,
    isHttps: finalUrl.startsWith("https://"),

    // SEO
    title, titleLen: title.length,
    metaDesc, metaDescLen: metaDesc.length,
    h1Count: h1s.length, h1Text: h1s[0] || "",
    h2count, h3count,
    imgTotal, imgWithAlt,
    imgAltPct: imgTotal ? Math.round((imgWithAlt / imgTotal) * 100) : 100,
    canonical: $('link[rel="canonical"]').attr("href") || "",
    jsonLd: ldTypes.length > 0,
    noindex: /noindex/i.test($('meta[name="robots"]').attr("content") || ""),
    titleH1Overlap: overlap(title, h1s[0] || ""),
    hasSitemap: site.hasSitemap,
    hasRobots: site.hasRobots,
    robotsBlocksAll: site.robotsBlocksAll,

    // Trust
    hasContact: links.some((h) => /^mailto:|^tel:/i.test(h || "")) || hasLinkLike("contact"),
    hasPhone: links.some((h) => /^tel:/i.test(h || "")) || /(\+?\d[\d\s().-]{7,}\d)/.test(bodyText),
    hasEmail: links.some((h) => /^mailto:/i.test(h || "")) || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(bodyText),
    hasAddress: $("address").length > 0 || /\b\d{1,5}\s+\w+\s+(street|st|road|rd|avenue|ave|lane|ln|blvd|boulevard)\b/i.test(bodyText),
    hasAbout: hasLinkLike("about"),
    hasTerms: hasLinkLike("terms") || /terms (of service|and conditions|& conditions)/i.test(lower),
    hasPrivacy: /privacy[\s-]?policy/i.test(lower) || hasLinkLike("privacy"),
    hasReviews: ldHas("aggregaterating") || ldHas("review") || /testimonial|customer review|what our (customers|clients)/i.test(lower),
    favicon: !!$('link[rel*="icon"]').attr("href") || lower.includes("favicon"),

    // Content
    wordCount,
    hasBlog: hasLinkLike("/blog") || hasLinkLike("blog") || hasLinkLike("news") || hasLinkLike("article"),
    hasFaq: ldHas("faqpage") || /frequently asked|(^|\s)faq(s)?(\s|$)/i.test(lower),
    hasCta: ctaWords.some((w) => lower.includes(w)),
    hasEmailCapture: $('input[type="email"]').length > 0 ||
      $('form').filter((_, f) => /email|subscribe|newsletter/i.test($(f).text() + ($(f).attr("action") || ""))).length > 0,
    hasFreshness: !!$('meta[property="article:published_time"]').attr("content") ||
      $("time").length > 0 || new RegExp(`\\b(202[4-9])\\b`).test(bodyText),
    avgWordsPerSentence,
    meaningfulImages: imgTotal >= 3,

    // Technical
    viewport: !!$('meta[name="viewport"]').attr("content"),
    hasAnalytics: lower.includes("googletagmanager.com") || lower.includes("gtag(") ||
      lower.includes("google-analytics.com") || lower.includes("ga('create"),
    lang: $("html").attr("lang") || "",
    hasCharset: !!$("meta[charset]").attr("charset") ||
      /charset=/i.test($('meta[http-equiv="Content-Type"]').attr("content") || ""),
    hasDoctype: /^\s*<!doctype html/i.test(html),
    hasMetaPixel: lower.includes("connect.facebook.net") || lower.includes("fbq("),
    hasCookieConsent: /cookiebot|onetrust|cookieyes|cookie-consent|cookieconsent/i.test(lower) ||
      /(accept|manage).{0,20}cookies?/i.test(lower),
    hasChat: /intercom|drift\.com|tawk\.to|crisp\.chat|zendesk|livechat|tidio|messenger|whatsapp/i.test(lower),

    // Social
    ogTitle: !!$('meta[property="og:title"]').attr("content"),
    ogImage: !!$('meta[property="og:image"]').attr("content"),
    twitterCard: !!$('meta[name="twitter:card"]').attr("content"),
    socialLinkCount: platformsLinked.size,
    socialProof: /trustpilot|elfsight|instagram-media|fb-post|twitter-tweet|reviews\.io|yotpo|judge\.me/i.test(lower),

    internalLinks,
    externalLinks,
  };
}

function extractText($) {
  $("script, style, noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// CHECKS — 42 on-page. Shape: {id,label,layer,status,impact,detail}
// (Task 2 will add difficulty/time/confidence/impact% fields.)
// ---------------------------------------------------------------------------
function runChecks(s) {
  const c = [];
  const add = (id, label, layer, status, impact, detail) =>
    c.push({ id, label, layer, status, impact, detail });

  // ---- SEO (11) ----
  add("title", "Page title", "seo",
    s.title ? (s.titleLen >= 30 && s.titleLen <= 65 ? "pass" : "warn") : "fail", "high",
    s.title ? `Title is ${s.titleLen} characters. Ideal is 30–65.`
      : "No page title found. Google shows this as your headline in results.");

  add("title-h1", "Title matches main heading", "seo",
    s.title && s.h1Text ? (s.titleH1Overlap ? "pass" : "warn") : "warn", "low",
    !s.h1Text ? "No H1 to compare the title against."
      : s.titleH1Overlap ? "Your title and main heading share key words — consistent signal to Google."
      : "Your page title and H1 don't share key words. Aligning them strengthens ranking signals.");

  add("meta-desc", "Meta description", "seo",
    s.metaDesc ? (s.metaDescLen >= 70 && s.metaDescLen <= 160 ? "pass" : "warn") : "fail", "medium",
    s.metaDesc ? `Description is ${s.metaDescLen} characters. Ideal is 70–160.`
      : "No meta description. Google writes its own, often badly.");

  add("h1", "Main heading (H1)", "seo",
    s.h1Count === 1 ? "pass" : s.h1Count === 0 ? "fail" : "warn", "medium",
    s.h1Count === 1 ? `One clear H1: “${truncate(s.h1Text, 60)}”`
      : s.h1Count === 0 ? "No H1 heading. Pages need one clear main heading."
      : `${s.h1Count} H1 headings found. There should be exactly one.`);

  add("headings", "Heading structure", "seo",
    s.h2count >= 1 ? "pass" : "warn", "low",
    `${s.h2count} H2 and ${s.h3count} H3 subheadings.`);

  add("alt-text", "Image alt text", "seo",
    s.imgTotal === 0 ? "warn" : s.imgAltPct >= 80 ? "pass" : "fail", "medium",
    s.imgTotal === 0 ? "No images detected on the page."
      : `${s.imgAltPct}% of ${s.imgTotal} images have alt text (target 80%+).`);

  add("canonical", "Canonical tag", "seo",
    s.canonical ? "pass" : "warn", "low",
    s.canonical ? "Canonical URL is set." : "No canonical tag — can cause duplicate-content confusion.");

  add("indexable", "Indexable by Google", "seo",
    s.noindex || s.robotsBlocksAll ? "fail" : "pass", "high",
    s.noindex ? "Page is set to NOINDEX — Google is told to hide it!"
      : s.robotsBlocksAll ? "robots.txt blocks all crawlers — Google can't index this site!"
      : "Page allows Google indexing.");

  add("schema", "Structured data", "seo",
    s.jsonLd ? "pass" : "warn", "low",
    s.jsonLd ? "Schema markup found." : "No schema markup — limits rich results in Google.");

  add("sitemap", "Sitemap", "seo",
    s.hasSitemap ? "pass" : "warn", "medium",
    s.hasSitemap ? "Sitemap found — helps Google discover all your pages."
      : "No sitemap.xml found. It helps Google find every page on your site.");

  add("robots", "Robots.txt", "seo",
    s.hasRobots ? (s.robotsBlocksAll ? "fail" : "pass") : "warn", "low",
    !s.hasRobots ? "No robots.txt found. Recommended for guiding search engines."
      : s.robotsBlocksAll ? "robots.txt is blocking all crawlers!"
      : "robots.txt present and not blocking crawlers.");

  // ---- TRUST (10) ----
  add("https", "Secure (HTTPS)", "trust",
    s.isHttps ? "pass" : "fail", "high",
    s.isHttps ? "Site is served securely over HTTPS." : "Not secure! Browsers warn visitors away from HTTP sites.");

  add("contact", "Contact method", "trust",
    s.hasContact ? "pass" : "warn", "medium",
    s.hasContact ? "A contact method is present." : "No obvious contact link or details.");

  add("phone", "Phone number visible", "trust",
    s.hasPhone ? "pass" : "warn", "low",
    s.hasPhone ? "Phone number detected." : "No phone number found — some customers want to call.");

  add("email", "Email address", "trust",
    s.hasEmail ? "pass" : "warn", "low",
    s.hasEmail ? "Email contact detected." : "No email address found on the page.");

  add("address", "Physical address", "trust",
    s.hasAddress ? "pass" : "warn", "low",
    s.hasAddress ? "A physical address appears present." : "No physical address detected (fine for online-only, builds trust for local).");

  add("about", "About page", "trust",
    s.hasAbout ? "pass" : "warn", "low",
    s.hasAbout ? "About page link found." : "No About page link — it builds credibility with new visitors.");

  add("privacy", "Privacy policy", "trust",
    s.hasPrivacy ? "pass" : "warn", "medium",
    s.hasPrivacy ? "Privacy policy link found." : "No privacy policy link found (often legally required).");

  add("terms", "Terms of service", "trust",
    s.hasTerms ? "pass" : "warn", "low",
    s.hasTerms ? "Terms of service link found." : "No terms of service link found.");

  add("reviews", "Reviews / testimonials", "trust",
    s.hasReviews ? "pass" : "warn", "medium",
    s.hasReviews ? "Reviews or testimonials detected — strong trust signal."
      : "No reviews or testimonials detected. Social proof lifts conversions.");

  add("favicon", "Favicon", "trust",
    s.favicon ? "pass" : "warn", "low",
    s.favicon ? "Favicon present." : "No favicon — looks unfinished in browser tabs.");

  // ---- CONTENT (8) ----
  add("word-count", "Content depth", "content",
    s.wordCount >= 300 ? "pass" : s.wordCount >= 100 ? "warn" : "fail", "medium",
    `About ${s.wordCount} words on the page. Thin pages (under 300) struggle to rank.`);

  add("blog", "Blog / fresh content", "content",
    s.hasBlog ? "pass" : "warn", "medium",
    s.hasBlog ? "A blog or articles section was found."
      : "No blog found. Regular articles are a top driver of search traffic.");

  add("faq", "FAQ section", "content",
    s.hasFaq ? "pass" : "warn", "low",
    s.hasFaq ? "FAQ content detected — can win featured snippets."
      : "No FAQ detected. FAQs answer buyer questions and win Google snippets.");

  add("cta", "Clear call-to-action", "content",
    s.hasCta ? "pass" : "warn", "high",
    s.hasCta ? "A clear call-to-action was found."
      : "No obvious call-to-action. Visitors need an obvious next step (Buy, Book, Contact).");

  add("email-capture", "Email capture", "content",
    s.hasEmailCapture ? "pass" : "warn", "medium",
    s.hasEmailCapture ? "An email sign-up form was found."
      : "No email capture. Collecting emails lets you bring visitors back.");

  add("freshness", "Content freshness", "content",
    s.hasFreshness ? "pass" : "warn", "low",
    s.hasFreshness ? "Recent dates/content detected." : "No recent dates found — content may look stale.");

  add("readability", "Readability", "content",
    s.avgWordsPerSentence === 0 ? "warn" : s.avgWordsPerSentence <= 22 ? "pass" : "warn", "low",
    s.avgWordsPerSentence === 0 ? "Not enough text to judge readability."
      : `Average sentence length is ${s.avgWordsPerSentence} words. Under 22 reads easily.`);

  add("images-present", "Visual content", "content",
    s.meaningfulImages ? "pass" : "warn", "low",
    s.meaningfulImages ? `${s.imgTotal} images present.` : "Few or no images — visuals keep visitors engaged.");

  // ---- TECHNICAL (8) ----
  add("viewport", "Mobile-friendly setup", "technical",
    s.viewport ? "pass" : "fail", "high",
    s.viewport ? "Mobile viewport tag present." : "No viewport tag — page won't size correctly on phones.");

  add("analytics", "Visitor tracking", "technical",
    s.hasAnalytics ? "pass" : "warn", "medium",
    s.hasAnalytics ? "Analytics detected." : "No analytics found — you're flying blind on visitors.");

  add("lang", "Language set", "technical",
    s.lang ? "pass" : "warn", "low",
    s.lang ? `Language set to “${s.lang}”.` : "No html lang attribute set.");

  add("charset", "Character encoding", "technical",
    s.hasCharset ? "pass" : "warn", "low",
    s.hasCharset ? "Character encoding declared." : "No charset declared — can garble special characters.");

  add("doctype", "Valid doctype", "technical",
    s.hasDoctype ? "pass" : "warn", "low",
    s.hasDoctype ? "Standards-mode doctype present." : "Missing <!doctype html> — can trigger quirks mode.");

  add("pixel", "Ad pixel", "technical",
    s.hasMetaPixel ? "pass" : "warn", "low",
    s.hasMetaPixel ? "Meta/Facebook pixel detected." : "No ad pixel found (needed if you plan to run ads).");

  add("cookie-consent", "Cookie consent", "technical",
    s.hasCookieConsent ? "pass" : "warn", "low",
    s.hasCookieConsent ? "Cookie consent mechanism detected."
      : "No cookie consent banner found (may be required under GDPR).");

  add("chat", "Live chat / support", "technical",
    s.hasChat ? "pass" : "warn", "low",
    s.hasChat ? "A chat or support widget was found." : "No live chat detected — it can lift conversions.");

  // ---- SOCIAL (5) ----
  add("og-tags", "Social share preview", "social",
    s.ogTitle && s.ogImage ? "pass" : "warn", "medium",
    s.ogTitle && s.ogImage ? "Open Graph title and image set — links preview nicely."
      : "Missing Open Graph tags — shared links look bare.");

  add("twitter-card", "Twitter/X card", "social",
    s.twitterCard ? "pass" : "warn", "low",
    s.twitterCard ? "Twitter card tags present." : "No Twitter card tags — links on X look plain.");

  add("social-links", "Social profiles linked", "social",
    s.socialLinkCount >= 1 ? "pass" : "warn", "low",
    s.socialLinkCount >= 1 ? `${s.socialLinkCount} social profile link(s) found.`
      : "No links to social profiles found.");

  add("social-reach", "Social platform coverage", "social",
    s.socialLinkCount >= 2 ? "pass" : "warn", "low",
    s.socialLinkCount >= 2 ? `Present on ${s.socialLinkCount} platforms.`
      : "Linked on 0–1 platforms. Being on 2–3 widens reach.");

  add("social-proof", "Social proof on page", "social",
    s.socialProof ? "pass" : "warn", "low",
    s.socialProof ? "An embedded review/social widget was found."
      : "No embedded social proof widget (reviews, feed) detected.");

  return attachIssueMeta(c);
}

// ---------------------------------------------------------------------------
// PER-ISSUE METADATA (Task 2) — difficulty, time-to-fix, confidence, impact %.
// All rules-based & deterministic. Confidence reflects DETECTION method:
//   verified = we read it directly · probable = reliable signal · inferred = heuristic.
// Impact % is a tier-derived ESTIMATE range, shown only for non-passing issues.
// ---------------------------------------------------------------------------
const CONFIDENCE = { verified: 98, probable: 88, inferred: 72 };
const IMPACT_EST = {
  high: { fail: "+8–15%", warn: "+4–8%" },
  medium: { fail: "+4–8%", warn: "+2–4%" },
  low: { fail: "+1–3%", warn: "+1–2%" },
};
const CHECK_META = {
  // SEO
  title: { d: "Easy", t: "~10 min", m: "verified" },
  "title-h1": { d: "Easy", t: "~10 min", m: "verified" },
  "meta-desc": { d: "Easy", t: "~10 min", m: "verified" },
  h1: { d: "Easy", t: "~5 min", m: "verified" },
  headings: { d: "Medium", t: "~30 min", m: "verified" },
  "alt-text": { d: "Easy", t: "~20 min", m: "verified" },
  canonical: { d: "Easy", t: "~10 min", m: "verified" },
  indexable: { d: "Easy", t: "~5 min", m: "verified" },
  schema: { d: "Medium", t: "~45 min", m: "verified" },
  sitemap: { d: "Medium", t: "~20 min", m: "probable" },
  robots: { d: "Easy", t: "~10 min", m: "probable" },
  // Trust
  https: { d: "Medium", t: "~30 min", m: "verified" },
  contact: { d: "Easy", t: "~15 min", m: "probable" },
  phone: { d: "Easy", t: "~5 min", m: "probable" },
  email: { d: "Easy", t: "~5 min", m: "probable" },
  address: { d: "Easy", t: "~5 min", m: "inferred" },
  about: { d: "Medium", t: "~1 hr", m: "inferred" },
  privacy: { d: "Easy", t: "~15 min", m: "probable" },
  terms: { d: "Easy", t: "~15 min", m: "inferred" },
  reviews: { d: "Medium", t: "Ongoing", m: "inferred" },
  favicon: { d: "Easy", t: "~10 min", m: "verified" },
  // Content
  "word-count": { d: "Medium", t: "~1 hr", m: "verified" },
  blog: { d: "Hard", t: "Ongoing", m: "probable" },
  faq: { d: "Medium", t: "~1 hr", m: "inferred" },
  cta: { d: "Easy", t: "~15 min", m: "inferred" },
  "email-capture": { d: "Medium", t: "~30 min", m: "probable" },
  freshness: { d: "Easy", t: "Ongoing", m: "inferred" },
  readability: { d: "Medium", t: "~30 min", m: "inferred" },
  "images-present": { d: "Easy", t: "~30 min", m: "verified" },
  // Technical
  viewport: { d: "Easy", t: "~5 min", m: "verified" },
  analytics: { d: "Easy", t: "~15 min", m: "verified" },
  lang: { d: "Easy", t: "~5 min", m: "verified" },
  charset: { d: "Easy", t: "~5 min", m: "verified" },
  doctype: { d: "Easy", t: "~5 min", m: "verified" },
  pixel: { d: "Easy", t: "~15 min", m: "verified" },
  "cookie-consent": { d: "Medium", t: "~30 min", m: "inferred" },
  chat: { d: "Medium", t: "~30 min", m: "inferred" },
  // Social
  "og-tags": { d: "Easy", t: "~15 min", m: "verified" },
  "twitter-card": { d: "Easy", t: "~10 min", m: "verified" },
  "social-links": { d: "Easy", t: "~10 min", m: "probable" },
  "social-reach": { d: "Medium", t: "Ongoing", m: "probable" },
  "social-proof": { d: "Medium", t: "~45 min", m: "inferred" },
  // Speed
  "perf-score": { d: "Hard", t: "Hours", m: "verified" },
  lcp: { d: "Hard", t: "Hours", m: "verified" },
  cls: { d: "Medium", t: "~1 hr", m: "verified" },
  tbt: { d: "Hard", t: "Hours", m: "verified" },
};

function attachIssueMeta(checks) {
  return checks.map((c) => {
    const meta = CHECK_META[c.id] || { d: "Medium", t: "—", m: "probable" };
    const impactEstimate =
      c.status === "pass" ? null : IMPACT_EST[c.impact]?.[c.status] ?? null;
    return {
      ...c,
      difficulty: meta.d,
      timeToFix: meta.t,
      confidence: CONFIDENCE[meta.m],
      method: meta.m,
      impactEstimate, // e.g. "+4–8%" — always an estimate, null when passing
    };
  });
}

// ---------------------------------------------------------------------------
// SCORING — weighted by impact, re-normalized over present layers.
// ---------------------------------------------------------------------------
export function computeScores(checks) {
  const weight = { high: 3, medium: 2, low: 1 };
  const points = { pass: 1, warn: 0.5, fail: 0 };

  const byLayer = {};
  for (const ch of checks) {
    const l = (byLayer[ch.layer] ||= { got: 0, max: 0 });
    l.got += points[ch.status] * weight[ch.impact];
    l.max += 1 * weight[ch.impact];
  }
  const pct = (l) => (l && l.max ? Math.round((l.got / l.max) * 100) : null);

  const seo = pct(byLayer.seo);
  const trust = pct(byLayer.trust);
  const content = pct(byLayer.content);
  const social = pct(byLayer.social);
  const technical = pct(byLayer.technical);
  const speed = pct(byLayer.speed);

  const parts = [
    [seo, 0.28],
    [speed, 0.2],
    [trust, 0.18],
    [content, 0.14],
    [technical, 0.12],
    [social, 0.08],
  ].filter(([v]) => v !== null);
  const wsum = parts.reduce((a, [, w]) => a + w, 0);
  const overall = wsum
    ? Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / wsum)
    : 0;

  return { overall, seo, trust, content, social, technical, speed };
}

// ---------------------------------------------------------------------------
function overlap(a, b) {
  const stop = new Set(["the","a","an","and","or","for","to","of","in","on","with","your","our","is","-","|"]);
  const words = (t) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w));
  const A = new Set(words(a)), B = words(b);
  return B.some((w) => A.has(w));
}
function safeHost(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

// ---------------------------------------------------------------------------
// PAGE SPEED  (Google PageSpeed Insights). Optional & graceful.
// ---------------------------------------------------------------------------
export async function runSpeed(rawUrl, strategy = "mobile") {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, reason: "bad_url" };

  const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_API_KEY || "";
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.append("category", "performance");
  if (key) endpoint.searchParams.set("key", key);

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch(endpoint.href, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, reason: "psi_error", status: res.status };

    const data = await res.json();
    const lh = data?.lighthouseResult;
    if (!lh) return { ok: false, reason: "no_result" };

    const perf = Math.round((lh.categories?.performance?.score ?? 0) * 100);
    const audits = lh.audits || {};
    const lcpMs = audits["largest-contentful-paint"]?.numericValue ?? null;
    const clsVal = audits["cumulative-layout-shift"]?.numericValue ?? null;
    const tbtMs = audits["total-blocking-time"]?.numericValue ?? null;
    const fcpMs = audits["first-contentful-paint"]?.numericValue ?? null;

    const checks = [];
    const add = (id, label, status, impact, detail) =>
      checks.push({ id, label, layer: "speed", status, impact, detail });

    add("perf-score", "Overall speed score",
      perf >= 90 ? "pass" : perf >= 50 ? "warn" : "fail", "high",
      `Google rates this page ${perf}/100 for speed on ${strategy}.`);
    if (lcpMs != null) {
      const sec = lcpMs / 1000;
      // Sanity guard: a huge LCP that contradicts a decent overall score is
      // almost always a cold-lab measurement artifact, not the real load time.
      const unreliable = sec > 15 && perf >= 50;
      add("lcp", "Loading speed (LCP)",
        unreliable ? "warn" : sec <= 2.5 ? "pass" : sec <= 4 ? "warn" : "fail",
        "high",
        unreliable
          ? `Lab test reported ${sec.toFixed(1)}s, but the overall speed score (${perf}/100) suggests this is a measurement glitch, not your real load time. Worth compressing large images to be safe.`
          : `Largest content paints in ${sec.toFixed(1)}s. Under 2.5s is good; over 4s loses visitors.`);
    }
    if (clsVal != null) {
      add("cls", "Visual stability (CLS)",
        clsVal <= 0.1 ? "pass" : clsVal <= 0.25 ? "warn" : "fail", "medium",
        `Layout shift score ${clsVal.toFixed(2)}. Under 0.1 means the page doesn't jump around as it loads.`);
    }
    if (tbtMs != null) {
      add("tbt", "Responsiveness (TBT)",
        tbtMs <= 200 ? "pass" : tbtMs <= 600 ? "warn" : "fail", "medium",
        `Total blocking time ${Math.round(tbtMs)}ms. Lower means the page reacts to taps faster.`);
    }

    return {
      ok: true, checks: attachIssueMeta(checks),
      metrics: {
        performance: perf,
        lcpSec: lcpMs != null ? +(lcpMs / 1000).toFixed(1) : null,
        cls: clsVal != null ? +clsVal.toFixed(2) : null,
        tbtMs: tbtMs != null ? Math.round(tbtMs) : null,
        fcpSec: fcpMs != null ? +(fcpMs / 1000).toFixed(1) : null,
        strategy,
      },
    };
  } catch (e) {
    return { ok: false, reason: e.name === "AbortError" ? "timeout" : "fetch_failed" };
  }
}
