// app/api/recover/list/route.js
// GET -> the Revenue Recovery pipeline: every imported win-back contact with its
// stage (to send / sent / replied / won / lost), plus a summary (pipeline value +
// recovered revenue). "Replied" is cross-referenced from the outreach log, so a reply
// to any win-back email (caught by the Inbox sync) shows up here automatically.

import { createClient } from "@/lib/supabase/server";
import { dealNum } from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data } = await supabase.from("actions").select("id, payload, created_at")
    .eq("user_id", user.id).eq("type", "recovery").order("created_at", { ascending: false }).limit(500);
  const rows = data || [];

  // Which contacts have replied (from the outreach log the Inbox sync writes)?
  const replied = new Set();
  try {
    const { data: log } = await supabase.from("outreach_log").select("contact_email, replied_at").eq("user_id", user.id).not("replied_at", "is", null).limit(1000);
    for (const l of log || []) if (l.contact_email) replied.add(String(l.contact_email).toLowerCase());
  } catch {}

  const contacts = rows.map((r) => {
    const p = r.payload || {};
    const hasReply = replied.has(String(p.email || "").toLowerCase());
    return { id: r.id, ...p, replied: hasReply, createdAt: r.created_at };
  });

  const won = contacts.filter((c) => c.outcome === "won");
  const summary = {
    total: contacts.length,
    toSend: contacts.filter((c) => !c.sent && !c.outcome).length,
    sent: contacts.filter((c) => c.sent && !c.replied && !c.outcome).length,
    replied: contacts.filter((c) => c.replied && !c.outcome).length,
    won: won.length,
    lost: contacts.filter((c) => c.outcome === "lost").length,
    pipeline: contacts.reduce((s, c) => s + dealNum(c.dealValue), 0),
    recovered: won.reduce((s, c) => s + dealNum(c.dealValue), 0),
  };

  return json({ ok: true, contacts, summary });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
