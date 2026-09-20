// app/api/outreach/campaign/route.js
// GET  -> today's outreach status/report (queued, sent, opened, replied) + cap.
// POST -> queue + send today's batch. One tap. Respects the daily cap, drafts
//         personalized emails from the profile, drips sends (small batches),
//         logs everything. Returns a report.

import { createClient } from "@/lib/supabase/server";
import { resolveRadarUser } from "@/lib/radar-auth";
import { DAILY_CAP, sentToday, sourceContacts, draftEmail, deliverEmail } from "@/lib/email-engine";
import { createTrackedLink } from "@/lib/links";
import { isSuppressed, unsubUrl } from "@/lib/compliance";
import { decideExecution } from "@/lib/autonomy";
import { logActivity } from "@/lib/activity";

import { briefBlock } from "@/lib/business-brief";
import { connScopes } from "@/lib/gmail";
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

  // Kill switch respected.
  const { data: safety } = await supabase.from("safety_settings").select("kill_switch").eq("user_id", userId).maybeSingle();
  if (safety?.kill_switch) return json({ ok: false, error: "Kill switch is on." }, 403);

  const { data: profRow } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const prof = profRow || {};

  // Is there any way to send at all? This used to demand RESEND_API_KEY and a
  // profile sender_email before doing anything, yet the real sender
  // (deliverEmail) sends through the owner's connected Gmail and needs neither.
  // An owner who connected Gmail but never typed a sending email, or a deployment
  // without Resend, got no outreach at all. Check what deliverEmail actually uses.
  let canSend = !!(process.env.RESEND_API_KEY && process.env.OUTREACH_FROM);
  if (!canSend) {
    try {
      const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
      canSend = connScopes(conn).includes("gmail.send");
    } catch {}
  }
  if (!canSend) return json({ ok: false, needsSender: true, error: "Connect Gmail on the Connections page so outreach sends from your own address." }, 200);
  const plan = prof?.plan === "pro" ? "pro" : "free";
  const cap = DAILY_CAP[plan];

  const already = await sentToday(supabase, userId);
  const room = Math.max(0, cap - already);
  if (room === 0) return json({ ok: true, done: true, sent: 0, message: `You've hit today's limit of ${cap}. Fresh batch tomorrow.` });

  // Who to look for. This matters more than it looks: the niche has to describe
  // the people we are SELLING TO, not what this business is. Seeding on "AR
  // software" finds other AR companies; seeding on "furniture and rug retailers"
  // finds actual buyers. The scan's targetCustomer is the right field, with the
  // industry as a fallback.
  // `profiles` has no `industry` column — this read was always undefined, so the
  // niche started empty unless the caller passed one. The scan's targetCustomer
  // below is where it really comes from.
  let niche = String(industry || "").trim();
  let briefForDrafts = "";
  try {
    const { data: scan } = await supabase.from("scans").select("ai")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const target = scan?.ai?.targetCustomer || scan?.ai?.idealCustomer;
    if (target) niche = String(target).slice(0, 120);
    // The owner's own segments beat the one-line summary. Rotated by day, so
    // "furniture retailers; restaurants" is searched as two real groups on
    // alternate nights instead of one mashed-together query that matches neither.
    const segs = scan?.ai?.brief?.segments;
    if (Array.isArray(segs) && segs.length) niche = String(segs[Math.floor(Date.now() / 86400000) % segs.length]).slice(0, 120);
    briefForDrafts = briefBlock(scan?.ai || {}, { max: 1800 });
  } catch {}

  // Source contacts. Seeds the shared directory from real published addresses
  // when it has nothing fresh, which is what makes this run send at all.
  // Filter the shared pool by the SAME niche that seeds it. This used to pass
  // `industry || prof.industry`, and since profiles has no industry column that
  // was usually undefined — which switches the filter off entirely and lets the
  // nightly run email anyone in the directory, including contacts another
  // business's run had gone and found for a completely different market. The
  // emails send from the owner's own Gmail, so a bad match costs them their own
  // sending reputation, not Genie's.
  const contacts = await sourceContacts(supabase, userId, host, niche || industry || null, room, { niche });
  if (contacts.length === 0) {
    return json({
      ok: true, sent: 0,
      message: niche
        ? "No fresh contacts found this time. Genie looks for more every night, so check back tomorrow."
        : "Genie needs to know who you sell to before it can find contacts. Add your target customer in Settings.",
    });
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
  // Compliance: never email someone who opted out.
  const queue = [];
  for (const c of sendable) {
    if (await isSuppressed(supabase, userId, c.email)) { skipped++; continue; }
    queue.push(c);
  }
  // Draft four at a time. One by one, at several seconds each, a full daily batch
  // ran past this route's time limit and the rest of the day's sends never happened.
  const drafts = new Map();
  for (let i = 0; i < queue.length; i += 4) {
    const chunk = queue.slice(i, i + 4);
    const out = await Promise.all(chunk.map((c) => draftEmail(draftProf, c, { name: prof.company_name, brief: briefForDrafts })));
    chunk.forEach((c, k) => drafts.set(c.email, out[k]));
  }

  // ── DOES THIS SEND, OR DOES IT WAIT FOR YOU? ────────────────────────────────
  // Everything else Genie writes waits in Approvals. Outreach did not: the
  // nightly run sent it straight out of the owner's own Gmail, to people they
  // had never seen, and a bad batch costs them their own sending reputation
  // rather than Genie's.
  //
  // It now asks the same question the rest of the product was built to ask, and
  // that nothing had ever called: lib/autonomy.js. Email sends unattended only
  // when the owner has granted the email channel "auto" in the Trust Center (or
  // earned it: six approvals and a win) AND the content guard passes AND
  // confidence is at least 80. Anything short of all three and the draft goes to
  // Approvals instead, which is the safe default for a new account.
  let staged = 0;
  for (const c of queue) {
    const { subject, body: emailBody } = drafts.get(c.email) || {};
    // Could not write a proper email for this one: skip it rather than send filler.
    if (!subject || !emailBody) { skipped++; continue; }

    const decision = await decideExecution(supabase, {
      userId, host, channel: "email", content: `${subject}\n\n${emailBody}`,
    });
    if (!decision.execute) {
      await stageForApproval(supabase, {
        userId, host, contact: c, subject, body: emailBody, reason: decision.reason,
      });
      staged++;
      continue;
    }
    // deliverEmail, not sendOne: it tries the user's OWN Gmail first and only
    // falls back to the platform sender. sendOne skipped that entirely, which is
    // why the nightly run ignored a connected Gmail and sent from a shared
    // address with the deliverability that implies.
    const res = await deliverEmail(supabase, userId, { to: c.email, subject, body: emailBody, unsubscribeUrl: unsubUrl(base, userId, c.email) });
    // No usable sender means every send in this batch will fail the same way, so
    // stop rather than marking the whole day's contacts as failed.
    if (res.needsSender || res.needsConfig) {
      return json({ ok: false, needsSender: true, sent, error: res.error }, 200);
    }
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
  if (staged > 0) {
    await logActivity(supabase, userId, {
      host, verb: "staged", icon: "✉️",
      message: `${staged} outreach email${staged > 1 ? "s are" : " is"} waiting for you to approve`,
      detail: "Genie found the people and wrote to each one personally. Nothing sends from your address until you say so — grant the email channel autonomy in the Trust Center if you would rather it sent on its own.",
      meta: { staged },
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

// ── ONE EMAIL, WAITING ──────────────────────────────────────────────────────
// Staged as an `outreach_email` action, which Approvals already knows how to
// show and the crowd already knows how to test, so this needs no new surface.
// The address, the name and the company travel with it: approving is what turns
// it into a send, in /api/actions/[id]/execute.
//
// Nothing is written to outreach_log here. That table is the record of what was
// actually sent, and a draft nobody has approved has not been sent — counting it
// there would inflate "emails sent" and, worse, make sourceContacts() treat the
// person as already contacted and never write to them again.
async function stageForApproval(supabase, { userId, host, contact, subject, body, reason }) {
  try {
    await supabase.from("actions").insert({
      user_id: userId,
      type: "outreach_email",
      title: `Email ${contact.name || contact.company || contact.email}`,
      status: "proposed",
      priority: "medium",
      target: { host, email: contact.email },
      payload: {
        to: contact.email,
        toName: contact.name || null,
        company: contact.company || null,
        subject,
        body,
        text: body,              // what the Approvals editor reads and edits
        heldBecause: reason || null,
      },
    });
  } catch {}
}
