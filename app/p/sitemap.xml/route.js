// app/p/sitemap.xml/route.js
// A sitemap of every published Genie Page, so search engines (and the crawlers AI
// search reads) discover them. Served at /p/sitemap.xml. Read via the service-role
// admin client; degrades to an empty-but-valid sitemap if the DB isn't reachable.

import { createAdminClient } from "@/lib/supabase/admin";
import { appBase } from "@/lib/pages";
import { verifiedBlogs } from "@/lib/own-blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let rows = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("published_pages")
      .select("user_id, handle, slug, updated_at, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(5000);
    // Articles whose owner serves them on their own blog are listed in THAT
    // sitemap (yoursite.com/blog/sitemap.xml); listing the Genie copy here would
    // ask Google to index the duplicate.
    const own = await verifiedBlogs(admin);
    rows = (data || []).filter((r) => !own.has(`${r.user_id}:${r.handle}`));
  } catch {}

  const base = appBase();
  const body = rows.map((r) => {
    const loc = `${base}/p/${enc(r.handle)}/${enc(r.slug)}`;
    const lastmod = new Date(r.updated_at || r.published_at || Date.now()).toISOString();
    return `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

function enc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
