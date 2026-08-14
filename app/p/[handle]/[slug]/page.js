// app/p/[handle]/[slug]/page.js
// A published Genie Page — the real, public, indexable home of an article Genie
// wrote and the owner approved. Server-rendered with per-page SEO metadata and
// BlogPosting JSON-LD, so Google indexes it and AI engines can cite it. Read via
// the service-role admin client (published rows only); anonymous visitors welcome.

import { cache } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedPage, pageUrl } from "@/lib/pages";
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

export async function generateMetadata({ params }) {
  const page = await load(params.handle, params.slug);
  if (!page) return { title: "Article not found", robots: { index: false } };
  const url = pageUrl(page.handle, page.slug);
  return {
    title: page.title,
    description: page.meta_description || undefined,
    alternates: { canonical: url },
    openGraph: {
      title: page.title, description: page.meta_description || "", url, type: "article",
      publishedTime: page.published_at, siteName: page.business_name || page.host,
      images: page.hero_image ? [{ url: page.hero_image }] : [],
    },
    twitter: { card: page.hero_image ? "summary_large_image" : "summary", title: page.title, description: page.meta_description || "" },
    robots: { index: true, follow: true },
  };
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
  // A @graph carries the business, the article, its FAQ and breadcrumb together —
  // the structured signals Google's rich results and AI answer engines read most.
  const jsonLd = { "@context": "https://schema.org", "@graph": [org, blog, faqNode, breadcrumb].filter(Boolean) };

  return (
    <main className="gp">
      <style>{READING_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="gp-wrap">
        <p className="gp-eyebrow"><a href={`/p/${page.handle}`}>{author}</a>{date ? <> · {date}</> : null}</p>
        <h1 className="gp-title">{page.title}</h1>
        {page.meta_description ? <p className="gp-lede">{page.meta_description}</p> : null}
        {page.hero_image ? <img className="gp-hero" src={page.hero_image} alt={page.hero_alt || page.title} /> : null}
        <div className="gp-body" dangerouslySetInnerHTML={{ __html: page.body_html }} />
        <SubscribeBox handle={page.handle} slug={page.slug} business={author} topic={page.target_keyword || null} />
        {bizUrl ? (
          <aside className="gp-cta">
            <p className="gp-cta-k">From {author}</p>
            <p className="gp-cta-t">Like this? See what else <strong>{author}</strong> can do for you.</p>
            <a className="gp-cta-b" href={bizUrl} rel="noopener nofollow">Visit {author} →</a>
          </aside>
        ) : null}
      </article>
      <footer className="gp-foot">
        <a href="/verdict">Published with Marketing Genie — does AI recommend your business? →</a>
      </footer>
    </main>
  );
}
