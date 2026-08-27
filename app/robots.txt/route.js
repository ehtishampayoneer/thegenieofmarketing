// app/robots.txt/route.js
// Lets search + AI crawlers in and points them at the Genie Pages sitemap, so
// everything Genie publishes is discoverable. Complements IndexNow (instant push)
// with standard sitemap discovery (steady pull).

import { appBase } from "@/lib/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = appBase();
  // Explicitly welcome the major AI crawlers (GEO best practice) so ChatGPT,
  // Perplexity, Claude and Google's AI can read and cite published content, and point
  // everyone at both the sitemap (pull) and llms.txt (the AI content index).
  const aiBots = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "ClaudeBot", "Claude-Web", "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "meta-externalagent"];
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    ...aiBots.flatMap((b) => [`User-agent: ${b}`, "Allow: /", ""]),
    `Sitemap: ${base}/p/sitemap.xml`,
    `# AI content index: ${base}/llms.txt`,
    "",
  ].join("\n");
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
