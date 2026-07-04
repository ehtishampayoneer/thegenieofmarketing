// app/api/connect/wordpress/route.js
// F3a — WordPress connection.
// POST   { siteUrl, username, appPassword } → validates against the site's
//        REST API, stores the connection.
// GET    → connection status.
// DELETE → disconnect.
// Requires a self-hosted WordPress 5.6+ site with Application Passwords
// (WordPress.com free plans don't support them).

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, connected: false });

  const { data } = await supabase
    .from("connections")
    .select("meta, created_at")
    .eq("user_id", user.id)
    .eq("provider", "wordpress")
    .maybeSingle();

  return json({
    ok: true,
    connected: !!data,
    siteUrl: data?.meta?.siteUrl || null,
    username: data?.meta?.username || null,
  });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }

  let { siteUrl, username, appPassword } = body || {};
  if (!siteUrl || !username || !appPassword) {
    return json({ ok: false, error: "Site URL, username, and application password are all required." }, 400);
  }

  // Normalize the site URL.
  siteUrl = String(siteUrl).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(siteUrl)) siteUrl = "https://" + siteUrl;
  appPassword = String(appPassword).trim();

  // Validate against the WordPress REST API.
  const auth = "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64");
  let me;
  try {
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) {
      return json({ ok: false, error: "WordPress rejected those credentials. Check the username and application password." }, 400);
    }
    if (!res.ok) {
      return json({ ok: false, error: `Couldn't reach the WordPress REST API (status ${res.status}). Is this a WordPress site with the REST API enabled?` }, 400);
    }
    me = await res.json();
  } catch {
    return json({ ok: false, error: "Couldn't reach that site. Check the URL (it must be a live WordPress site)." }, 400);
  }

  // Confirm the account can publish posts.
  const caps = me?.capabilities || {};
  if (!caps.publish_posts && !caps.edit_posts) {
    return json({ ok: false, error: `Connected as ${me?.name || username}, but that account can't publish posts. Use an Author/Editor/Admin account.` }, 400);
  }

  const { error } = await supabase.from("connections").upsert(
    {
      user_id: user.id,
      provider: "wordpress",
      access_token: appPassword, // protected by RLS; app-level encryption in the pre-launch hardening pass
      meta: { siteUrl, username, wpUserId: me?.id || null, wpName: me?.name || null },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, siteUrl, username, name: me?.name || username });
}

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false }, 401);

  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "wordpress");

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
