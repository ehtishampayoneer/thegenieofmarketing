// app/b/[handle]/[[...path]]/route.js
// ── THE OWNER'S BLOG, SERVED THROUGH THEIR OWN DOMAIN ──
// The owner's host rewrites yoursite.com/blog/* to here (see lib/own-blog.js), so
// every URL below is really read by Google as yoursite.com/blog/...:
//
//   /b/<handle>                 -> the article list      (yoursite.com/blog)
//   /b/<handle>/<slug>          -> one article           (yoursite.com/blog/<slug>)
//   /b/<handle>/<slug>/md       -> its markdown mirror, for AI crawlers
//   /b/<handle>/sitemap.xml     -> sitemap on the owner's domain
//   /b/<handle>/rss.xml         -> feed
//   /b/<handle>/llms.txt        -> the AI reading list for the blog
//   /b/<handle>/indexnow-key.txt -> IndexNow key, so Bing indexes the owner's URLs
//
// Plain HTML with inline CSS and no framework scripts: behind a proxy, anything
// fetched from a relative path would be asked of the OWNER's domain, so nothing
// here may depend on one. Every link is absolute, to the owner's domain.
//
// Only this owner's pages are shown, even if another account scanned the same
// site, because the handle is resolved to the account that connected the blog.

import { createAdminClient } from "@/lib/supabase/admin";
import { appBase } from "@/lib/pages";
import { blogOwnerByHandle, ownArticleUrl, rewriteBodyLinks, markerValue } from "@/lib/own-blog";
import { htmlToMarkdown } from "@/lib/markdown";
import { READING_CSS, fmtDate, ensureHttp } from "@/app/p/reading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400";

export async function GET(_req, { params }) {
  const handle = String(params.handle || "");
  const path = (params.path || []).map(String);

  let admin;
  try { admin = createAdminClient(); } catch { return notFound(); }
  const owner = await blogOwnerByHandle(admin, handle);
  if (!owner?.meta) return notFound();

  // Before verification the base is what the owner asked for, so the page Genie
  // fetches to verify already carries the right canonicals.
  const meta = owner.meta;
  const base = String(meta.base || `https://${meta.host}${meta.path}`).replace(/\/+$/, "");
  const site = ensureHttp(meta.host || "");
  const ctx = { admin, userId: owner.user_id, handle, base, site, marker: markerValue(handle, owner.user_id) };

  if (path.length === 0) return indexPage(ctx);
  if (path.length === 1 && path[0] === "sitemap.xml") return sitemap(ctx);
  if (path.length === 1 && path[0] === "rss.xml") return rss(ctx);
  if (path.length === 1 && path[0] === "llms.txt") return llms(ctx);
  // IndexNow's proof of ownership for URLs under this folder (see lib/indexnow.js).
  if (path.length === 1 && path[0] === "indexnow-key.txt") {
    const key = process.env.INDEXNOW_KEY || "";
    return key ? new Response(key, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }) : notFound();
  }
  if (path.length === 1) return articlePage(ctx, path[0]);
  if (path.length === 2 && path[1] === "md") return markdown(ctx, path[0]);
  return notFound();
}

async function listPages({ admin, userId, handle }, limit = 200) {
  try {
    const { data } = await admin.from("published_pages")
      .select("slug, title, meta_description, published_at, updated_at, business_name")
      .eq("user_id", userId).eq("handle", handle).eq("status", "published")
      .order("published_at", { ascending: false }).limit(limit);
    return data || [];
  } catch { return []; }
}

async function getPage({ admin, userId, handle }, slug) {
  try {
    const { data } = await admin.from("published_pages").select("*")
      .eq("user_id", userId).eq("handle", handle).eq("slug", slug).eq("status", "published").maybeSingle();
    return data || null;
  } catch { return null; }
}

// ── Pages ────────────────────────────────────────────────────────────────────

