// lib/email-engine.js
// The outreach engine: sources contacts (per-business finds + shared directory),
// enforces a safe daily cap (Free 15 / Pro 50), sends as a slow background drip
// via Resend, logs every send, and schedules follow-ups. Never blasts.

import { callAI } from "@/lib/ai-router";
import { taggedLink } from "@/lib/attribution";

export const DAILY_CAP = { free: 15, pro: 50 };

// How many already sent today (to enforce the cap).
export async function sentToday(supabase, userId) {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { count } = await supabase.from("outreach_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", since.toISOString())
    .in("status", ["sent", "opened", "replied"]);
  return count || 0;
}

// Pull candidate contacts for this user: their industry from the directory,
// skipping anyone they've already emailed. Returns up to `limit`.
export async function sourceContacts(supabase, userId, host, industry, limit) {
  // Who have we already emailed?
  const { data: already } = await supabase.from("outreach_log")
    .select("contact_email").eq("user_id", userId);
  const emailed = new Set((already || []).map((r) => r.contact_email?.toLowerCase()));

  // Pull from the shared directory, matching industry, excluding genie-leads
  // (those are for Marketing Genie's own outreach), not unsubscribed/bounced.
  let q = supabase.from("directory_contacts").select("*")
    .eq("is_genie_lead", false)
    .not("status", "in", "(unsubscribed,bounced)")
    .limit(limit * 3);
  if (industry) q = q.eq("industry", industry);
  const { data: pool } = await q;

  const fresh = (pool || []).filter((c) => c.email && !emailed.has(c.email.toLowerCase()));
  return fresh.slice(0, limit);
}

// Write a personalized outreach email using the sender's profile + the contact.
export async function draftEmail(profile, contact, business) {
  // Deterministic UTM: the one link we control in outreach is the signature site.
  const site = profile?.company_website
    ? taggedLink(profile.company_website, { channel: "email", campaign: business?.name || profile?.company_name || "outreach" })
    : null;
  const sig = [profile?.sender_name, profile?.company_name, site, profile?.company_phone]
    .filter(Boolean).join("\n");
  try {
    const result = await callAI({
      system: "You write short, warm, genuine B2B outreach emails. No hype, no spam, no exclamation overload. One clear value point tied to the recipient. Under 90 words. Return JSON only: {\"subject\":\"...\",\"body\":\"...\"}. The body must end with the provided signature.",
      maxTokens: 400, temperature: 0.7,
      prompt: `Sender: ${profile?.sender_name || ""} at ${profile?.company_name || business?.name || ""}
What they offer: ${profile?.company_pitch || business?.whatTheySell || ""}
Recipient: ${contact.name || "there"}${contact.company ? ` at ${contact.company}` : ""}${contact.industry ? ` (${contact.industry})` : ""}
Signature to end with:
${sig}

Write the outreach email as JSON.`,
    });
    const txt = (result.text || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(txt);
    return { subject: parsed.subject || "Quick question", body: parsed.body || "" };
  } catch {
    // Fallback template.
    return {
      subject: `${profile?.company_name || "Us"} x ${contact.company || "you"}`,
      body: `Hi ${contact.name || "there"},\n\n${profile?.company_pitch || "I think what we're building could help you."}\n\nWorth a quick chat?\n\n${sig}`,
    };
  }
}

// Send one email via Resend. Returns { ok, id, error }.
export async function sendOne(profile, to, subject, body) {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "email_not_configured" };
  const from = process.env.BRIEF_FROM || `${profile?.sender_name || "Genie"} <onboarding@resend.dev>`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">${escapeHtml(body).replace(/\n/g, "<br>")}</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, id: j?.id || null } : { ok: false, error: j?.message || `resend_${res.status}` };
  } catch {
    return { ok: false, error: "send_failed" };
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
