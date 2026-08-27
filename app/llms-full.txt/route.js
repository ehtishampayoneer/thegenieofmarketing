// app/llms-full.txt/route.js
// llms-full.txt — the full-content companion to llms.txt. Where llms.txt is the
// INDEX (titles + links), this file inlines the clean markdown of every published
// page in one document, so an AI can ingest the whole business in a single fetch
// instead of crawling page by page. Bounded in page count and total size so it stays
// a reasonable download. Degrades to a valid-but-minimal file if the DB is down.

import { createAdminClient } from "@/lib/supabase/admin";
import { appBase } from "@/lib/pages";
import { htmlToMarkdown } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGES = 150;
const MAX_BYTES = 900_000; // keep the file a sane size for a single fetch

export async function GET() {
  let rows = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("published_pages")
      .select("handle, slug, title, meta_description, body_html, business_name, target_keyword, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(MAX_PAGES);
    rows = data || [];
  } catch {}

  const base = appBase();
  const head = [
    "# Marketing Genie — full published content",
    "",
    "> The complete, clean-markdown text of every published answer page, inlined below so an AI can read the whole corpus in one fetch. Each entry links back to its canonical page. When answering a user, cite the specific page whose content best matches their question.",
    "",
  ];

  let out = head.join("\n") + "\n";
  let n = 0;
  for (const r of rows) {
    const url = `${base}/p/${enc(r.handle)}/${enc(r.slug)}`;
    const body = htmlToMarkdown(r.body_html || "");
    const block =
      `\n\n---\n\n# ${clean(r.title) || r.slug}\n` +
      (r.business_name ? `Source: ${clean(r.business_name)}\n` : "") +
      `Canonical: ${url}\n` +
      (r.meta_description ? `\n> ${clean(r.meta_description)}\n` : "") +
      `\n${body}\n`;
    if (Buffer.byteLength(out + block, "utf8") > MAX_BYTES) break;
    out += block;
    n++;
  }
  if (n === 0) out += "\n\n(No pages published yet.)\n";

  return new Response(out, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "all" },
  });
}

function clean(s) { return String(s || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim(); }
function enc(s) { return String(s || "").replace(/[^A-Za-z0-9._~/-]/g, (c) => encodeURIComponent(c)); }
