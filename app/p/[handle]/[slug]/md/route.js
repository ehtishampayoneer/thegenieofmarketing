// app/p/[handle]/[slug]/md/route.js
// ── MARKDOWN MIRROR ──
// A clean, plain-markdown version of a published Genie Page — just the title, lede,
// body and FAQ, with none of the nav, styling, CTAs or scripts. AI answer engines
// (ChatGPT, Perplexity, Claude, Gemini) extract facts far more reliably from clean
// markdown than from a full HTML page, so exposing this mirror makes Genie's pages
// easier to read — and cite. Linked from the HTML page's <head> (rel=alternate) and
// listed in /llms.txt. Read via the service-role admin client; published rows only.

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedPage, pageUrl } from "@/lib/pages";
import { htmlToMarkdown } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  let page = null;
  try { page = await getPublishedPage(createAdminClient(), params.handle, params.slug); } catch {}
  if (!page) return new Response("# Not found\n", { status: 404, headers: mdHeaders() });

  const url = pageUrl(page.handle, page.slug);
  const author = page.business_name || page.host || "";
  const body = htmlToMarkdown(page.body_html || "");
  const faq = Array.isArray(page.faq) ? page.faq.filter((f) => f && f.q && f.a) : [];

  const lines = [
    "---",
    `title: ${clean(page.title)}`,
    page.meta_description ? `description: ${clean(page.meta_description)}` : null,
    author ? `source: ${clean(author)}` : null,
    `canonical: ${url}`,
    page.published_at ? `published: ${new Date(page.published_at).toISOString().slice(0, 10)}` : null,
    page.target_keyword ? `topic: ${clean(page.target_keyword)}` : null,
    "---",
    "",
    `# ${clean(page.title)}`,
    "",
    page.meta_description ? `> ${clean(page.meta_description)}` : null,
    page.meta_description ? "" : null,
    body,
  ];

  if (faq.length) {
    lines.push("", "## FAQ", "");
    for (const f of faq) lines.push(`### ${clean(f.q)}`, "", clean(f.a), "");
  }
  if (page.host) lines.push("", "---", "", `More from ${clean(author)}: https://${page.host}`);

  const text = lines.filter((l) => l != null).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return new Response(text, { status: 200, headers: mdHeaders() });
}

function mdHeaders() {
  return {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "X-Robots-Tag": "all", // explicitly let AI/search crawlers read the mirror
  };
}
function clean(s) { return String(s || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim(); }
