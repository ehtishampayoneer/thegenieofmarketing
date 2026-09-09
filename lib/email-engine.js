// lib/email-engine.js
// The outreach engine: sources contacts (per-business finds + shared directory),
// enforces a safe daily cap (Free 15 / Pro 50), sends as a slow background drip
// via Resend, logs every send, and schedules follow-ups. Never blasts.

import { callAI } from "@/lib/ai-router";
import { taggedLink } from "@/lib/attribution";
import { getValidAccessToken, getGoogleEmail } from "@/lib/google";
import { sendViaGmail, gmailAddress } from "@/lib/gmail";

export const DAILY_CAP = { free: 15, pro: 50 };

// Build the branded HTML body (logo header + body + address + unsubscribe).
export function buildEmailHtml(profile, body, { unsubscribeUrl } = {}) {
  const logo = profile?.logo_url ? `<div style="margin-bottom:16px"><img src="${escapeAttr(profile.logo_url)}" alt="${escapeAttr(profile.company_name || "")}" style="max-height:44px;max-width:180px" /></div>` : "";
  const address = profile?.company_address ? `<div style="color:#8a949e;font-size:12px;margin-top:10px">${escapeHtml(profile.company_address)}</div>` : "";
  const unsub = unsubscribeUrl ? `<div style="color:#8a949e;font-size:12px;margin-top:12px">Not interested? <a href="${unsubscribeUrl}" style="color:#8a949e">Unsubscribe</a>.</div>` : "";
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">${logo}${escapeHtml(body).replace(/\n/g, "<br>")}${address}${unsub}</div>`;
}

// ── ONE SENDER FOR EVERYTHING ──
// Prefers the user's OWN Gmail (best deliverability, genuinely from them). Falls
// back to the platform's Resend domain with reply-to set to the user's email.
export async function deliverEmail(supabase, userId, { to, subject, body, unsubscribeUrl }) {
  let profile = {};
  try { const { data } = await supabase.from("profiles").select("sender_name, sender_email, company_name, company_address, logo_url").eq("id", userId).maybeSingle(); profile = data || {}; } catch {}
  const html = buildEmailHtml(profile, body, { unsubscribeUrl });

  // 1) The user's own Gmail, if connected with send permission.
  try {
    const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
    if (conn && String(conn.scope || "").includes("gmail.send")) {
      let fromEmail = await gmailAddress(conn);
      if (!fromEmail) { try { const t = await getValidAccessToken(supabase, conn); fromEmail = t ? await getGoogleEmail(t) : null; } catch {} }
      if (fromEmail) {
        const r = await sendViaGmail(supabase, conn, {
          fromName: profile.sender_name || profile.company_name || null,
          fromEmail, to, subject, html,
          replyTo: profile.sender_email && profile.sender_email !== fromEmail ? profile.sender_email : null,
        });
        if (r.ok) return { ok: true, id: r.id, via: "gmail", from: fromEmail };
      }
    }
  } catch {}

  // 2) Platform Resend, with replies routed to the user's inbox.
  if (!process.env.RESEND_API_KEY) return { ok: false, needsConfig: true, error: "No sending method connected. Connect Gmail on the Connections page to send from your own address." };
  const from = process.env.BRIEF_FROM || `${profile.sender_name || "Genie"} <onboarding@resend.dev>`;
  const payload = { from, to: [to], subject, html };
  if (profile.sender_email) payload.reply_to = profile.sender_email;
  if (unsubscribeUrl) payload.headers = { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  try {
    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, id: j.id || null, via: "resend", from } : { ok: false, error: j.message || `resend_${res.status}` };
  } catch { return { ok: false, error: "send_failed" }; }
}

// How many already sent today (to enforce the cap).
export async function sentToday(supabase, userId) {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { count } = await supabase.from("outreach_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", since.toISOString())
    .in("status", ["sent", "opened", "replied"]);
  return count || 0;
}

