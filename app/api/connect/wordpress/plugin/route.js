// app/api/connect/wordpress/plugin/route.js
// The Genie WordPress plugin posts here when the owner presses "Connect to
// Marketing Genie" inside wp-admin. WordPress creates the application password
// itself, so the owner never has to find, create or copy one.
//
// Trust: the plugin carries the same signed per-user token as the tracking
// snippet, so the connection can only ever be written to the account that
// downloaded that plugin. The credentials are proven by using them: Genie signs
// in to the site before saving anything.

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyIngestToken } from "@/lib/commerce";
import { safeFetch } from "@/lib/ssrf";
import { logActivity } from "@/lib/activity";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}

  const userId = verifyIngestToken(String(body?.token || ""));
  if (!userId) return json({ ok: false, error: "This plugin copy is not linked to a Genie account. Download it again from Marketing Genie." }, 401);

  let siteUrl = String(body?.siteUrl || "").trim().replace(/\/+$/, "");
  const username = String(body?.username || "").trim();
  const appPassword = String(body?.appPassword || "").trim();
  if (!siteUrl || !username || !appPassword) return json({ ok: false, error: "The plugin sent an incomplete connection." }, 400);
  if (!/^https?:\/\//i.test(siteUrl)) siteUrl = `https://${siteUrl}`;

  // Prove the credentials work, and that this account may publish, before saving.
  // context=edit because WordPress only reports capabilities in that context.
  let me;
  try {
    const { res } = await safeFetch(`${siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
      headers: { Authorization: "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64") },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) return json({ ok: false, error: "WordPress would not accept the password it just created. Check that application passwords are enabled." }, 400);
    if (!res.ok) return json({ ok: false, error: `The WordPress REST API answered ${res.status}. It may be blocked by a security plugin.` }, 400);
    me = await res.json();
  } catch (e) {
    return json({ ok: false, error: `Genie could not reach ${siteUrl} from the internet. If the site is private or local, connect it once it is live.` }, 400);
  }

  const caps = me?.capabilities || {};
  if (!caps.publish_posts && !caps.edit_posts) {
    return json({ ok: false, error: `Connected as ${me?.name || username}, but that account cannot publish posts. Press Connect while signed in as an Administrator or Editor.` }, 400);
  }

  // The admin client: the plugin's request carries no browser session.
  const admin = createAdminClient();
  const { error } = await admin.from("connections").upsert({
    user_id: userId,
    provider: "wordpress",
    access_token: appPassword,
    meta: { siteUrl, username, wpUserId: me?.id || null, wpName: me?.name || null, via: "plugin" },
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider" });
  if (error) return json({ ok: false, error: "Genie could not save the connection. Open /diagnostics in Genie." }, 500);

  await logActivity(admin, userId, {
    host: hostOf(siteUrl), verb: "connected", icon: "🔌",
    message: "Your WordPress blog is connected", detail: `${siteUrl} as ${me?.name || username}`, meta: { via: "plugin" },
  });

  return json({ ok: true, site: siteUrl, name: me?.name || username });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
