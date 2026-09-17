// app/api/connect/gsc/route.js
// Search Console, set up for the owner instead of by the owner.
//
// GET  -> where this site stands: already a property, ready to verify, or waiting
//         for the tag to go on the site.
// POST -> do as much as can be done now: ask Google for the verification tag,
//         install it if Genie's WordPress plugin is there, verify, and add the
//         property. Safe to press again: each step is skipped if already done.
//
// Nothing here writes to the owner's site except through Genie's own plugin.

import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { resolveGscProperty } from "@/lib/gsc";
import { getVerificationTag, verifyOwnership, addSearchConsoleProperty, installTagViaWordPress, propertyUrl } from "@/lib/gsc-setup";
import { connScopes } from "@/lib/gmail";
import { hostOf } from "@/lib/business";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function context(supabase, userId) {
  let host = "";
  try {
    const { data: scan } = await supabase.from("scans").select("final_url, url")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) host = hostOf(scan);
  } catch {}
  let google = null, wp = null;
  try {
    const { data } = await supabase.from("connections").select("*").eq("user_id", userId);
    for (const r of data || []) { if (r.provider === "google") google = r; if (r.provider === "wordpress") wp = r; }
  } catch {}
  return { host, google, wp };
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { host, google } = await context(supabase, user.id);
  if (!host) return json({ ok: true, state: "no_site" });
  if (!google) return json({ ok: true, state: "no_google", host });
  if (!connScopes(google).includes("siteverification")) return json({ ok: true, state: "needs_reconnect", host });

  const token = await getValidAccessToken(supabase, google);
  if (!token) return json({ ok: true, state: "needs_reconnect", host });
  const site = await resolveGscProperty(token, host);
  return json({ ok: true, state: site ? "ready" : "not_set_up", host, site: site || null });
}

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { host, google, wp } = await context(supabase, user.id);
  if (!host) return json({ ok: false, error: "Scan your website first." }, 400);
  if (!google) return json({ ok: false, needsGoogle: true, error: "Connect Google first." }, 400);
  if (!connScopes(google).includes("siteverification")) {
    return json({ ok: false, needsReconnect: true, error: "Genie needs one more Google permission to do this for you. Press Reconnect Google, approve, then try again." }, 400);
  }
  const token = await getValidAccessToken(supabase, google);
  if (!token) return json({ ok: false, needsReconnect: true, error: "Google access expired. Reconnect Google." }, 400);

  // Already a property? Then there is nothing to do.
  const existing = await resolveGscProperty(token, host);
  if (existing) {
    await remember(supabase, user.id, existing);
    return json({ ok: true, done: true, site: existing, message: `${host} is already connected to Search Console. Real rankings start appearing within a few days.` });
  }

  const tag = await getVerificationTag(token, host);
  if (!tag.ok) return json({ ok: false, error: `Google would not issue a verification tag: ${tag.error}` }, 400);

  // The owner's site is the one place Genie cannot write to — unless its own
  // plugin is installed, which is exactly what the plugin is for.
  let installedBy = null;
  if (wp) {
    const put = await installTagViaWordPress(wp, tag.content);
    if (put.ok) installedBy = "wordpress";
    else if (put.noPlugin) installedBy = "old_plugin";
  }

  if (installedBy === "wordpress") {
    // WordPress caches pages; give Google a moment to fetch a fresh copy.
    await new Promise((r) => setTimeout(r, 2500));
    const v = await verifyOwnership(token, host);
    if (v.ok) {
      const added = await addSearchConsoleProperty(token, host);
      if (added.ok) {
        await remember(supabase, user.id, propertyUrl(host));
        await logActivity(supabase, user.id, { host, verb: "connected", message: "Search Console set up automatically", detail: propertyUrl(host) });
        return json({ ok: true, done: true, via: "wordpress", site: propertyUrl(host), message: "Done. Genie verified your site with Google and added it to Search Console. Real rankings appear within a few days." });
      }
      return json({ ok: false, error: `Verified, but Google would not add the property: ${added.error}` }, 400);
    }
    return json({ ok: false, tag: tag.tag, error: "The tag is on your site but Google has not seen it yet. Wait a minute and press again (a caching plugin can delay it)." }, 200);
  }

  // No plugin: hand over one line to paste, and remember where we got to.
  return json({
    ok: true, done: false, tag: tag.tag, host,
    reason: installedBy === "old_plugin" ? "old_plugin" : "manual",
    message: "Add this one line to your site's <head>, then press Verify. Genie does the rest.",
  });
}

// The same route finishes the job after the owner has pasted the tag.
export async function PUT() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { host, google } = await context(supabase, user.id);
  if (!host || !google) return json({ ok: false, error: "Connect Google and scan your site first." }, 400);
  const token = await getValidAccessToken(supabase, google);
  if (!token) return json({ ok: false, needsReconnect: true, error: "Google access expired. Reconnect Google." }, 400);

  const v = await verifyOwnership(token, host);
  if (!v.ok) {
    return json({ ok: false, error: v.notFound ? "Google could not find the tag on your home page yet. Check it is saved and live, then try again." : `Google said: ${v.error}` }, 200);
  }
  const added = await addSearchConsoleProperty(token, host);
  if (!added.ok) return json({ ok: false, error: `Verified, but adding the property failed: ${added.error}` }, 400);
  await remember(supabase, user.id, propertyUrl(host));
  await logActivity(supabase, user.id, { host, verb: "connected", message: "Search Console verified and connected", detail: propertyUrl(host) });
  return json({ ok: true, done: true, site: propertyUrl(host), message: "Verified. Genie added your site to Search Console; real rankings appear within a few days." });
}

async function remember(supabase, userId, site) {
  try { await supabase.from("connections").update({ gsc_site: site }).eq("user_id", userId).eq("provider", "google"); } catch {}
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
