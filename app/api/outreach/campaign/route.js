// app/api/outreach/campaign/route.js
// GET  -> today's outreach status/report (queued, sent, opened, replied) + cap.
// POST -> queue + send today's batch. One tap. Respects the daily cap, drafts
//         personalized emails from the profile, drips sends (small batches),
//         logs everything. Returns a report.

import { createClient } from "@/lib/supabase/server";
import { resolveRadarUser } from "@/lib/radar-auth";
import { DAILY_CAP, sentToday, sourceContacts, draftEmail, sendOne } from "@/lib/email-engine";
import { createTrackedLink } from "@/lib/links";
import { isSuppressed, unsubUrl } from "@/lib/compliance";
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

  // One tracked link for the signature site → every outreach click is attributable
  // (impression → click → conversion), gracefully falling back to a UTM link.
  const trackedSite = prof.company_website
    ? await createTrackedLink(supabase, { userId, host, url: prof.company_website, channel: "email" })
    : null;
  const draftProf = trackedSite ? { ...prof, company_website: trackedSite } : prof;

  // Draft + send as a drip. (Serverless: send this batch now; cron handles scale.)
  const base = process.env.APP_URL || "";

  // Drop addresses that cannot receive mail BEFORE the batch goes out. Bounces
  // are the signal mailbox providers use to classify a sender as spam, so a few
  // dead addresses in a batch push the deliverable ones into the spam folder.
  // DNS-level only: Vercel blocks outbound port 25, so a true SMTP mailbox probe
  // is not possible here. This still removes dead domains, typos and throwaways.
  let undeliverable = 0;
  let sendable = contacts;
  try {
    const { verifyEmails } = await import("@/lib/email-verify");
    const { good } = await verifyEmails(contacts.map((c) => c.email));
    const live = new Set(good.map((g) => g.email));
    sendable = contacts.filter((c) => live.has(String(c.email || "").toLowerCase()));
    undeliverable = contacts.length - sendable.length;
  } catch { sendable = contacts; } // a resolver hiccup must never stop the run

  let sent = 0, failed = 0, skipped = 0;
  for (const c of sendable) {
    // Compliance: never email someone who opted out.
    if (await isSuppressed(supabase, userId, c.email)) { skipped++; continue; }
    const { subject, body: emailBody } = await draftEmail(draftProf, c, { name: prof.company_name });
    const res = await sendOne(prof, c.email, subject, emailBody, { unsubscribeUrl: unsubUrl(base, userId, c.email) });
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

  // Report what was skipped as undeliverable, so the number is never silently
  // missing from the batch the owner expected.
  const protectedNote = undeliverable > 0
    ? ` Skipped ${undeliverable} dead address${undeliverable > 1 ? "es" : ""} to protect your sender reputation.`
    : "";
  return json({ ok: true, sent, failed, undeliverable, remaining: Math.max(0, cap - already - sent), message: sent > 0 ? `Sent ${sent} email${sent > 1 ? "s" : ""} to new potential clients. I'll follow up with the ones who don't reply.${protectedNote}` : `Couldn't send right now.${protectedNote}` });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
