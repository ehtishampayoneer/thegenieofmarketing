// app/api/px/lead/route.js
// ── ON-SITE LEAD CAPTURE ──
// The visitor who liked what they saw but wasn't ready to buy today. Before
// this, Genie could measure a sale on the owner's site (/api/px/conversion) but
// had no way to catch the people who didn't convert — they simply left, and the
// owner never knew who they were.
//
// A captured lead becomes three things at once:
//   • a lead.captured event on the ledger (so it counts in the traffic panel)
//   • an unread notification, kind "lead" (the bell in the shell header and the
//     /notifications page — NOT the Inbox, which is scoped to outreach threads
//     from outreach_log)
//   • an activity line (so "Genie caught you a lead" shows in the live stream)
//
// Genie does not sell to this person and does not take payment. It hands the
// owner a name and an address so THEY can close it.

import { createAdminClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/events";
import { logActivity } from "@/lib/activity";
import { userFromToken, resolveHost, limited, refHost, safePath, cleanEmail, corsJson, CORS } from "@/lib/onsite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let body = {};
  try { body = await request.json(); }
  catch { try { body = JSON.parse(await request.text()); } catch {} }

  const k = body.k;
  const userId = userFromToken(k);
  if (!userId) return corsJson({ ok: false, error: "bad_token" }, 401);
  // Much tighter than pageviews: a real person filling a form a few times a
  // minute is plausible, a script submitting hundreds is not.
  if (limited(k, { max: 20 })) return corsJson({ ok: false, error: "rate_limited" }, 429);

  const email = cleanEmail(body.email);
  if (!email) return corsJson({ ok: false, error: "We need a valid email address." }, 400);

  // Honeypot: the embed renders a hidden field real people never see. Anything
  // that fills it is a bot, so accept the request and quietly drop it — telling
  // a bot it failed only teaches it to try again.
  if (String(body.hp || "").trim()) return corsJson({ ok: true });

  const name = String(body.name || "").trim().slice(0, 120) || null;
  const message = String(body.message || "").trim().slice(0, 1000) || null;

  let admin;
  try { admin = createAdminClient(); } catch { return corsJson({ ok: false }, 500); }

  const host = await resolveHost(admin, userId, body.url);
  const path = safePath(body.url);

  try {
    await recordEvent(admin, {
      userId, host,
      type: "lead.captured",
      actor: "genie",
      subject: email,
      data: { email, name, message, path, ref: refHost(body.referrer), source: "onsite" },
      // One lead per email per page per day: a person who submits twice is not
      // two leads, and this keeps a double-click from creating duplicates.
      dedupeKey: `lead:${email}:${path}:${new Date().toISOString().slice(0, 10)}`,
    });
  } catch { return corsJson({ ok: false }, 500); }

  // Surface it where the owner already looks for things needing a reply.
  try {
    await admin.from("notifications").insert({
      user_id: userId, host, kind: "lead", priority: 1,
      title: `New lead from your website: ${name || email}`,
      body: message || `${email} asked to hear from you${path && path !== "/" ? ` (from ${path})` : ""}.`,
      action_url: `mailto:${email}`,
      status: "unread",
    });
  } catch {}

  try {
    await logActivity(admin, userId, {
      host, verb: "traction",
      message: "Caught you a lead on your website",
      detail: `${name ? `${name} · ` : ""}${email}`,
      meta: { source: "onsite", path },
    });
  } catch {}

  return corsJson({ ok: true });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
