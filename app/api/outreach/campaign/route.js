// app/api/outreach/campaign/route.js
// GET  -> today's outreach status/report (queued, sent, opened, replied) + cap.
// POST -> queue + send today's batch. One tap. Respects the daily cap, drafts
//         personalized emails from the profile, drips sends (small batches),
//         logs everything. Returns a report.

import { createClient } from "@/lib/supabase/server";
import { resolveRadarUser } from "@/lib/radar-auth";
import { DAILY_CAP, sentToday, sourceContacts, draftEmail, sendOne } from "@/lib/email-engine";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data: prof } = await supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle();
  const plan = prof?.plan === "pro" ? "pro" : "free";
  const cap = DAILY_CAP[plan];

  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { data: todayLog } = await supabase.from("outreach_log").select("status, replied_at")
    .eq("user_id", user.id).gte("created_at", since.toISOString());
  const sent = (todayLog || []).filter((r) => ["sent", "opened", "replied"].includes(r.status)).length;
  const replied = (todayLog || []).filter((r) => r.status === "replied").length;

  // All-time totals for the directory feel.
  const { count: totalSent } = await supabase.from("outreach_log")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id).in("status", ["sent", "opened", "replied"]);
  const { count: totalReplied } = await supabase.from("outreach_log")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "replied");

  return json({ ok: true, plan, cap, today: { sent, replied, remaining: Math.max(0, cap - sent) }, allTime: { sent: totalSent || 0, replied: totalReplied || 0 } });
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { host, industry } = body || {};
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  if (!process.env.RESEND_API_KEY) return json({ ok: false, needsConfig: true, error: "Email isn't configured yet." }, 400);

  // Kill switch respected.
  const { data: safety } = await supabase.from("safety_settings").select("kill_switch").eq("user_id", userId).maybeSingle();
  if (safety?.kill_switch) return json({ ok: false, error: "Kill switch is on." }, 403);

  const { data: prof } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!prof?.sender_email) return json({ ok: false, needsProfile: true, error: "Add your sending email in your profile first." }, 400);
  const plan = prof?.plan === "pro" ? "pro" : "free";
  const cap = DAILY_CAP[plan];

  const already = await sentToday(supabase, userId);
  const room = Math.max(0, cap - already);
  if (room === 0) return json({ ok: true, done: true, sent: 0, message: `You've hit today's limit of ${cap}. Fresh batch tomorrow.` });

  // Source contacts (shared directory by industry, excluding already-emailed).
  const contacts = await sourceContacts(supabase, userId, host, industry || prof.industry, room);
  if (contacts.length === 0) {
    return json({ ok: true, sent: 0, message: "No fresh contacts to reach today. Genie's directory grows daily, check back tomorrow." });
  }

  // Draft + send as a drip. (Serverless: send this batch now; cron handles scale.)
  let sent = 0, failed = 0;
  for (const c of contacts) {
    const { subject, body: emailBody } = await draftEmail(prof, c, { name: prof.company_name });
    const res = await sendOne(prof, c.email, subject, emailBody);
    await supabase.from("outreach_log").insert({
      user_id: userId, host, contact_email: c.email, contact_name: c.name,
      subject, body: emailBody, status: res.ok ? "sent" : "failed",
      email_id: res.id || null, sent_at: res.ok ? new Date().toISOString() : null,
    });
    if (res.ok) { sent++; await sleep(400); } else failed++;
  }

  if (sent > 0) {
    await logActivity(supabase, userId, {
      host, verb: "published", message: `Sent ${sent} outreach email${sent > 1 ? "s" : ""} to potential clients`,
      detail: `${cap - already - sent} more allowed today`, meta: { sent, plan },
    });
  }

  return json({ ok: true, sent, failed, remaining: Math.max(0, cap - already - sent), message: sent > 0 ? `Sent ${sent} email${sent > 1 ? "s" : ""} to new potential clients. I'll follow up with the ones who don't reply.` : "Couldn't send right now." });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
