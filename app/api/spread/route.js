// app/api/spread/route.js
// GET            -> your published articles, what each is already spread to, and
//                   the URL on your own site if you have given one.
// POST { pageId } -> write the per-channel versions for one article (one AI call,
//                   cached in the ledger so pressing again costs nothing).
// PUT  { pageId, channel }        -> record that you posted it there.
// PUT  { pageId, ownUrl }         -> record where it lives on your own site, and
//                                    ask Google to crawl that page.
//
// Nothing here posts anything anywhere. Genie writes; you paste.

import { createClient } from "@/lib/supabase/server";
import { resolveRadarUser } from "@/lib/radar-auth";
import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { recordEvent, getEvents } from "@/lib/events";
import { spreadPrompt, normalizePack, CHANNEL_INDEX } from "@/lib/spread";
import { genieBrain } from "@/lib/brain";
import { pageUrl } from "@/lib/pages";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data: pages } = await supabase.from("published_pages")
    .select("id, title, handle, slug, target_keyword, published_at, host")
    .eq("user_id", user.id).order("published_at", { ascending: false }).limit(20);

  const events = await getEvents(supabase, { userId: user.id, types: ["spread.pack", "spread.posted", "publish.own_url"], limit: 400 });
  const byPage = {};
  for (const e of events) {
    const id = e.data?.pageId;
    if (!id) continue;
    const slot = (byPage[id] ||= { pack: null, posted: [], ownUrl: null });
    if (e.type === "spread.pack" && !slot.pack) slot.pack = e.data.pack || null;
    if (e.type === "spread.posted" && !slot.posted.includes(e.data.channel)) slot.posted.push(e.data.channel);
    if (e.type === "publish.own_url" && !slot.ownUrl) slot.ownUrl = e.data.url || null;
  }

  return json({
    ok: true,
    articles: (pages || []).map((p) => ({
      id: p.id, title: p.title, keyword: p.target_keyword, publishedAt: p.published_at,
      geniePage: pageUrl(p.handle, p.slug),
      ...(byPage[p.id] || { pack: null, posted: [], ownUrl: null }),
    })),
  });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  // The nightly run prepares these too, so the owner opens the page and the
  // versions are already written.
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  const user = { id: userId };
  const pageId = String(body?.pageId || "");
  if (!pageId) return json({ ok: false, error: "Which article?" }, 400);

  const { data: page } = await supabase.from("published_pages")
    .select("id, title, body_html, handle, slug, host").eq("id", pageId).eq("user_id", user.id).maybeSingle();
  if (!page) return json({ ok: false, error: "Article not found." }, 404);

  // Written once and kept: pressing the button again should cost nothing. Search
  // the saved packs for THIS article, not just the newest one, or every article
  // after the first would be rewritten (and paid for) on every press.
  const saved = await getEvents(supabase, { userId: user.id, types: ["spread.pack"], limit: 200 });
  const cached = saved.find((e) => e?.data?.pageId === pageId)?.data?.pack || null;
  if (cached?.length) return json({ ok: true, pack: cached, cached: true });

  // THE PLAN. This read the newest scan for the account with no host filter, so
  // an owner who had also scanned a competitor could get that business's details
  // spread across five platforms. The brain resolves the scan for THIS host and
  // brings the plan with it, so every version argues what the article argues.
  const brain = await genieBrain(supabase, { userId: user.id, host: page.host || null });
  const ai = brain.ai || {};

  const owns = await getEvents(supabase, { userId: user.id, types: ["publish.own_url"], limit: 200 });
  const ownUrl = owns.find((e) => e?.data?.pageId === pageId)?.data?.url || null;
  const article = { title: page.title, body: String(page.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };

  let pack;
  try {
    const r = await callAI({
      system: "You rewrite one article for different platforms. Each version must stand on its own, sound like a person, and never invent facts. Return ONLY valid JSON.",
      json: true, maxTokens: 6000, temperature: 0.6, timeoutMs: 60000,
      prompt: spreadPrompt({ article, ai, canonical: pageUrl(page.handle, page.slug), ownUrl, plan: brain.block }),
      ctx: { supabase, userId: user.id, host: page.host || hostOf(page.host || ""), tag: "spread" },
    });
    pack = normalizePack(r.json || {});
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, error: "Every AI is busy right now. Try again in a minute." }, 503);
    return json({ ok: false, error: "Couldn't write those versions just now." }, 500);
  }
  if (!pack.length) return json({ ok: false, error: "Nothing usable came back. Try again." }, 502);

  await recordEvent(supabase, { userId: user.id, host: page.host || null, type: "spread.pack", actor: "genie", subject: page.title, data: { pageId, pack } });
  return json({ ok: true, pack });
}

export async function PUT(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body = {};
  try { body = await request.json(); } catch {}
  const pageId = String(body?.pageId || "");
  if (!pageId) return json({ ok: false, error: "Which article?" }, 400);

  const { data: page } = await supabase.from("published_pages").select("id, host, title").eq("id", pageId).eq("user_id", user.id).maybeSingle();
  if (!page) return json({ ok: false, error: "Article not found." }, 404);

  // "I put it on my own site" — the version that actually builds their ranking.
  if (body?.ownUrl) {
    let url = String(body.ownUrl).trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch { return json({ ok: false, error: "That doesn't look like a web address." }, 400); }
    await recordEvent(supabase, { userId: user.id, host: page.host || null, type: "publish.own_url", actor: "human", subject: page.title, data: { pageId, url } });
    // Ask Google to crawl the owner's page, not Genie's copy of it.
    let indexed = false;
    try {
      const { data: conn } = await supabase.from("connections").select("*").eq("user_id", user.id).eq("provider", "google").maybeSingle();
      if (conn) {
        const { pingGoogleIndex } = await import("@/lib/google-index");
        const r = await pingGoogleIndex(supabase, user.id, url).catch(() => null);
        indexed = !!r?.ok;
      }
    } catch {}
    return json({ ok: true, url, indexed });
  }

  const channel = String(body?.channel || "");
  if (!CHANNEL_INDEX[channel]) return json({ ok: false, error: "Unknown channel." }, 400);
  await recordEvent(supabase, {
    userId: user.id, host: page.host || null, type: "spread.posted", actor: "human", subject: channel,
    data: { pageId, channel }, dedupeKey: `spread:${pageId}:${channel}`,
  });
  return json({ ok: true, channel });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