async function indexPage(ctx) {
  const pages = await listPages(ctx, 100);
  const name = pages[0]?.business_name || ctx.site.replace(/^https?:\/\//, "");
  const items = pages.map((p) => `
      <li><a href="${attr(ownArticleUrl(ctx.base, p.slug))}">
        <span class="gp-li-t">${esc(p.title)}</span>
        ${p.meta_description ? `<span class="gp-li-d">${esc(p.meta_description)}</span>` : ""}
        <span class="gp-li-m">${esc(fmtDate(p.published_at))}</span>
      </a></li>`).join("");
  const body = `
    <div class="gp-wrap">
      ${topBar(ctx, name)}
      <h1 class="gp-title">Articles &amp; guides</h1>
      <p class="gp-lede">Practical answers from ${esc(name)}.</p>
      ${pages.length ? `<ul class="gp-list">${items}</ul>` : `<p class="gp-lede">New articles are on their way.</p>`}
    </div>`;
  return html(doc({
    ctx, title: `Articles & guides | ${name}`, description: `Guides and answers from ${name}.`, canonical: ctx.base, body,
  }));
}

async function articlePage(ctx, slug) {
  const page = await getPage(ctx, slug);
  if (!page) return notFound();
  const url = ownArticleUrl(ctx.base, page.slug);
  const author = page.business_name || page.host;
  const origin = ctx.site;
  const faq = Array.isArray(page.faq) ? page.faq.filter((f) => f && f.q && f.a) : [];
  const org = { "@type": "Organization", "@id": `${origin}#org`, name: author, url: origin };
  const image = page.hero_image ? { "@type": "ImageObject", url: page.hero_image, ...(page.hero_alt ? { caption: page.hero_alt } : {}) } : undefined;
  const words = String(page.body_html || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const graph = [
    org,
    {
      "@type": "BlogPosting", headline: page.title, description: page.meta_description || undefined,
      datePublished: page.published_at, dateModified: page.updated_at || page.published_at,
      author: { "@id": `${origin}#org` }, publisher: { "@id": `${origin}#org` },
      mainEntityOfPage: { "@type": "WebPage", "@id": url }, inLanguage: "en",
      ...(words ? { wordCount: words } : {}),
      ...(page.target_keyword ? { keywords: page.target_keyword, articleSection: page.target_keyword } : {}),
      ...(image ? { image } : {}),
    },
    faq.length ? { "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) } : null,
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: author, item: origin },
      { "@type": "ListItem", position: 2, name: "Articles", item: ctx.base },
      { "@type": "ListItem", position: 3, name: page.title, item: url },
    ] },
  ].filter(Boolean);

  const bodyHtml = rewriteBodyLinks(page.body_html || "", ctx.handle, ctx.base);
  const body = `
    <article class="gp-wrap">
      ${topBar(ctx, author, fmtDate(page.published_at))}
      <h1 class="gp-title">${esc(page.title)}</h1>
      ${page.meta_description ? `<p class="gp-lede">${esc(page.meta_description)}</p>` : ""}
      ${page.hero_image ? `<img class="gp-hero" src="${attr(page.hero_image)}" alt="${attr(page.hero_alt || page.title)}">` : ""}
      <div class="gp-body">${bodyHtml}</div>
      ${subscribeForm(page, author)}
    </article>`;

  return html(doc({
    ctx, title: page.title, description: page.meta_description || "", canonical: url, body,
    extraHead: `
  <link rel="alternate" type="text/markdown" href="${attr(url)}/md">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${attr(page.title)}">
  <meta property="og:description" content="${attr(page.meta_description || "")}">
  <meta property="og:url" content="${attr(url)}">
  <meta property="og:site_name" content="${attr(author)}">
  ${page.hero_image ? `<meta property="og:image" content="${attr(page.hero_image)}">` : ""}
  <meta property="article:published_time" content="${attr(page.published_at || "")}">
  <meta name="twitter:card" content="${page.hero_image ? "summary_large_image" : "summary"}">
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`,
  }));
}

