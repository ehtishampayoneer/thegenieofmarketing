// lib/interlink.js
// ── INTERNAL-LINK ACCELERATION (old → new) ──
// When Genie publishes a NEW hosted page, it points 2-3 OLDER, topically-related
// pages AT it. Google recrawls trusted, already-indexed pages far more often than it
// discovers brand-new URLs, so a fresh link on an old page gets the new page found
// and indexed in days instead of weeks — and passes it a slice of that old page's
// ranking authority. This is the reverse of the new→old linking the writer already
// does, and it only touches pages Genie itself owns (the hosted Genie-Pages set), so
// it can never corrupt the user's own site.

import { pageUrl } from "@/lib/pages";

// Words too generic to signal topical relatedness.
const STOP = new Set(
  "the a an and or of for to in on at with your you our their this that from get how what why when where which who best top guide tips vs are is it as by about into more most new your".split(" ")
);

function keywords(str) {
  return String(str || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));
}

// newPage: { id, handle, slug, title, keyword }
export async function accelerateInternalLinks(supabase, { userId, host, newPage }) {
  const result = { linked: [], scanned: 0 };
  if (!userId || !host || !newPage?.id) return result;

  const newUrl = pageUrl(newPage.handle, newPage.slug);
  const seed = new Set([...keywords(newPage.title), ...keywords(newPage.keyword)]);
  if (seed.size === 0) return result;

  let candidates = [];
  try {
    const { data } = await supabase.from("published_pages")
      .select("id, handle, slug, title, target_keyword, body_html")
      .eq("user_id", userId).eq("host", host).eq("status", "published")
      .neq("id", newPage.id)
      .order("published_at", { ascending: false }).limit(40);
    candidates = data || [];
  } catch { return result; }
  result.scanned = candidates.length;

  // Only genuinely-related pages qualify — rank by shared keywords, keep the top few.
  const ranked = candidates
    .map((c) => {
      const w = new Set([...keywords(c.title), ...keywords(c.target_keyword)]);
      let overlap = 0;
      for (const x of w) if (seed.has(x)) overlap++;
      return { ...c, overlap };
    })
    .filter((c) => c.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3);

  const anchor = newPage.keyword || newPage.title;
  for (const c of ranked) {
    if (!c.body_html || c.body_html.includes(newUrl)) continue; // never double-link
    const inj = injectLink(c.body_html, anchor, newUrl, newPage.title);
    if (!inj.changed) continue;
    try {
      await supabase.from("published_pages")
        .update({ body_html: inj.html, updated_at: new Date().toISOString() })
        .eq("id", c.id).eq("user_id", userId);
      result.linked.push({ id: c.id, url: pageUrl(c.handle, c.slug), mode: inj.mode });
    } catch {}
  }
  return result;
}

// Inject exactly ONE natural link. Preference: wrap the keyword where it already
// appears in a clean paragraph (contextual, best for SEO). Fallback: a tasteful
// "Related" line at the end. One link per page keeps it whitehat, never spammy.
function injectLink(html, phrase, url, title) {
  const p = String(phrase || "").trim();
  if (p.length >= 3) { // >=3 so short buyer keywords (CRM, SEO, PPC, CMS) still wrap
    const re = new RegExp(`\\b(${escapeRe(p)})\\b`, "i");
    const paras = [...html.matchAll(/<p>([\s\S]*?)<\/p>/gi)];
    for (const pm of paras) {
      const inner = pm[1];
      if (/<a[\s>]/i.test(inner)) continue; // skip paragraphs that already link out
      if (!re.test(inner)) continue;
      const newInner = inner.replace(re, `<a href="${url}">$1</a>`);
      const out = html.slice(0, pm.index) + `<p>${newInner}</p>` + html.slice(pm.index + pm[0].length);
      return { html: out, changed: true, mode: "contextual" };
    }
  }
  const rel = `\n<p class="gp-related"><em>Related:</em> <a href="${url}">${escapeHtml(title)}</a></p>`;
  return { html: html + rel, changed: true, mode: "appended" };
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapeHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
