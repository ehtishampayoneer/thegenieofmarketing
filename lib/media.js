// lib/media.js
// ── POST IMAGERY (free, on-brand) ──
// Every draft should ship with a real image, not plain text. Source priority:
//   1) the business's OWN images — product/hero/og shots harvested from its site
//      (and any image links the owner provides). The most authentic, on-brand,
//      market-competitive option: it's literally their product.
//   2) free stock photography (Pexels) matched to the post's topic, when the site
//      has no fitting shot.
// Env-gated + graceful: no PEXELS_API_KEY just means no stock fallback; a site
// with no usable images just means the draft stays text. Never throws.

const UA = "Mozilla/5.0 (compatible; GenieBot/1.0; +https://thegenieofmarketing.com)";
// Chrome we never want as a post image (icons, logos, tracking pixels, sprites).
const BAD = /(logo|icon|favicon|sprite|avatar|badge|pixel|1x1|spacer|placeholder|loading|thumb[-_.]|\.svg(\?|$)|^data:)/i;
const GOOD_EXT = /\.(jpe?g|png|webp|avif)(\?|$)/i;

function siteOrigin(hostOrUrl) {
  let s = String(hostOrUrl || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try { return new URL(s).origin; } catch { return null; }
}
function absolutize(src, origin) { try { return new URL(src, origin).href; } catch { return null; } }
function originLabel(hostOrUrl) { try { return new URL(siteOrigin(hostOrUrl)).host.replace(/^www\./, ""); } catch { return "your site"; } }

// Pull candidate images out of a page's HTML. Regex-based (no dependency): the
// owner-curated share image (og:image / twitter:image) first, then real <img> tags.
function extractImages(html, origin) {
  const out = [];
  const seen = new Set();
  const push = (src, alt) => {
    const url = absolutize(String(src || "").trim(), origin);
    if (!url || seen.has(url) || BAD.test(url)) return;
    seen.add(url);
    out.push({ url, alt: String(alt || "").trim() });
  };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*>/gi)) {
    const c = /content=["']([^"']+)["']/i.exec(m[0]);
    if (c) push(c[1], "");
  }
  const ownerCurated = out.length; // og/twitter images are kept regardless of extension
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i.exec(tag)?.[1];
    const alt = /alt=["']([^"']*)["']/i.exec(tag)?.[1];
    if (src) push(src, alt);
    if (out.length > 60) break;
  }
  return out.filter((im, i) => i < ownerCurated || GOOD_EXT.test(im.url));
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(7000) });
    if (!res.ok || !/text\/html/i.test(res.headers.get("content-type") || "")) return null;
    return (await res.text()).slice(0, 700000);
  } catch { return null; }
}

// Same-origin links most likely to hold product imagery — crawled after the homepage.
const PRODUCT_HINT = /(product|shop|store|collection|item|catalog|gallery|portfolio|menu|\/p\/)/i;
function pickCrawlLinks(html, origin, n) {
  const seen = new Set();
  const hinted = [], other = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    const href = absolutize(m[1], origin);
    if (!href) continue;
    try {
      const u = new URL(href);
      if (u.origin !== origin || u.pathname === "/" || seen.has(u.href)) continue;
      if (/\.(pdf|zip|jpe?g|png|webp|svg|mp4|xml|json|css|js)$/i.test(u.pathname)) continue;
      seen.add(u.href);
      (PRODUCT_HINT.test(u.pathname) ? hinted : other).push(u.href);
    } catch {}
  }
  return [...hinted, ...other].slice(0, n);
}

// Harvest a site's usable images: the homepage, then a few product/collection pages
// (where the real product shots live). Best-effort, bounded, short timeouts.
export async function harvestSiteImages(hostOrUrl, { limit = 24, deep = true, maxPages = 4 } = {}) {
  const origin = siteOrigin(hostOrUrl);
  if (!origin) return [];
  const home = await fetchPage(origin);
  if (!home) return [];
  let imgs = extractImages(home, origin);
  if (deep && maxPages > 1) {
    const links = pickCrawlLinks(home, origin, maxPages - 1);
    const pages = await Promise.all(links.map((l) => fetchPage(l).then((h) => ({ l, h }))));
    for (const { l, h } of pages) { if (h) try { imgs = imgs.concat(extractImages(h, new URL(l).origin)); } catch {} }
  }
  const seen = new Set(), dedup = [];
  for (const im of imgs) { if (!seen.has(im.url)) { seen.add(im.url); dedup.push(im); } }
  return dedup.slice(0, limit);
}

function keywordsOf(s) { return new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)); }
function overlapScore(im, kws) {
  let hay = `${im.alt} `;
  try { hay += decodeURIComponent(im.url); } catch { hay += im.url; }
  hay = hay.toLowerCase();
  let n = 0;
  for (const k of kws) if (hay.includes(k)) n++;
  return n;
}

// Free stock photography from Pexels (commercial-OK, no attribution required —
// we still credit the photographer). Needs a free PEXELS_API_KEY; returns [] otherwise.
export async function pexelsSearch(query, { perPage = 8, orientation = "landscape" } = {}) {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query) return [];
  try {
    const u = new URL("https://api.pexels.com/v1/search");
    u.searchParams.set("query", String(query).slice(0, 100));
    u.searchParams.set("per_page", String(perPage));
    if (orientation) u.searchParams.set("orientation", orientation);
    const res = await fetch(u, { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.photos || [])
      .map((p) => ({ url: p.src?.large || p.src?.landscape || p.src?.original, alt: p.alt || query, photographer: p.photographer, source: "Pexels" }))
      .filter((p) => p.url);
  } catch { return []; }
}

// Pick the single best image for a post. Own imagery that matches the topic wins;
// then relevant free stock; then the business's own share/hero image (on-brand even
// if generic). Returns { url, alt, source: "site"|"stock", credit } or null.
export async function pickPostImage({ topic, siteUrl, extraImages = [] } = {}) {
  const kws = keywordsOf(topic);
  let site = [];
  try { site = [...(extraImages || []), ...(await harvestSiteImages(siteUrl))]; } catch {}
  const rankedSite = site.map((im) => ({ ...im, _s: overlapScore(im, kws) })).sort((a, b) => b._s - a._s);

  if (rankedSite[0] && rankedSite[0]._s > 0) {
    const im = rankedSite[0];
    return { url: im.url, alt: im.alt || topic, source: "site", credit: originLabel(siteUrl) };
  }
  const stock = await pexelsSearch(topic);
  if (stock[0]) return { url: stock[0].url, alt: stock[0].alt || topic, source: "stock", credit: `${stock[0].photographer} / Pexels` };
  if (rankedSite[0]) { const im = rankedSite[0]; return { url: im.url, alt: im.alt || topic, source: "site", credit: originLabel(siteUrl) }; }
  return null;
}