async function markdown(ctx, slug) {
  const page = await getPage(ctx, slug);
  if (!page) return new Response("# Not found\n", { status: 404, headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  const url = ownArticleUrl(ctx.base, page.slug);
  const faq = Array.isArray(page.faq) ? page.faq.filter((f) => f && f.q && f.a) : [];
  const lines = [
    "---", `title: ${one(page.title)}`, page.meta_description ? `description: ${one(page.meta_description)}` : null,
    `canonical: ${url}`, page.published_at ? `published: ${new Date(page.published_at).toISOString().slice(0, 10)}` : null, "---", "",
    `# ${one(page.title)}`, "", page.meta_description ? `> ${one(page.meta_description)}\n` : null,
    htmlToMarkdown(rewriteBodyLinks(page.body_html || "", ctx.handle, ctx.base)),
  ];
  if (faq.length) { lines.push("", "## FAQ", ""); for (const f of faq) lines.push(`### ${one(f.q)}`, "", one(f.a), ""); }
  lines.push("", "---", "", `More from ${one(page.business_name || page.host)}: ${ctx.site}`);
  const text = lines.filter((l) => l != null).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return new Response(text, { status: 200, headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": CACHE, "X-Robots-Tag": "noindex" } });
}

async function sitemap(ctx) {
  const pages = await listPages(ctx, 5000);
  const urls = [`  <url><loc>${xml(ctx.base)}</loc></url>`].concat(pages.map((p) =>
    `  <url><loc>${xml(ownArticleUrl(ctx.base, p.slug))}</loc><lastmod>${new Date(p.updated_at || p.published_at || Date.now()).toISOString()}</lastmod></url>`));
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": CACHE } });
}

async function rss(ctx) {
  const pages = await listPages(ctx, 50);
  const name = pages[0]?.business_name || ctx.site.replace(/^https?:\/\//, "");
  const items = pages.map((p) => {
    const link = ownArticleUrl(ctx.base, p.slug);
    return `    <item><title>${xml(p.title)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid><pubDate>${new Date(p.published_at || Date.now()).toUTCString()}</pubDate><description>${xml(p.meta_description || "")}</description></item>`;
  }).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n    <title>${xml(name)}: articles</title>\n    <link>${xml(ctx.base)}</link>\n    <description>Guides and answers from ${xml(name)}.</description>\n${items}\n  </channel></rss>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": CACHE } });
}

async function llms(ctx) {
  const pages = await listPages(ctx, 300);
  const name = pages[0]?.business_name || ctx.site.replace(/^https?:\/\//, "");
  const out = [`# ${one(name)}: articles`, "", `> Guides and answers from ${one(name)} (${ctx.site}). Each page has a plain-markdown version at its URL followed by /md.`, ""];
  for (const p of pages) out.push(`- [${one(p.title)}](${ownArticleUrl(ctx.base, p.slug)})${p.meta_description ? `: ${one(p.meta_description)}` : ""}`);
  return new Response(out.join("\n") + "\n", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": CACHE } });
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function topBar(ctx, name, date = "") {
  return `<p class="gp-eyebrow"><a href="${attr(ctx.site)}">${esc(name)}</a> · <a href="${attr(ctx.base)}">Articles</a>${date ? ` · ${esc(date)}` : ""}</p>`;
}

// The same opt-in as the Genie Page version, without React: a tiny script posts
// to Genie's absolute URL (the relative one would hit the owner's server).
function subscribeForm(page, author) {
  const endpoint = `${appBase()}/api/subscribe`;
  return `
      <form class="gp-sub" id="gp-sub" data-h="${attr(page.handle)}" data-s="${attr(page.slug)}">
        <p class="gp-sub-k">From ${esc(author)}</p>
        <p class="gp-sub-t">Want more tips like this?</p>
        <p class="gp-sub-s">Practical, no-fluff advice. Free, and unsubscribe anytime.</p>
        <div class="gp-sub-row">
          <input type="email" required placeholder="you@email.com" aria-label="Email address" class="gp-sub-in" name="email">
          <button type="submit" class="gp-sub-b">Send me tips</button>
        </div>
        <p class="gp-sub-err" hidden>Please enter a valid email and try again.</p>
      </form>
      <script>
      (function(){var f=document.getElementById("gp-sub");if(!f)return;f.addEventListener("submit",function(e){e.preventDefault();
        var em=f.email.value.trim(),er=f.querySelector(".gp-sub-err"),b=f.querySelector("button");er.hidden=true;b.disabled=true;
        fetch(${JSON.stringify(endpoint)},{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:em,handle:f.dataset.h,slug:f.dataset.s,source:"own-blog"})})
        .then(function(r){return r.json()}).then(function(j){if(j&&j.ok){f.innerHTML='<p class="gp-sub-k">You are in</p><p class="gp-sub-t">Thanks for subscribing.</p>';}else{er.hidden=false;b.disabled=false;}})
        .catch(function(){er.hidden=false;b.disabled=false;});});})();
      </script>`;
}

function doc({ ctx, title, description, canonical, body, extraHead = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  ${description ? `<meta name="description" content="${attr(description)}">` : ""}
  <link rel="canonical" href="${attr(canonical)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="genie-blog" content="${attr(ctx.marker)}">
  <link rel="alternate" type="application/rss+xml" href="${attr(ctx.base)}/rss.xml">
  ${extraHead}
  <style>${READING_CSS}.gp-eyebrow a+a{margin-left:0}</style>
</head>
<body style="margin:0"><main class="gp">${body}</main></body>
</html>`;
}

function html(s) {
  return new Response(s, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": CACHE } });
}
function notFound() {
  return new Response("<!doctype html><title>Not found</title><p>Not found.</p>", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function attr(s) { return esc(s).replace(/"/g, "&quot;"); }
function xml(s) { return attr(s).replace(/'/g, "&apos;"); }
function one(s) { return String(s || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim(); }
