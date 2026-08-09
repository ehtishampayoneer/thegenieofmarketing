// app/p/[handle]/rss.xml/route.js
// A free RSS feed of a business's Genie Pages — syndication to readers, feed
// aggregators, and crawlers, at /p/<handle>/rss.xml. Read via the admin client;
// degrades to an empty-but-valid feed if the DB isn't reachable.

import { createAdminClient } from "@/lib/supabase/admin";
import { listPublishedPages, appBase } from "@/lib/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const handle = params.handle;
  let pages = [];
  try { pages = await listPublishedPages(createAdminClient(), handle, 50); } catch {}

  const base = appBase();
  const site = `${base}/p/${enc(handle)}`;
  const name = pages[0]?.business_name || handle;
  const items = pages.map((p) => {
    const link = `${base}/p/${enc(handle)}/${enc(p.slug)}`;
    return `    <item>
      <title>${enc(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(p.published_at || Date.now()).toUTCString()}</pubDate>
      <description>${enc(p.meta_description || "")}</description>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
    <title>${enc(name)} — Articles &amp; answers</title>
    <link>${site}</link>
    <description>Guides and answers from ${enc(name)}.</description>
${items}
  </channel></rss>`;

  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

function enc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
