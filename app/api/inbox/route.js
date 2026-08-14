// app/api/inbox/route.js
// GET  -> the Genie Inbox: every prospect you've emailed, threaded with their reply.
// POST -> sync: pull replies from your Gmail (readonly scope), mark them replied,
//         store a snippet, and log the reply so you're notified. Both gracefully
//         degrade when Gmail read isn't granted — you still see everything you sent.

import { resolveRadarUser } from "@/lib/radar-auth";
import { getEvents } from "@/lib/events";
import { syncReplies } from "@/lib/gmail-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { supabase, userId } = await resolveRadarUser(request, {});
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data: sent } = await supabase.from("outreach_log")
    .select("contact_email, contact_name, subject, status, sent_at, replied_at, host")
    .eq("user_id", userId).order("sent_at", { ascending: false }).limit(200);

  const replyEvents = await getEvents(supabase, { userId, types: ["outreach.reply"], limit: 200 });
  const replyByEmail = {};
  for (const e of replyEvents) { const em = (e.data?.email || e.subject || "").toLowerCase(); if (em && !replyByEmail[em]) replyByEmail[em] = e.data || {}; }

  const seen = new Set();
  const threads = [];
  for (const s of sent || []) {
    const em = (s.contact_email || "").toLowerCase();
    if (!em || seen.has(em)) continue;
    seen.add(em);
    const reply = replyByEmail[em] || null;
    threads.push({
      email: s.contact_email, name: s.contact_name || null, subject: s.subject || "",
      sentAt: s.sent_at, status: reply || s.status === "replied" ? "replied" : (s.status || "sent"),
      reply: reply ? { snippet: reply.snippet || "", subject: reply.subject || "", date: reply.date || null } : null,
    });
  }
  const replied = threads.filter((t) => t.status === "replied").length;
  return json({ ok: true, threads, counts: { total: threads.length, replied } });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  const { found } = await syncReplies(supabase, userId);
  return json({ ok: true, found, message: found ? `${found} new repl${found === 1 ? "y" : "ies"}.` : "No new replies yet." });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
