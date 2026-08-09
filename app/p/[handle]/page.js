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

  return (
    <main className="gp">
      <style>{READING_CSS}</style>
      <div className="gp-wrap">
        <p className="gp-eyebrow">{name}</p>
        <h1 className="gp-title">Articles &amp; answers</h1>
        <ul className="gp-list">
          {pages.map((p) => (
            <li key={p.slug}>
              <a href={`/p/${params.handle}/${p.slug}`}>
                <span className="gp-li-t">{p.title}</span>
                {p.meta_description ? <span className="gp-li-d">{p.meta_description}</span> : null}
                <span className="gp-li-m">{fmtDate(p.published_at)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <footer className="gp-foot">
        <a href="/verdict">Published with Marketing Genie — does AI recommend your business? →</a>
      </footer>
    </main>
  );
}
