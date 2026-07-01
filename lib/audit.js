// lib/audit.js
// The 360° Audit Engine (v1: everything measurable from the live HTML).
// Fetches the real page, parses it, runs verified checks, computes scores.
// No external accounts needed. Speed/Core-Web-Vitals come in a later pass.

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

/**
 * Fetch + scan a URL. Never throws for normal failures — returns a result
 * object with fetchedOk:false and a reason, so the caller can always respond.
 */
export async function runAudit(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) {
    return { ok: false, reason: "bad_url", url: rawUrl };
  }

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

  const $ = cheerio.load(html);
  const signals = extractSignals($, finalUrl, html);
  const checks = runChecks(signals);
  const scores = computeScores(checks);
  const pageText = extractText($).slice(0, 3000);

  return {
    ok: true,
    url,
    finalUrl,
    status,
    signals,
    checks,
    scores,
    pageText,
  };
}

// ---------------------------------------------------------------------------
// SIGNAL EXTRACTION
// ---------------------------------------------------------------------------
function extractSignals($, finalUrl, html) {
  const lower = html.toLowerCase();
  const host = safeHost(finalUrl);

  const title = ($("title").first().text() || "").trim();
  const metaDesc = ($('meta[name="description"]').attr("content") || "").trim();
  const h1s = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const h2count = $("h2").length;
  const h3count = $("h3").length;

  const images = $("img");
  const imgTotal = images.length;
  let imgWithAlt = 0;
  images.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt && alt.trim().length > 0) imgWithAlt++;
  });

  // links
  const links = $("a[href]")
    .map((_, el) => $(el).attr("href"))
    .get();
  const internalLinks = links.filter(
    (h) => h && (h.startsWith("/") || h.includes(host))
  ).length;
  const externalLinks = links.length - internalLinks;

  const socialDomains = [
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "youtube.com",
    "tiktok.com",
    "pinterest.com",
  ];
  const socialLinks = links.filter((h) =>
    socialDomains.some((d) => (h || "").toLowerCase().includes(d))
  );

  return {
    host,
    isHttps: finalUrl.startsWith("https://"),
    title,
    titleLen: title.length,
    metaDesc,
    metaDescLen: metaDesc.length,
    h1Count: h1s.length,
    h1Text: h1s[0] || "",
    h2count,
    h3count,
    imgTotal,
    imgWithAlt,
    imgAltPct: imgTotal ? Math.round((imgWithAlt / imgTotal) * 100) : 100,
    canonical: $('link[rel="canonical"]').attr("href") || "",
    lang: $("html").attr("lang") || "",
    viewport: !!$('meta[name="viewport"]').attr("content"),
    favicon:
      !!$('link[rel*="icon"]').attr("href") || lower.includes("favicon"),
    ogTitle: !!$('meta[property="og:title"]').attr("content"),
    ogImage: !!$('meta[property="og:image"]').attr("content"),
    jsonLd: $('script[type="application/ld+json"]').length > 0,
    noindex: /noindex/i.test($('meta[name="robots"]').attr("content") || ""),
    hasAnalytics:
      lower.includes("googletagmanager.com") ||
      lower.includes("gtag(") ||
      lower.includes("google-analytics.com") ||
      lower.includes("ga('create"),
    hasMetaPixel: lower.includes("connect.facebook.net") || lower.includes("fbq("),
    hasContact:
      links.some((h) => /^mailto:|^tel:/i.test(h || "")) ||
      /contact/i.test(lower),
    hasPrivacy: /privacy[\s-]?policy/i.test(lower),
    internalLinks,
    externalLinks,
    socialLinkCount: socialLinks.length,
    wordCount: 0, // filled by caller-adjacent text below
  };
}

function extractText($) {
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text;
}

