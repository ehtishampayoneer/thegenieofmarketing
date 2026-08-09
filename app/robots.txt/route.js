// app/robots.txt/route.js
// Lets search + AI crawlers in and points them at the Genie Pages sitemap, so
// everything Genie publishes is discoverable. Complements IndexNow (instant push)
// with standard sitemap discovery (steady pull).

import { appBase } from "@/lib/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = appBase();
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    `Sitemap: ${base}/p/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