// ── SEEDING THE SHARED DIRECTORY ─────────────────────────────────────────────
// The directory was read by sourceContacts() and written by nothing, anywhere,
// so the nightly run sourced zero contacts and sent zero email every night,
// silently. This fills it.
//
// Deliberately NOT a new scraper. lib/prospects.js already names real companies
// and reads contact addresses from those companies' own published pages, and it
// is the engine behind /prospects that the owner can already see working. A
// second discovery path would be a second thing to keep honest.
//
// The rules that make this safe to send from are inherited, not re-invented:
// an address is only ever stored if the company published it on its own site
// (the extractor never guesses a pattern like first.last@), and every send still
// carries the unsubscribe link and physical address from buildEmailHtml.
export async function seedDirectory({ industry, niche, limit = 10 } = {}) {
  const query = String(niche || industry || "").trim();
  if (!query) return { inserted: 0, reason: "no_niche" };

  let admin;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    admin = createAdminClient();
  } catch { return { inserted: 0, reason: "no_admin" }; }

  let companies = [];
  try {
    const { findCompanies } = await import("@/lib/prospects");
    companies = await findCompanies(query, { limit });
  } catch { return { inserted: 0, reason: "discovery_failed" }; }
  if (!companies.length) return { inserted: 0, reason: "no_companies" };

  // Skip domains already in the directory before doing any network work: the
  // same industry gets discovered night after night and will keep surfacing the
  // same well-known names.
  try {
    const { data: known } = await admin.from("directory_contacts")
      .select("domain").in("domain", companies.map((c) => c.domain));
    const seen = new Set((known || []).map((r) => r.domain));
    companies = companies.filter((c) => !seen.has(c.domain));
  } catch {}
  if (!companies.length) return { inserted: 0, reason: "all_known" };

  // Fetch each company's site for a published address. Bounded concurrency, and
  // bounded total, because this runs inside the nightly job's time budget.
  const { profileCompany } = await import("@/lib/prospects");
  const rows = [];
  const batch = companies.slice(0, limit);
  for (let i = 0; i < batch.length; i += 4) {
    const slice = batch.slice(i, i + 4);
    const settled = await Promise.allSettled(slice.map((c) => profileCompany(c.url)));
    settled.forEach((res, j) => {
      if (res.status !== "fulfilled" || !res.value) return;
      const c = slice[j];
      const emails = res.value.emails || [];
      // A named human converts far better than info@, so prefer one when the
      // site published one. If there is no address at all, store nothing: a
      // contact form is not something the email engine can send to.
      const chosen = emails.find((e) => e.type === "named") || emails[0];
      if (!chosen?.email) return;
      rows.push({
        email: chosen.email.toLowerCase(),
        company: res.value.siteName || c.name,
        domain: c.domain,
        industry: industry || query,
        email_type: chosen.type || "role",
        is_genie_lead: false,
        status: "new",
        source: "discovery",
      });
    });
  }
  if (!rows.length) return { inserted: 0, reason: "no_published_emails" };

  try {
    // ignoreDuplicates so a race with another user's run cannot fail the batch.
    const { data, error } = await admin.from("directory_contacts")
      .upsert(rows, { onConflict: "email", ignoreDuplicates: true })
      .select("id");
    if (error) return { inserted: 0, reason: error.message };
    return { inserted: (data || []).length };
  } catch (e) {
    return { inserted: 0, reason: String(e?.message || e).slice(0, 120) };
  }
}

// Pull candidate contacts for this user: their industry from the directory,
// skipping anyone they've already emailed. Returns up to `limit`.
//
// When the directory has nothing fresh, it seeds itself and looks again. That
// covers both a cold start and the case where one customer has already worked
// through everyone in their industry.
export async function sourceContacts(supabase, userId, host, industry, limit, opts = {}) {
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
  if (fresh.length) return fresh.slice(0, limit);

  // Dry. Fill the directory, then look once more. Only ever one attempt per
  // call, so a niche that genuinely returns nothing costs one discovery run and
  // then reports honestly rather than looping.
  if (opts.seed !== false) {
    const seeded = await seedDirectory({ industry, niche: opts.niche || industry, limit: Math.max(10, limit) });
    if (!seeded.inserted) return [];
    return sourceContacts(supabase, userId, host, industry, limit, { ...opts, seed: false });
  }
  return [];
}

// Write a personalized outreach email using the sender's profile + the contact.
export async function draftEmail(profile, contact, business) {
  // Attribution: prefer a tracked link the caller already built; else UTM-tag here.
  const raw = profile?.company_website;
  const site = raw
    ? (/\/l\/|utm_/.test(raw) ? raw : taggedLink(raw, { channel: "email", campaign: business?.name || profile?.company_name || "outreach" }))
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
// CAN-SPAM compliant: includes the sender's physical address + a one-click
// unsubscribe (footer link + List-Unsubscribe headers).
export async function sendOne(profile, to, subject, body, { unsubscribeUrl } = {}) {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "email_not_configured" };
  const from = process.env.BRIEF_FROM || `${profile?.sender_name || "Genie"} <onboarding@resend.dev>`;
  const logo = profile?.logo_url ? `<div style="margin-bottom:16px"><img src="${escapeAttr(profile.logo_url)}" alt="${escapeAttr(profile.company_name || "")}" style="max-height:44px;max-width:180px" /></div>` : "";
  const address = profile?.company_address ? `<div style="color:#8a949e;font-size:12px;margin-top:10px">${escapeHtml(profile.company_address)}</div>` : "";
  const unsub = unsubscribeUrl ? `<div style="color:#8a949e;font-size:12px;margin-top:12px">Not interested? <a href="${unsubscribeUrl}" style="color:#8a949e">Unsubscribe</a>.</div>` : "";
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">${logo}${escapeHtml(body).replace(/\n/g, "<br>")}${address}${unsub}</div>`;
  const payload = { from, to: [to], subject, html };
  // Replies land in the user's OWN inbox — even while we send from the platform's
  // verified domain — so every conversation the outreach starts reaches them.
  if (profile?.sender_email) payload.reply_to = profile.sender_email;
  if (unsubscribeUrl) payload.headers = { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
