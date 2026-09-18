// app/api/connect/blog/route.js
// "Put my articles on my own site" for every site that is not WordPress.
//
// GET    -> where this stands (none / waiting for the rule / live), the folder,
//           the rule for each kind of host, and a guess at which one they use.
// POST   { path } -> choose the folder (default /blog). Articles start being served
//           at /b/<handle> immediately, ready for the rule to point at.
// PUT    -> check the rule is live: fetch yoursite.com/blog THROUGH the owner's
//           domain and look for Genie's marker. On success every article already
//           published moves to the owner's domain: recorded as live there, asked to
//           be indexed, and the blog's sitemap handed to Search Console.
// DELETE -> stop. Articles fall back to Genie Pages.

import { createClient } from "@/lib/supabase/server";
import { safeFetch } from "@/lib/ssrf";
import { hostOf } from "@/lib/business";
import { handleFor } from "@/lib/pages";
import { recordEvent } from "@/lib/events";
import { logActivity } from "@/lib/activity";
import {
  PROVIDER, normalizePath, rewriteSnippets, guessHosting, hasMarker, markerValue, blogConnection, ownArticleUrl, indexNowOptsFor,
} from "@/lib/own-blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function siteHost(supabase, userId) {
  try {
    const { data } = await supabase.from("scans").select("final_url, url")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ? hostOf(data) : "";
  } catch { return ""; }
}

async function authed() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await authed();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const host = await siteHost(supabase, user.id);
  if (!host) return json({ ok: true, state: "no_site" });
  const conn = await blogConnection(supabase, user.id);
  const meta = conn?.meta || null;
  const handle = meta?.handle || handleFor(host);
  const path = meta?.path || "/blog";

  let hosting = meta?.platform || null;
  if (!hosting) {
    try {
      const { res } = await safeFetch(`https://${host}`, { method: "GET", signal: AbortSignal.timeout(8000) });
      hosting = guessHosting(Object.fromEntries(res.headers.entries()));
    } catch {}
  }

  return json({
    ok: true,
    state: !meta ? "none" : meta.verifiedAt ? "live" : "waiting",
    host, path, handle,
    base: meta?.base || `https://${host}${path}`,
    verifiedAt: meta?.verifiedAt || null,
    hosting,
    snippets: rewriteSnippets({ path, handle }),
  });
}

export async function POST(request) {
  const { supabase, user } = await authed();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  let body = {};
  try { body = await request.json(); } catch {}

  const host = await siteHost(supabase, user.id);
  if (!host) return json({ ok: false, error: "Scan your website first, so Genie knows which site this is." }, 400);
  const p = normalizePath(body?.path || "/blog", host);
  if (!p.ok) return json({ ok: false, error: p.error }, 400);

  const handle = handleFor(host);
  const { error } = await supabase.from("connections").upsert({
    user_id: user.id, provider: PROVIDER,
    meta: { handle, host, path: p.path, base: null, verifiedAt: null, platform: body?.platform || null },
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider" });
  if (error) return json({ ok: false, error: "Genie could not save that. Open /diagnostics in Genie." }, 500);

  return json({ ok: true, state: "waiting", path: p.path, handle, snippets: rewriteSnippets({ path: p.path, handle }) });
}

export async function PUT() {
  const { supabase, user } = await authed();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const conn = await blogConnection(supabase, user.id);
  const meta = conn?.meta;
  if (!meta?.host || !meta?.path) return json({ ok: false, error: "Choose the folder first." }, 400);

  // Touch the row first, so if another account set up the same site this one is
  // the one /b serves while it is being checked.
  await supabase.from("connections").update({ updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("provider", PROVIDER);

  // Fetch through the owner's domain. A marker from Genie there proves the rule
  // works end to end, the same way Google will see it.
  const target = `https://${meta.host}${meta.path}`;
  let res, finalUrl, text = "";
  try {
    ({ res, finalUrl } = await safeFetch(target, { headers: { "User-Agent": "MarketingGenie/1.0 (+blog check)" }, signal: AbortSignal.timeout(15000) }));
    text = await res.text();
  } catch {
    return json({ ok: false, error: `Genie could not open ${target}. Check the site is online.` }, 400);
  }
  if (!hasMarker(text, markerValue(meta.handle, user.id))) {
    const why = res.status === 404
      ? `${target} still shows "not found", so the rule is not live yet. Deploys can take a minute or two.`
      : `${target} opened, but it is still your site's own page, not Genie's articles. The rule is not live yet, or another page is using ${meta.path}.`;
    return json({ ok: false, state: "waiting", error: why }, 400);
  }

  // Keep the exact origin the site answers on (www or not, after redirects), so
  // canonicals match what Google indexes.
  let base = target;
  try { const u = new URL(finalUrl || target); base = `${u.origin}${meta.path}`; } catch {}
  const verifiedAt = new Date().toISOString();
  await supabase.from("connections").update({ meta: { ...meta, base, verifiedAt }, updated_at: verifiedAt })
    .eq("user_id", user.id).eq("provider", PROVIDER);

  // Everything already published now lives on the owner's domain too.
  const { data: pages } = await supabase.from("published_pages").select("id, slug, title, host")
    .eq("user_id", user.id).eq("handle", meta.handle).eq("status", "published")
    .order("published_at", { ascending: false }).limit(200);
  const urls = [];
  for (const p of pages || []) {
    const url = ownArticleUrl(base, p.slug);
    urls.push(url);
    await recordEvent(supabase, {
      userId: user.id, host: p.host || meta.host, type: "publish.own_url", actor: "genie", subject: p.title,
      data: { pageId: p.id, url, via: "own_blog" }, dedupeKey: `ownurl:${p.id}:${url}`,
    });
  }

  let indexed = 0, sitemap = false;
  try { const { pingIndexNow } = await import("@/lib/indexnow"); if (urls.length) await pingIndexNow(urls, indexNowOptsFor(base)); } catch {}
  try {
    const { pingGoogleIndex } = await import("@/lib/google-index");
    for (const u of urls.slice(0, 20)) { const r = await pingGoogleIndex(supabase, user.id, u); if (r?.ok) indexed++; }
  } catch {}
  try { sitemap = await submitSitemap(supabase, user.id, meta.host, `${base}/sitemap.xml`); } catch {}

  await logActivity(supabase, user.id, {
    host: meta.host, verb: "connected", icon: "📝",
    message: `Your articles now live on ${base.replace(/^https?:\/\//, "")}`,
    detail: `${urls.length} article${urls.length === 1 ? "" : "s"} moved to your own domain. Every new one goes there automatically.`,
    meta: { base, articles: urls.length },
  });

  return json({ ok: true, state: "live", base, articles: urls.length, indexed, sitemap });
}

export async function DELETE() {
  const { supabase, user } = await authed();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  await supabase.from("connections").delete().eq("user_id", user.id).eq("provider", PROVIDER);
  return json({ ok: true, state: "none" });
}

// Hand the blog's sitemap to Search Console, so Google reads every article from
// the owner's property. Needs the webmasters scope; silently skipped otherwise.
async function submitSitemap(supabase, userId, host, sitemapUrl) {
  const { data: google } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
  if (!google) return false;
  const { getValidAccessToken } = await import("@/lib/google");
  const { resolveGscProperty } = await import("@/lib/gsc");
  const token = await getValidAccessToken(supabase, google);
  if (!token) return false;
  const site = await resolveGscProperty(token, host);
  if (!site) return false;
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(sitemapUrl)}`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  return res.ok;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
