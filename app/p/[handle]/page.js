// app/p/[handle]/page.js
// A business's public Genie Pages index — every article Genie published for them,
// newest first. Server-rendered, indexable. Read via the service-role admin client.

import { cache } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPublishedPages, appBase } from "@/lib/pages";
import { READING_CSS, fmtDate } from "@/app/p/reading";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Guarded so a missing service-role key or any read error yields [] → a clean 404.
const load = cache(async (handle) => {
  try { return await listPublishedPages(createAdminClient(), handle); }
  catch { return []; }
});

export async function generateMetadata({ params }) {
  const pages = await load(params.handle);
  const name = pages[0]?.business_name || params.handle;
  if (!pages.length) return { title: "Not found", robots: { index: false } };
  return {
    title: `${name} — Articles & answers`,
    description: `Guides, answers, and articles from ${name}.`,
    alternates: { types: { "application/rss+xml": `${appBase()}/p/${params.handle}/rss.xml` } },
    robots: { index: true, follow: true },
  };
}

export default async function IndexPage({ params }) {
  const pages = await load(params.handle);
  if (!pages.length) notFound();
  const name = pages[0]?.business_name || params.handle;
  const [lead, ...rest] = pages;
  const oldest = [...pages].reverse().filter((p) => p.slug !== lead?.slug).slice(0, 6);

  return (
    <main className="gp">
      <style>{READING_CSS}</style>
      {/* The same lead story, cards and rails the owner's own blog at /b/ renders.
          Two designs for the same articles is how one of them becomes the old one
          nobody updated. */}
      <div className="gp-shell">
        <div className="gp-main">
          <p className="gp-eyebrow">{name}</p>
          <h1 className="gp-title">Articles &amp; answers</h1>
          <p className="gp-lede">Practical answers from {name}.</p>
          <div className="gp-lead">
            <a href={`/p/${params.handle}/${lead.slug}`}>
              <Thumb page={lead} />
              <div className="gp-lead-in">
                {lead.target_keyword ? <span className="gp-card-tag">{lead.target_keyword}</span> : null}
                <span className="gp-lead-t">{lead.title}</span>
                {lead.meta_description ? <span className="gp-lead-d">{lead.meta_description}</span> : null}
                <span className="gp-card-m">{fmtDate(lead.published_at)}</span>
              </div>
            </a>
          </div>
          <hr className="gp-rule" />
          <p className="gp-count">{pages.length} article{pages.length === 1 ? "" : "s"} and counting.</p>
          {rest.length ? (
            <ul className="gp-cards">
              {rest.map((p) => (
                <li className="gp-card" key={p.slug}>
                  <a href={`/p/${params.handle}/${p.slug}`}>
                    <Thumb page={p} />
                    <div className="gp-card-in">
                      <span className="gp-card-t">{p.title}</span>
                      {p.meta_description ? <span className="gp-card-d">{p.meta_description}</span> : null}
                      <span className="gp-card-m">{fmtDate(p.published_at)}</span>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Rail kicker="Latest" handle={params.handle} pages={rest.slice(0, 6)} empty="The newest articles will appear here." />
        <Rail kicker="Start here" handle={params.handle} pages={oldest} empty="" />
      </div>
      <footer className="gp-foot">
        <a href="/verdict">Published with Marketing Genie — does AI recommend your business? →</a>
      </footer>
    </main>
  );
}

// A page with no hero image is not a broken card: its initial on a warm wash reads
// as a cover, costs no request, and never renders a missing-image icon.
function Thumb({ page }) {
  if (page.hero_image) {
    return <img className="gp-thumb" src={page.hero_image} alt={page.hero_alt || page.title} loading="lazy" decoding="async" />;
  }
  const initial = String(page.title || "?").trim().charAt(0).toUpperCase() || "?";
  return <div className="gp-thumb gp-thumb--none" aria-hidden="true">{initial}</div>;
}

// Only ever articles that exist. A rail padded out with something invented would be
// the one part of this page that lies.
function Rail({ kicker, handle, pages, empty }) {
  if (!pages.length) {
    return <aside className="gp-rail">{empty ? <><p className="gp-rail-k">{kicker}</p><p className="gp-rail-empty">{empty}</p></> : null}</aside>;
  }
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
