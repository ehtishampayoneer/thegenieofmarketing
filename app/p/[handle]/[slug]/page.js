// app/p/[handle]/[slug]/page.js
// A published Genie Page — the real, public, indexable home of an article Genie
// wrote and the owner approved. Server-rendered with per-page SEO metadata and
// BlogPosting JSON-LD, so Google indexes it and AI engines can cite it. Read via
// the service-role admin client (published rows only); anonymous visitors welcome.

import { cache } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedPage, listPublishedPages, pageUrl } from "@/lib/pages";
import { blogBaseFor, ownArticleUrl } from "@/lib/own-blog";
import { READING_CSS, fmtDate, ensureHttp } from "@/app/p/reading";
import SubscribeBox from "@/components/p/SubscribeBox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dedupe the fetch between generateMetadata and the page render. Guarded so a
// missing service-role key or any read error yields null → a clean 404, never a 500.
const load = cache(async (handle, slug) => {
  try { return await getPublishedPage(createAdminClient(), handle, slug); }
  catch { return null; }
});

// What else this site has, for the rails. Cached, so the page and its metadata
// share one read, and guarded so a rail failing can never take the article with it.
const loadSiblings = cache(async (handle) => {
  try { return await listPublishedPages(createAdminClient(), handle); }
  catch { return []; }
});

// Which articles belong beside this one: the ones sharing words with it, then the
// newest. The same idea the internal linker uses, so a reader who followed a link
// in the body finds the same neighbours in the rail.
function relatedTo(page, pages, limit = 5) {
  const words = new Set(`${page.title} ${page.target_keyword || ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  return pages
    .filter((p) => p.slug !== page.slug)
    .map((p) => ({ p, overlap: `${p.title} ${p.target_keyword || ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => words.has(w)).length }))
    .sort((a, b) => b.overlap - a.overlap || new Date(b.p.published_at || 0) - new Date(a.p.published_at || 0))
    .slice(0, limit)
    .map((x) => x.p);
}

