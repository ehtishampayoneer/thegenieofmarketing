// app/api/outreach/send/route.js
// STAGE 5 — REAL EMAIL OUTREACH SEND (a true hands-off DO).
// Genie sends a drafted outreach email to the prospect via Resend. Unlike
// social platforms (tap-to-post), email is a genuine auto-execute: the user
// approves, Genie sends it for real, and logs the outcome.
//
// Safety: kill switch respected. The outreach action must have a recipient.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { actionId, to: overrideTo } = body || {};
  if (!actionId) return json({ ok: false, error: "Missing actionId." }, 400);

  // Kill switch.
  const { data: safety } = await supabase.from("safety_settings").select("kill_switch").eq("user_id", user.id).maybeSingle();
  if (safety?.kill_switch) return json({ ok: false, error: "Kill switch is on — turn it off in Settings to let Genie send." }, 403);

  // Load the outreach action (RLS ensures ownership).
  const { data: action } = await supabase.from("actions").select("*").eq("id", actionId).single();
  if (!action) return json({ ok: false, error: "Action not found." }, 404);
  if (action.type !== "outreach_email") return json({ ok: false, error: "Not an outreach email." }, 400);
  if (action.status === "done") return json({ ok: true, alreadyDone: true, result: action.result });

  const p = action.payload || {};
  const to = overrideTo || p.to || p.recipient || action.target?.email || null;
  const { subject, text } = splitEmail(p.draft || p.body || "");
  const finalSubject = p.subject || subject || "Quick question";

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return json({ ok: false, needsRecipient: true, error: "No valid recipient email on this outreach. Add one to send." }, 400);
  }

  await supabase.from("actions").update({ status: "executing", updated_at: new Date().toISOString() }).eq("id", action.id);

  // One sender: the user's own Gmail if connected, else the platform domain with
  // replies routed to their inbox. Includes their logo + address.
  const { deliverEmail } = await import("@/lib/email-engine");
  const r = await deliverEmail(supabase, user.id, { to, subject: finalSubject, body: text });
  if (!r.ok) {
    await supabase.from("actions").update({ status: "failed", result: { error: r.error }, updated_at: new Date().toISOString() }).eq("id", action.id);
    try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "failed", meta: { error: r.error } }); } catch {}
    return json({ ok: false, needsConfig: !!r.needsConfig, error: r.error }, r.needsConfig ? 400 : 502);
  }

  const result = { to, subject: finalSubject, emailId: r.id, via: r.via, from: r.from, sentAt: new Date().toISOString(), channel: "email" };
  await supabase.from("actions").update({ status: "done", result, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", action.id);
  try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "executed", meta: result }); } catch {}
  return json({ ok: true, result });
}

// Split "Subject: ...\n\nbody" into parts.
function splitEmail(draft) {
  const m = String(draft).match(/^\s*subject:\s*(.+?)\n+([\s\S]*)$/i);
  if (m) return { subject: m[1].trim(), text: m[2].trim() };
  return { subject: null, text: String(draft).trim() };
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
