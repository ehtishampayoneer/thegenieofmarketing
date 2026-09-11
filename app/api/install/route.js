// app/api/install/route.js
// GET  -> which platform this site runs on, the named steps for it, and the tag.
// POST -> email those instructions to whoever looks after the site.
//
// The snippet was always the weakest moment in onboarding: a line of code and
// "paste this before </body>", handed to someone who does not edit websites and
// is afraid of breaking theirs. Detecting the platform turns that into three
// clicks they can actually find, and the email covers everyone who has a
// developer or agency and would rather just forward it.

import { createClient } from "@/lib/supabase/server";
import { makeIngestToken } from "@/lib/commerce";
import { detectPlatform, installEmail, GENERIC_PLATFORM } from "@/lib/install-guide";
import { hostOf } from "@/lib/business";
import { safeFetch } from "@/lib/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function context(supabase, userId, origin) {
  const token = makeIngestToken(userId);
  const src = `${origin}/api/embed?k=${token}`;

  let host = null, site = null;
  try {
    const { data: scan } = await supabase.from("scans").select("final_url, url")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { host = hostOf(scan); site = scan.final_url || scan.url || null; }
  } catch {}

  // Platform detection needs raw HTML markers (cdn.shopify.com, wp-content and
  // so on), which the stored page_text deliberately does not contain, so this
  // fetches the page. One request when the panel is opened, not per pageview.
  let html = "";
  if (site) {
    try {
      const r = await safeFetch(site, { signal: AbortSignal.timeout(9000) });
      if (r?.ok) html = (await r.text()).slice(0, 200000);
    } catch {}
  }

  return { token, src, host, site, platform: html ? detectPlatform(html) : GENERIC_PLATFORM };
}

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const origin = process.env.APP_URL || new URL(request.url).origin;
  const { src, host, site, platform } = await context(supabase, user.id, origin);

  return json({
    ok: true,
    tag: `<script src="${src}" async></script>`,
    src, host, site,
    platform: { id: platform.id, name: platform.name, steps: platform.steps },
    // Only WordPress gets the one-file plugin, because it is the only platform
    // where uploading a plugin is easier than pasting into a settings box.
    plugin: platform.id === "wordpress" ? "/api/install/plugin" : null,
  });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body = {};
  try { body = await request.json(); } catch {}
  const to = String(body.to || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)) {
    return json({ ok: false, error: "That does not look like an email address." }, 400);
  }

  const origin = process.env.APP_URL || new URL(request.url).origin;
  const { src, site, platform } = await context(supabase, user.id, origin);

  let from = "";
  try {
    const { data: prof } = await supabase.from("profiles")
      .select("sender_name, company_name").eq("id", user.id).maybeSingle();
    from = prof?.sender_name || prof?.company_name || "";
  } catch {}

  const { subject, body: text } = installEmail({ src, platform, site, from });

  // Goes through the same sender as everything else: the owner's own Gmail when
  // connected. This is a message from them to their own developer, so it should
  // come from their address, not from Genie.
  try {
    const { deliverEmail } = await import("@/lib/email-engine");
    const r = await deliverEmail(supabase, user.id, { to, subject, body: text });
    if (!r.ok) {
      return json({
        ok: false,
        needsSender: !!(r.needsSender || r.needsConfig),
        error: r.error || "Could not send that just now.",
      }, 200);
    }
    return json({ ok: true, sentTo: to, via: r.via || null });
  } catch {
    return json({ ok: false, error: "Could not send that just now." }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
