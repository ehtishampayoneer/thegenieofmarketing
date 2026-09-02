// app/api/prospects/send/route.js
// Send one prospect the (possibly-edited) pitch, from the Prospects cockpit. Reuses
// the outreach engine's sender (your own Gmail first), respects the kill switch, the
// daily cap, and opt-outs, adds a compliant unsubscribe, and logs to outreach_log so
// it shows in the Genie Inbox as "sent". Never sends to an invalid/opted-out address.

import { resolveRadarUser } from "@/lib/radar-auth";
import { hostOf } from "@/lib/business";
import { DAILY_CAP, sentToday, deliverEmail } from "@/lib/email-engine";
import { isSuppressed, unsubUrl } from "@/lib/compliance";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const to = String(body?.to || "").trim().toLowerCase();
  const subject = String(body?.subject || "").trim().slice(0, 160) || "Quick question";
  const emailBody = String(body?.body || "").trim();
  const name = String(body?.name || "").trim() || null;
  const company = String(body?.company || "").trim() || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(to)) return json({ ok: false, error: "That contact has no valid email to send to." }, 400);
  if (!emailBody) return json({ ok: false, error: "The pitch is empty." }, 400);

  // Kill switch.
  const { data: safety } = await supabase.from("safety_settings").select("kill_switch").eq("user_id", userId).maybeSingle();
  if (safety?.kill_switch) return json({ ok: false, error: "Kill switch is on — turn it off in Settings to let Genie send." }, 403);

  // Daily cap (protects your sending reputation).
  const { data: prof } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
  const cap = DAILY_CAP[prof?.plan === "pro" ? "pro" : "free"];
  if ((await sentToday(supabase, userId)) >= cap) return json({ ok: false, capReached: true, error: `You've hit today's send limit of ${cap}. Fresh batch tomorrow.` }, 200);

  // Never email an opt-out or someone already contacted.
  if (await isSuppressed(supabase, userId, to)) return json({ ok: false, error: "This contact opted out — Genie won't email them." }, 200);

  // Does the address actually exist? A bounce is what mailbox providers use to
  // decide you're a spammer, so one dead address can push your GOOD email into
  // spam. DNS-level check only (Vercel blocks port 25, so a true SMTP mailbox
  // probe is impossible here) — it catches dead domains, typos and throwaways.
  try {
    const { verifyEmail } = await import("@/lib/email-verify");
    const v = await verifyEmail(to);
    if (!v.ok) {
      const why = v.reason === "likely_typo" && v.suggestion
        ? `That address looks like a typo. Did you mean ${v.suggestion}?`
        : v.reason === "disposable"
          ? "That's a throwaway inbox — sending there would only hurt your sending reputation."
          : "That address can't receive mail, so sending would bounce and damage your sender reputation.";
      return json({ ok: false, undeliverable: true, reason: v.reason, suggestion: v.suggestion || null, error: why }, 200);
    }
  } catch {} // a resolver hiccup must never block a legitimate send
  try {
    const { data: prev } = await supabase.from("outreach_log").select("id").eq("user_id", userId).eq("contact_email", to).limit(1);
    if (prev?.length) return json({ ok: false, alreadySent: true, error: "You've already emailed this contact." }, 200);
  } catch {}

  let host = null;
  try { const { data: scan } = await supabase.from("scans").select("final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(); host = scan ? hostOf(scan) : null; } catch {}
  const base = process.env.APP_URL || "";

  const r = await deliverEmail(supabase, userId, { to, subject, body: emailBody, unsubscribeUrl: unsubUrl(base, userId, to) });
  try {
    await supabase.from("outreach_log").insert({
      user_id: userId, host, contact_email: to, contact_name: name || company,
      subject, body: emailBody, status: r.ok ? "sent" : "failed",
      email_id: r.id || null, sent_at: r.ok ? new Date().toISOString() : null,
    });
  } catch {}

  if (!r.ok) return json({ ok: false, needsConfig: !!r.needsConfig, error: r.error || "Couldn't send just then." }, r.needsConfig ? 400 : 502);

  try { await logActivity(supabase, userId, { host, verb: "published", message: `Sent your pitch to ${name || company || to}`, detail: company ? `${company} · outreach` : "outreach", meta: { to, company } }); } catch {}
  return json({ ok: true, to, via: r.via, from: r.from });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