// Only ever articles that exist. A rail padded out with something invented would be
// the one part of this page that lies.
function Rail({ kicker, handle, pages }) {
  if (!pages.length) return <aside className="gp-rail" />;
  return (
    <aside className="gp-rail">
      <p className="gp-rail-k">{kicker}</p>
      <ul className="gp-rail-list">
        {pages.map((p) => (
          <li key={p.slug}>
            <a href={`/p/${handle}/${p.slug}`}>
              <span className="gp-rail-t">{p.title}</span>
              <span className="gp-rail-m">{fmtDate(p.published_at)}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export async function generateMetadata({ params }) {
  const page = await load(params.handle, params.slug);
  if (!page) return { title: "Article not found", robots: { index: false } };
  const url = pageUrl(page.handle, page.slug);
  // When the owner's own blog serves this article, that copy is the original:
  // this one defers to it, so Google credits the owner's domain, not Genie's.
  const own = await ownBase(page);
  const canonical = own ? ownArticleUrl(own, page.slug) : url;
  return {
    title: page.title,
    description: page.meta_description || undefined,
    // Advertise the clean markdown mirror so AI crawlers can grab the noise-free
    // version (rel="alternate" type="text/markdown").
    alternates: { canonical, types: { "text/markdown": `${canonical}/md` } },
    openGraph: {
      title: page.title, description: page.meta_description || "", url, type: "article",
      publishedTime: page.published_at, siteName: page.business_name || page.host,
      images: page.hero_image ? [{ url: page.hero_image }] : [],
    },
    twitter: { card: page.hero_image ? "summary_large_image" : "summary", title: page.title, description: page.meta_description || "" },
    robots: { index: true, follow: true },
  };
}

const ownBase = cache(async (page) => {
  try { return await blogBaseFor(createAdminClient(), page.user_id, page.handle); } catch { return null; }
});

// Only treat a page as a HowTo when the title clearly says so AND the body has real
// step sections. Steps come from the H2 headings (FAQ section excluded).
function howToSteps(title, html) {
  if (!/^\s*how (to|do|can|does)\b|^\s*(steps|ways|guide) to\b/i.test(String(title || ""))) return null;
  const steps = [];
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|$)/gi;
  let m;
  while ((m = re.exec(String(html || ""))) && steps.length < 12) {
    const name = m[1].replace(/<[^>]+>/g, "").trim();
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 320);
    if (name && !/faq|frequently asked|conclusion/i.test(name)) steps.push({ name, text });
  }
  return steps.length >= 2 ? steps : null;
}

export default async function ArticlePage({ params }) {
  const page = await load(params.handle, params.slug);
  if (!page) notFound();

  const url = pageUrl(page.handle, page.slug);
  const author = page.business_name || page.host;
  const bizUrl = ensureHttp(page.business_url || page.host); // CTA (may carry UTM tags)
  let bizClean = bizUrl; try { bizClean = new URL(bizUrl).origin; } catch {} // canonical, for schema
  const date = fmtDate(page.published_at);

  const faq = Array.isArray(page.faq) ? page.faq.filter((f) => f && f.q && f.a) : [];
  const orgId = bizClean ? `${bizClean}#org` : undefined;
  const handleUrl = url.replace(/\/[^/]+$/, ""); // .../p/<handle>
  const words = String(page.body_html || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  const org = { "@type": "Organization", ...(orgId ? { "@id": orgId } : {}), name: author, url: bizClean || undefined };
  // Hero as a proper ImageObject (Google prefers it over a bare URL for rich results).
  const heroObj = page.hero_image ? { "@type": "ImageObject", url: page.hero_image, ...(page.hero_alt ? { caption: page.hero_alt } : {}) } : undefined;
  const blog = {
    "@type": "BlogPosting",
    headline: page.title,
    description: page.meta_description || undefined,
    datePublished: page.published_at,
    dateModified: page.updated_at || page.published_at,
    author: orgId ? { "@id": orgId } : org,
    publisher: orgId ? { "@id": orgId } : org,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "en",
    ...(words ? { wordCount: words } : {}),
    ...(page.target_keyword ? { articleSection: page.target_keyword, keywords: page.target_keyword } : {}),
    ...(heroObj ? { image: heroObj } : {}),
  };
  const faqNode = faq.length
    ? { "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }
    : null;
  // Breadcrumb → the business hub, then this article (breadcrumb rich results).
  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: author, item: handleUrl },
      { "@type": "ListItem", position: 2, name: page.title, item: url },
    ],
  };
  // HowTo — derived, only when the article genuinely is a how-to (title heuristic +
  // real H2 steps). Google retired HowTo rich results, so this is for AI answer
  // engines + non-Google search that still read it; safe because it never mislabels
  // a non-how-to (and no rich result means no penalty surface).
  const steps = howToSteps(page.title, page.body_html);
  const howToNode = steps
    ? { "@type": "HowTo", name: page.title, ...(page.meta_description ? { description: page.meta_description } : {}), ...(heroObj ? { image: heroObj } : {}), step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text || s.name, url: `${url}#step-${i + 1}` })) }
    : null;
  // A @graph carries the business, the article, its FAQ, breadcrumb (and HowTo where
  // it applies) together — the structured signals Google and AI answer engines read.
  const jsonLd = { "@context": "https://schema.org", "@graph": [org, blog, faqNode, breadcrumb, howToNode].filter(Boolean) };

  const siblings = await loadSiblings(page.handle);
  const near = relatedTo(page, siblings);
  const latest = siblings.filter((p) => p.slug !== page.slug && !near.some((n) => n.slug === p.slug)).slice(0, 6);

  return (
    <main className="gp">
      <style>{READING_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* The rails carry the rest of the site, so there is always something to read
          next. They fall in under the article on a narrow screen. */}
      <div className="gp-shell">
      <article className="gp-main">
        <p className="gp-eyebrow"><a href={`/p/${page.handle}`}>{author}</a>{date ? <> · {date}</> : null}</p>
        <h1 className="gp-title">{page.title}</h1>
        {page.meta_description ? <p className="gp-lede">{page.meta_description}</p> : null}
        {page.hero_image ? <img className="gp-hero" src={page.hero_image} alt={page.hero_alt || page.title} /> : null}
        <div className="gp-body" dangerouslySetInnerHTML={{ __html: page.body_html }} />
        <SubscribeBox handle={page.handle} slug={page.slug} business={author} topic={page.target_keyword || null} />
        {page.host ? (
          <div style={{ marginTop: 22, textAlign: "center" }}>
            <a href={`https://www.google.com/preferences/source?q=${encodeURIComponent(page.host)}`} target="_blank" rel="noopener"
               style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "10px 18px", borderRadius: 999, border: "1px solid #dadce0", background: "#fff", color: "#3c4043", fontSize: 14, fontWeight: 600, textDecoration: "none", boxShadow: "0 1px 3px rgba(60,64,67,.12)" }}>
              <GoogleG /> Add {author} to your Google preferred sources
            </a>
            <p style={{ marginTop: 7, fontSize: 12, color: "#80868b" }}>See more from {author} in Google Top Stories & AI Overviews.</p>
          </div>
        ) : null}
        {bizUrl ? (
          <aside className="gp-cta">
            <p className="gp-cta-k">From {author}</p>
            <p className="gp-cta-t">Like this? See what else <strong>{author}</strong> can do for you.</p>
            <a className="gp-cta-b" href={bizUrl} rel="noopener nofollow">Visit {author} →</a>
          </aside>
        ) : null}
      </article>
        <Rail kicker={`More from ${author}`} handle={page.handle} pages={near} />
        <Rail kicker="Latest" handle={page.handle} pages={latest} />
      </div>
      <footer className="gp-foot">
        <a href="/verdict">Published with Marketing Genie — does AI recommend your business? →</a>
      </footer>
    </main>
  );
}

// The Google "G" mark for the preferred-sources button.
function GoogleG() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
