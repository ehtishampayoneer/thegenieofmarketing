// lib/pillars.js
// ── TOPIC-CLUSTER PILLAR PAGES ──
// The strongest whitehat structure for topical authority: when Genie has published
// several related articles, it assembles an authoritative "pillar" hub page that
// links out to all of them, and each of those articles links back to the pillar.
// Google reads the hub-and-spoke as "this site owns this topic" and lifts the whole
// cluster. Scoped to the hosted Genie-Pages set (which Genie owns), so it can never
// touch the user's own site. One pillar per nightly run to respect the AI budget.

import { callAI } from "@/lib/ai-router";
import { pageUrl, slugify } from "@/lib/pages";
import { deDash } from "@/lib/markdown";

const STOP = new Set(
  "the a an and or of for to in on at with your you our their this that from get how what why when where which who best top guide tips vs are is it as by about into more most new near online free review reviews cheap".split(" ")
);
function themeTokens(s) {
  return String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));
}

// Find a cluster of >= minMembers related published pages that don't yet have a
// pillar. Returns { theme, pages:[{id,handle,slug,title,target_keyword}] } or null.
export async function findPillarOpportunity(supabase, userId, host, { minMembers = 3 } = {}) {
  // Existing pillars: their actions carry payload.isPillar. Skip their themes, and
  // exclude the pillar PAGES themselves from the member pool (via action_id).
  let pillarActionIds = new Set();
  let doneThemes = new Set();
  try {
    const { data: acts } = await supabase.from("actions").select("id, payload").eq("user_id", userId).contains("payload", { isPillar: true });
    for (const a of acts || []) { pillarActionIds.add(a.id); if (a.payload?.pillarTheme) doneThemes.add(a.payload.pillarTheme); }
  } catch {}

  let pages = [];
  try {
    const { data } = await supabase.from("published_pages")
      .select("id, handle, slug, title, target_keyword, action_id")
      .eq("user_id", userId).eq("host", host).eq("status", "published").limit(200);
    pages = (data || []).filter((p) => !pillarActionIds.has(p.action_id));
  } catch { return null; }
  if (pages.length < minMembers) return null;

  // Index theme-token -> pages, then take the richest cluster not already pillared.
  const idx = new Map();
  for (const p of pages) {
    for (const t of new Set(themeTokens(`${p.target_keyword || ""} ${p.title || ""}`))) {
      if (!idx.has(t)) idx.set(t, []);
      idx.get(t).push(p);
    }
  }
  let best = null;
  for (const [theme, ps] of idx) {
    if (doneThemes.has(theme) || ps.length < minMembers) continue;
    if (!best || ps.length > best.pages.length || (ps.length === best.pages.length && theme.length > best.theme.length)) {
      best = { theme, pages: ps };
    }
  }
  if (!best) return null;
  best.pages = best.pages.slice(0, 12);
  return best;
}