// ---------------------------------------------------------------------------
// CHECKS  (each: id, label, layer, status: pass|warn|fail, impact, detail)
// ---------------------------------------------------------------------------
function runChecks(s) {
  const c = [];
  const add = (id, label, layer, status, impact, detail) =>
    c.push({ id, label, layer, status, impact, detail });

  // SEO
  add(
    "title",
    "Page title",
    "seo",
    s.title ? (s.titleLen >= 30 && s.titleLen <= 65 ? "pass" : "warn") : "fail",
    "high",
    s.title
      ? `Title is ${s.titleLen} characters. Ideal is 30–65.`
      : "No page title found. Google shows this as your headline in results."
  );
  add(
    "meta-desc",
    "Meta description",
    "seo",
    s.metaDesc
      ? s.metaDescLen >= 70 && s.metaDescLen <= 160
        ? "pass"
        : "warn"
      : "fail",
    "medium",
    s.metaDesc
      ? `Description is ${s.metaDescLen} characters. Ideal is 70–160.`
      : "No meta description. Google writes its own, often badly."
  );
  add(
    "h1",
    "Main heading (H1)",
    "seo",
    s.h1Count === 1 ? "pass" : s.h1Count === 0 ? "fail" : "warn",
    "medium",
    s.h1Count === 1
      ? `One clear H1: “${truncate(s.h1Text, 60)}”`
      : s.h1Count === 0
      ? "No H1 heading. Pages need one clear main heading."
      : `${s.h1Count} H1 headings found. There should be exactly one.`
  );
  add(
    "headings",
    "Heading structure",
    "seo",
    s.h2count >= 1 ? "pass" : "warn",
    "low",
    `${s.h2count} H2 and ${s.h3count} H3 subheadings.`
  );
  add(
    "alt-text",
    "Image alt text",
    "seo",
    s.imgTotal === 0 ? "warn" : s.imgAltPct >= 80 ? "pass" : "fail",
    "medium",
    s.imgTotal === 0
      ? "No images detected on the page."
      : `${s.imgAltPct}% of ${s.imgTotal} images have alt text (target 80%+).`
  );
  add(
    "canonical",
    "Canonical tag",
    "seo",
    s.canonical ? "pass" : "warn",
    "low",
    s.canonical ? "Canonical URL is set." : "No canonical tag — can cause duplicate-content confusion."
  );
  add(
    "indexable",
    "Indexable by Google",
    "seo",
    s.noindex ? "fail" : "pass",
    "high",
    s.noindex ? "Page is set to NOINDEX — Google is told to hide it!" : "Page allows Google indexing."
  );
  add(
    "schema",
    "Structured data",
    "seo",
    s.jsonLd ? "pass" : "warn",
    "low",
    s.jsonLd ? "Schema markup found." : "No schema markup — limits rich results in Google."
  );

  // TRUST
  add(
    "https",
    "Secure (HTTPS)",
    "trust",
    s.isHttps ? "pass" : "fail",
    "high",
    s.isHttps ? "Site is served securely over HTTPS." : "Not secure! Browsers warn visitors away from HTTP sites."
  );
  add(
    "contact",
    "Contact details",
    "trust",
    s.hasContact ? "pass" : "warn",
    "medium",
    s.hasContact ? "Contact method detected." : "No obvious phone, email, or contact link."
  );
  add(
    "privacy",
    "Privacy policy",
    "trust",
    s.hasPrivacy ? "pass" : "warn",
    "low",
    s.hasPrivacy ? "Privacy policy link found." : "No privacy policy link found."
  );
  add(
    "favicon",
    "Favicon",
    "trust",
    s.favicon ? "pass" : "warn",
    "low",
    s.favicon ? "Favicon present." : "No favicon — looks unfinished in browser tabs."
  );

  // CONTENT
  add(
    "social-meta",
    "Social share preview",
    "social",
    s.ogTitle && s.ogImage ? "pass" : "warn",
    "medium",
    s.ogTitle && s.ogImage
      ? "Open Graph title and image set — links preview nicely."
      : "Missing Open Graph tags — shared links look bare."
  );
  add(
    "social-links",
    "Social profiles linked",
    "social",
    s.socialLinkCount >= 1 ? "pass" : "warn",
    "low",
    s.socialLinkCount >= 1
      ? `${s.socialLinkCount} social profile link(s) found.`
      : "No links to social profiles found."
  );

  // TECHNICAL
  add(
    "viewport",
    "Mobile-friendly setup",
    "technical",
    s.viewport ? "pass" : "fail",
    "high",
    s.viewport ? "Mobile viewport tag present." : "No viewport tag — page won't size correctly on phones."
  );
  add(
    "analytics",
    "Visitor tracking",
    "technical",
    s.hasAnalytics ? "pass" : "warn",
    "medium",
    s.hasAnalytics ? "Analytics detected." : "No analytics found — you're flying blind on visitors."
  );
  add(
    "lang",
    "Language set",
    "technical",
    s.lang ? "pass" : "warn",
    "low",
    s.lang ? `Language set to “${s.lang}”.` : "No html lang attribute set."
  );

  return c;
}

// ---------------------------------------------------------------------------
// SCORING — verified checks only. Weighted toward impact.
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
  const social = pct(byLayer.social);
  const technical = pct(byLayer.technical);
  const speed = pct(byLayer.speed);

  // Overall = weighted blend of what we can measure (re-normalized over what's present).
  const parts = [
    [seo, 0.3],
    [speed, 0.25],
    [technical, 0.15],
    [trust, 0.2],
    [social, 0.1],
  ].filter(([v]) => v !== null);
  const wsum = parts.reduce((a, [, w]) => a + w, 0);
  const overall = wsum
    ? Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / wsum)
    : 0;

  return { overall, seo, trust, social, technical, speed };
}

// ---------------------------------------------------------------------------
function safeHost(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

// ---------------------------------------------------------------------------
// PAGE SPEED  (Google PageSpeed Insights / Lighthouse). Optional & graceful:
// works best with a PAGESPEED_API_KEY, degrades to "pending" if unavailable.
// ---------------------------------------------------------------------------
export async function runSpeed(rawUrl, strategy = "mobile") {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, reason: "bad_url" };

  const key =
    process.env.PAGESPEED_API_KEY || process.env.GOOGLE_API_KEY || "";
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
  );
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

    add(
      "perf-score",
      "Overall speed score",
      perf >= 90 ? "pass" : perf >= 50 ? "warn" : "fail",
      "high",
      `Google rates this page ${perf}/100 for speed on ${strategy}.`
    );
    if (lcpMs != null) {
      const s = lcpMs / 1000;
      add(
        "lcp",
        "Loading speed (LCP)",
        s <= 2.5 ? "pass" : s <= 4 ? "warn" : "fail",
        "high",
        `Largest content paints in ${s.toFixed(1)}s. Under 2.5s is good; over 4s loses visitors.`
      );
    }
    if (clsVal != null) {
      add(
        "cls",
        "Visual stability (CLS)",
        clsVal <= 0.1 ? "pass" : clsVal <= 0.25 ? "warn" : "fail",
        "medium",
        `Layout shift score ${clsVal.toFixed(2)}. Under 0.1 means the page doesn't jump around as it loads.`
      );
    }
    if (tbtMs != null) {
      add(
        "tbt",
        "Responsiveness (TBT)",
        tbtMs <= 200 ? "pass" : tbtMs <= 600 ? "warn" : "fail",
        "medium",
        `Total blocking time ${Math.round(tbtMs)}ms. Lower means the page reacts to taps faster.`
      );
    }

    return {
      ok: true,
      checks,
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
    return {
      ok: false,
      reason: e.name === "AbortError" ? "timeout" : "fetch_failed",
    };
  }
}
