// lib/gmail-read.js
// ── READ REPLIES (for the Genie Inbox) ──
// Fetches replies from the owner's OWN Gmail so a prospect's answer can be threaded
// in-app. Uses the user's Google connection with the gmail.readonly scope (reconnect
// once to grant it). Matches messages by sender against the contacts we emailed, and
// returns a light snippet — never the full mailbox. Best-effort and graceful: no
// connection, missing scope, or an API error just returns nothing.

import { getValidAccessToken } from "@/lib/google";
import { recordEvent } from "@/lib/events";
import { logActivity } from "@/lib/activity";

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// Pull new replies for everyone we've emailed but not heard from, mark them replied,
// store a snippet, and log it (so the user is notified). Used by the inbox sync
// button and the nightly job. Returns { found }. No-op without the read scope.
export async function syncReplies(supabase, userId) {
  const { data: pending } = await supabase.from("outreach_log")
    .select("contact_email, contact_name, host").eq("user_id", userId)
    .in("status", ["sent", "opened"]).is("replied_at", null).limit(120);
  const emails = [...new Set((pending || []).map((p) => (p.contact_email || "").toLowerCase()).filter(Boolean))];
  if (!emails.length) return { found: 0 };
  const nameOf = Object.fromEntries((pending || []).map((p) => [(p.contact_email || "").toLowerCase(), p.contact_name]));
  const hostOf = Object.fromEntries((pending || []).map((p) => [(p.contact_email || "").toLowerCase(), p.host]));
  const replies = await fetchRepliesFor(supabase, userId, emails);
  let found = 0;
  for (const rep of replies) {
    try {
      await supabase.from("outreach_log").update({ status: "replied", replied_at: new Date().toISOString() }).eq("user_id", userId).eq("contact_email", rep.email);
      await recordEvent(supabase, { userId, host: hostOf[rep.email] || null, type: "outreach.reply", actor: "contact", subject: rep.email, data: { email: rep.email, from: rep.from, subject: rep.subject, snippet: rep.snippet, date: rep.date }, dedupeKey: `reply:${rep.email}:${rep.messageId}` });
      await logActivity(supabase, userId, { host: hostOf[rep.email] || null, verb: "replied", message: `${nameOf[rep.email] || rep.email} replied to your outreach`, detail: (rep.snippet || "").slice(0, 90), meta: { email: rep.email } });
      found++;
    } catch {}
  }
  return { found };
}

export async function fetchRepliesFor(supabase, userId, emails, { sinceDays = 60 } = {}) {
  const list = [...new Set((emails || []).map((e) => String(e || "").toLowerCase()).filter(Boolean))];
  if (!list.length) return [];
  const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
  if (!conn) return [];
  if (typeof conn.scope === "string" && conn.scope && !/gmail\.(readonly|modify)/.test(conn.scope)) return [];
  const token = await getValidAccessToken(supabase, conn);
  if (!token) return [];
  const H = { Authorization: `Bearer ${token}` };

  const replies = [];
  for (const grp of chunk(list, 20)) {
    const q = `newer_than:${sinceDays}d in:anywhere (${grp.map((e) => `from:${e}`).join(" OR ")})`;
    let msgs = [];
    try {
      const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=${encodeURIComponent(q)}`, { headers: H, signal: AbortSignal.timeout(9000) });
      if (!r.ok) continue;
      msgs = (await r.json()).messages || [];
    } catch { continue; }
    for (const m of msgs.slice(0, 25)) {
      try {
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: H, signal: AbortSignal.timeout(8000) });
        if (!r.ok) continue;
        const msg = await r.json();
        const headers = Object.fromEntries((msg.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
        const from = String(headers.from || "").toLowerCase();
        const matched = grp.find((e) => from.includes(e));
        if (!matched) continue;
        replies.push({ email: matched, from: headers.from || matched, subject: headers.subject || "", snippet: (msg.snippet || "").slice(0, 400), date: headers.date || null, messageId: m.id, threadId: msg.threadId || null });
      } catch {}
    }
  }
  // Newest reply per contact.
  const byEmail = new Map();
  for (const rep of replies) { const cur = byEmail.get(rep.email); if (!cur || new Date(rep.date || 0) > new Date(cur.date || 0)) byEmail.set(rep.email, rep); }
  return [...byEmail.values()];
}