// Build a pillar for the best available cluster and drop it into Approvals as a
// proposed article (payload.isPillar). On approval it publishes like any page, and
// the execute route back-links every member to it. Returns { ok, theme, members }.
export async function buildPillar(supabase, userId, host, ai = {}) {
  const opp = await findPillarOpportunity(supabase, userId, host);
  if (!opp) return { ok: false, reason: "no_cluster" };

  const members = opp.pages.map((p) => ({ id: p.id, url: pageUrl(p.handle, p.slug), title: p.title || p.slug }));
  const themeLabel = opp.theme;
  const bizName = ai.businessName || String(host || "").replace(/^www\./, "").replace(/\..*$/, "");

  let out = {};
  try {
    const res = await callAI({
      system: "You are Genie, an expert SEO editor building a pillar (hub) page that ties a cluster of existing articles into one authoritative guide. Write like a sharp human, no em-dashes, no AI clichés. Return ONLY valid JSON.",
      json: true, maxTokens: 1600, temperature: 0.6,
      prompt:
`Business: ${bizName}${ai.whatTheySell ? ` — sells ${ai.whatTheySell}` : ""}.
Topic theme: "${themeLabel}".
These are the existing articles this pillar will link to (write ONE blurb per article, in the SAME order):
${members.map((m, i) => `${i + 1}. ${m.title}`).join("\n")}

Write the pillar hub page. Return ONLY this JSON:
{
  "title": "an authoritative, click-worthy title for the complete guide to this theme (not stuffed with the word 'pillar')",
  "metaDescription": "compelling meta description, 150-160 chars",
  "slug": "url-friendly-slug",
  "intro": "2-3 short markdown paragraphs that frame the topic around the reader's real problem and set up the guide (no headings, no em-dashes)",
  "blurbs": ["one vivid sentence per article, SAME order as listed, saying what the reader gets from it"],
  "closing": "one short closing paragraph nudging the reader to start with the most important article and reach out to ${bizName}",
  "imagePrompt": "a vivid, specific prompt for a photorealistic hero image (no text in image)",
  "heroImageAlt": "descriptive alt text"
}`,
    });
    out = res.json || {};
  } catch { return { ok: false, reason: "ai_failed" }; }

  const title = deDash((out.title || `The Complete Guide to ${themeLabel}`).toString().slice(0, 140));
  const blurbs = Array.isArray(out.blurbs) ? out.blurbs : [];
  const intro = deDash(String(out.intro || "").trim());
  const closing = deDash(String(out.closing || "").trim());

  // Assemble the body: intro, then a linked list of every member article, then close.
  // Colon separators (not em-dashes) to match the house style deDash enforces.
  const list = members.map((m, i) => `- **[${m.title}](${m.url})**: ${deDash(String(blurbs[i] || "").trim()) || "Read the full guide."}`).join("\n");
  const body = `${intro}\n\n## Everything in this guide\n\n${list}\n\n${closing}`;

  const payload = {
    title,
    metaTitle: (out.metaTitle || title).toString().slice(0, 60),
    metaDescription: deDash((out.metaDescription || "").toString().slice(0, 200)),
    slug: slugify(out.slug || `guide-to-${themeLabel}`),
    body,
    targetKeyword: themeLabel,
    isPillar: true,
    pillarTheme: themeLabel,
    pillarMembers: members,
    imagePrompt: out.imagePrompt || `A clean, inviting hero image representing ${themeLabel}`,
    heroImageAlt: out.heroImageAlt || title,
  };

  try {
    const { error } = await supabase.from("actions").insert({
      user_id: userId, type: "article",
      title: `Topic hub: ${title}`,
      payload,
      target: { platform: "website", host: host || null },
      priority: "strategic", status: "proposed",
    });
    if (error) return { ok: false, reason: "insert_failed", error: error.message };
  } catch (e) { return { ok: false, reason: "insert_failed", error: String(e?.message || e) }; }

  try {
    const { logActivity } = await import("@/lib/activity");
    await logActivity(supabase, userId, {
      host, verb: "writing", icon: "🏛️",
      message: `Built a topic hub tying ${members.length} of your pages into one authoritative guide on ${themeLabel}`,
      detail: "Pillar page — the hub-and-spoke structure Google reads as topical authority. Approve it to publish.",
      meta: { pillar: true, theme: themeLabel, members: members.length },
    });
  } catch {}

  return { ok: true, theme: themeLabel, members: members.length, title };
}

// After a pillar publishes, add a "part of this guide" backlink from every member
// page to the pillar (skipping any that already link to it). Returns { linked:[urls] }.
export async function linkMembersToPillar(supabase, userId, { pillarUrl, pillarTitle, members = [] }) {
  const linked = [];
  for (const m of members) {
    if (!m?.id) continue;
    try {
      const { data: page } = await supabase.from("published_pages").select("id, handle, slug, body_html").eq("id", m.id).eq("user_id", userId).maybeSingle();
      if (!page || !page.body_html || page.body_html.includes(pillarUrl)) continue;
      const block = `\n<p class="gp-pillar-link">Part of our complete guide: <a href="${pillarUrl}">${escapeHtml(pillarTitle)}</a></p>`;
      await supabase.from("published_pages").update({ body_html: page.body_html + block, updated_at: new Date().toISOString() }).eq("id", page.id).eq("user_id", userId);
      linked.push(pageUrl(page.handle, page.slug));
    } catch {}
  }
  return { linked };
}

function escapeHtml(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
