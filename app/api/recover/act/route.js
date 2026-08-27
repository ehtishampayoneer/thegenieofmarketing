// app/api/recover/act/route.js
// POST { id, act, dealValue? } -> update one win-back contact.
//   "sent"  -> mark it sent (the email itself goes through /api/prospects/send).
//   "won"   -> mark recovered (optionally set the deal value).
//   "lost"  -> mark closed-lost.
//   "delete"-> remove it.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const id = body?.id;
  const act = body?.act;
  if (!id || !["sent", "won", "lost", "delete", "reopen"].includes(act)) return json({ ok: false, error: "Bad request." }, 400);

  const admin = createAdminClient();
  const { data: row } = await admin.from("actions").select("id, payload").eq("id", id).eq("user_id", userId).eq("type", "recovery").maybeSingle();
  if (!row) return json({ ok: false, error: "Not found." }, 404);

  if (act === "delete") { await admin.from("actions").delete().eq("id", id).eq("user_id", userId); return json({ ok: true, removed: true }); }

  const p = { ...(row.payload || {}) };
  if (act === "sent") { p.sent = true; p.sentAt = new Date().toISOString(); }
  if (act === "won") { p.outcome = "won"; if (body?.dealValue != null && body.dealValue !== "") p.dealValue = String(body.dealValue); }
  if (act === "lost") { p.outcome = "lost"; }
  if (act === "reopen") { p.outcome = null; }

  const { error } = await admin.from("actions").update({ payload: p }).eq("id", id).eq("user_id", userId);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
