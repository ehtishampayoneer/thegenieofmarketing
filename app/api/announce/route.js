// app/api/announce/route.js
// ── SENDING SOMETHING OF YOUR OWN ──
// GET  -> the audiences, how many people are in each, and what today's allowance is.
// POST -> send one message to one audience, obeying every rule the nightly run obeys.
//
// Genie writes first-contact pitches and follow-ups. It knows nothing about your
// stock, your margins or your seasons, so it cannot decide to run an offer — and
// until now there was no way to tell it you had. This is that: the owner's words,
// Genie's sending discipline.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { sentToday, deliverEmail } from "@/lib/email-engine";
import { effectiveDailyCap } from "@/lib/sending-ramp";
import { isSuppressed, unsubUrl } from "@/lib/compliance";
import { AUDIENCES, MAX_RECIPIENTS, audienceFor, checkAnnouncement, reachNote } from "@/lib/announce";
import { logActivity } from "@/lib/activity";
import { recordEvent } from "@/lib/events";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function planOf(supabase, userId) {
  try {
    const { data } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
    return data?.plan === "pro" ? "pro" : "free";
  } catch { return "free"; }
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const plan = await planOf(supabase, user.id);
  const { cap, ramping, reason } = await effectiveDailyCap(supabase, user.id, plan);
  const used = await sentToday(supabase, user.id);
  const left = Math.max(0, cap - used);

  const audiences = [];
  for (const [key, meta] of Object.entries(AUDIENCES)) {
    const people = await audienceFor(supabase, user.id, key);
    audiences.push({ key, ...meta, count: people.length, note: reachNote(people.length, left) });
  }

  return json({ ok: true, audiences, cap, used, left, ramping, capReason: reason, max: MAX_RECIPIENTS });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const audience = String(body?.audience || "").trim();
  const subject = String(body?.subject || "").trim();
  const text = String(body?.body || "").trim();

  if (!AUDIENCES[audience]) return json({ ok: false, error: "Choose who this goes to." }, 400);
  const shape = checkAnnouncement({ subject, body: text });
  if (!shape.ok) return json({ ok: false, error: shape.error }, 400);

  // The kill switch stops every send path, and this is a send path.
  try {
    const { data: safety } = await supabase.from("safety_settings").select("kill_switch").eq("user_id", userId).maybeSingle();
    if (safety?.kill_switch) return json({ ok: false, error: "The kill switch is on. Turn it off in Setup to let Genie send." }, 403);
  } catch {}

  const plan = await planOf(supabase, userId);
  // The SAME allowance the nightly run and Find clients use. An announcement that
  // ignored the ramp would be the one message that got the owner's address
  // throttled, and it would be the one they cared about most.
  const { cap, reason: capReason } = await effectiveDailyCap(supabase, userId, plan);
  const used = await sentToday(supabase, userId);
  let left = Math.max(0, cap - used);
  if (left <= 0) return json({ ok: false, capReached: true, error: `Today's allowance is used up. ${capReason} Genie will send this tomorrow if you come back to it.` }, 200);

  const people = await audienceFor(supabase, userId, audience);
  if (!people.length) return json({ ok: false, error: "There is nobody in that list yet." }, 200);

  let host = null;
  try {
    const { data: scan } = await supabase.from("scans").select("final_url, url")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    host = scan ? hostOf(scan) : null;
  } catch {}
  const base = (process.env.APP_URL || "").replace(/\/+$/, "");

  let sent = 0, skipped = 0, failed = 0;
  const remaining = [];
  for (const person of people) {
    if (left <= 0) { remaining.push(person.email); continue; }
    if (await isSuppressed(supabase, userId, person.email)) { skipped++; continue; }

    // The owner's words, their name at the top where one is known.
    const greeting = person.name ? `Hi ${String(person.name).split(/\s+/)[0]},\n\n` : "";
    const res = await deliverEmail(supabase, userId, {
      to: person.email,
      subject,
      body: `${greeting}${text}`,
      unsubscribeUrl: unsubUrl(base, userId, person.email),
      name: person.name || null,
      // This is a message to someone already in contact, not a cold approach.
      source: "reply",
    });
    if (res.needsSender || res.needsConfig) {
      return json({ ok: false, needsSender: true, sent, error: res.error }, 200);
    }
    try {
      await supabase.from("outreach_log").insert({
        user_id: userId, host, contact_email: person.email, contact_name: person.name || null,
        subject, body: `${greeting}${text}`, status: res.ok ? "sent" : "failed",
        email_id: res.id || null, sent_at: res.ok ? new Date().toISOString() : null,
        // Not a first contact and not a follow-up in the chase sequence: an
        // announcement has its own step so the follow-up engine never counts it as
        // a chase and starts a sequence off the back of it.
        is_followup: false, followup_step: -1, source: "announcement",
      });
    } catch (e) { logger.warn("announce.log_failed", { error: String(e?.message || e).slice(0, 140) }); }

    if (res.ok) { sent++; left--; await new Promise((r) => setTimeout(r, 400)); } else failed++;
  }

  try {
    await recordEvent(supabase, {
      userId, host, type: "announcement.sent", actor: "human", subject,
      data: { audience, sent, skipped, failed, waiting: remaining.length },
    });
  } catch {}
  if (sent > 0) {
    try {
      await logActivity(supabase, userId, {
        host, verb: "published", icon: "📣",
        message: `You sent an update to ${sent} ${sent === 1 ? "person" : "people"}`,
        detail: subject, meta: { audience, sent },
      });
    } catch {}
  }

  return json({
    ok: true, sent, skipped, failed, waiting: remaining.length,
    message: remaining.length
      ? `Sent to ${sent}. ${remaining.length} more are waiting for tomorrow's allowance — come back and send again.`
      : `Sent to ${sent} ${sent === 1 ? "person" : "people"}.${skipped ? ` ${skipped} skipped (they opted out).` : ""}`,
  });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
