// lib/refresh.js
// ── CONTENT REFRESH LOOP ──
// Publish-once-and-forget leaves ranking on the table: pages age, competitors move,
// and Google rewards freshness. This finds the stalest published pages and produces
// an improved, EXPANDED version that republishes IN PLACE (same URL) — the cheapest
// ranking lever there is, on content you already own. Client-agnostic: the user's
// RLS client (manual "refresh now") or the admin client (nightly loop) both work.

import { callAI } from "@/lib/ai-router";
import { deDash } from "@/lib/markdown";

const PAGE_COLS = "id, title, slug, handle, host, target_keyword, meta_description, hero_image, hero_alt, published_at, updated_at, body_html, faq";
const daysSince = (iso) => { try { return (Date.now() - new Date(iso).getTime()) / 86400000; } catch { return 0; } };

// Stalest published pages first (longest since last touched = best refresh candidate).
export async function findRefreshCandidates(supabase, userId, host, { limit = 3 } = {}) {
  let q = supabase.from("published_pages").select(PAGE_COLS)
    .eq("user_id", userId).eq("status", "published")
    .order("updated_at", { ascending: true }).limit(limit);
  if (host) q = q.eq("host", host);
  const { data } = await q;
  return data || [];
}

// Improve the stalest page (or a specific pageId) and stage it as a "refresh" article
// action. minStaleDays gates the nightly loop; pass 0 for a manual "refresh now".
export async function refreshStalePage(supabase, { userId, host = null, pageId = null, minStaleDays = 0 } = {}) {
  let page = null;
  if (pageId) {
    const { data } = await supabase.from("published_pages").select(PAGE_COLS).eq("id", pageId).eq("user_id", userId).maybeSingle();
    page = data || null;
  } else {
    const cands = await findRefreshCandidates(supabase, userId, host, { limit: 1 });
    page = cands[0] || null;
    if (page && daysSince(page.updated_at || page.published_at) < minStaleDays) page = null;
  }
  if (!page) return { ok: false, reason: "no_stale_page" };

  // Don't stack duplicate refresh drafts for the same page (the nightly loop would
  // otherwise re-queue it every night until the owner approves).
  try {
    const { data: pending } = await supabase.from("actions").select("id")
      .eq("user_id", userId).eq("type", "article").eq("status", "proposed")
      .contains("payload", { refreshPageId: page.id }).limit(1);
    if (pending?.length) return { ok: false, reason: "already_queued", pageId: page.id };
  } catch {}

  const existing = String(page.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
  const prompt = `You are refreshing an existing published article so it ranks better and stays current. Improve and EXPAND it, do not just reword: add genuinely new, useful sections; update anything that reads dated; make it the single best, most complete answer for the target search; keep what already works. Same topic and intent.

TARGET SEARCH: "${page.target_keyword || page.title}"
CURRENT TITLE: ${page.title}
CURRENT ARTICLE (plain text):
${existing}

Write like a sharp human, not an AI. No em-dashes. No clichés or filler. Return ONLY this JSON:
{
  "title": "the same or an improved SEO title",
  "metaTitle": "SEO meta title (<60 chars)",
  "metaDescription": "compelling meta description (150-160 chars)",
  "body": "the full improved article in markdown, longer and more useful than the original, opening with the reader's problem, with ## H2 sections and a short ## FAQ section. No em-dashes.",
  "faq": [{ "q": "a real buyer question", "a": "a concise, quotable answer" }]
}`;

  let data;
  try {
    const r = await callAI({ system: "You are Genie, an expert SEO content writer. Return ONLY valid JSON, no markdown fences.", json: true, maxTokens: 4000, temperature: 0.7, prompt });
    data = r.json;
  } catch (e) { return { ok: false, reason: "ai_failed", error: String(e?.message || e) }; }
  if (!data?.body) return { ok: false, reason: "no_output" };

  const faq = Array.isArray(data.faq) ? data.faq.filter((f) => f && f.q && f.a).slice(0, 6).map((f) => ({ q: deDash(String(f.q)), a: deDash(String(f.a)) })) : (page.faq || null);
  const row = {
    user_id: userId, host: page.host, type: "article", status: "proposed",
    title: `Refresh: ${deDash(data.title || page.title)}`,
    target: { platform: "website", host: page.host },
    priority: "quick_win",
    payload: {
      title: deDash(data.title || page.title),
      metaTitle: data.metaTitle || null,
      metaDescription: deDash(data.metaDescription || page.meta_description || ""),
      body: deDash(data.body),
      faq,
      targetKeyword: page.target_keyword || null,
      slug: page.slug, handle: page.handle,
      heroImage: page.hero_image || null, heroImageAlt: page.hero_alt || null, imageSource: "site",
      refresh: true, refreshPageId: page.id,
      rationale: `This page hasn't been updated in ${Math.round(daysSince(page.updated_at || page.published_at))} days. Google rewards freshness, so I expanded and updated it to defend and grow its ranking, at the same URL.`,
    },
  };
  const { data: inserted } = await supabase.from("actions").insert(row).select("id").maybeSingle();
  return { ok: true, actionId: inserted?.id || null, title: row.title, pageId: page.id };
}
