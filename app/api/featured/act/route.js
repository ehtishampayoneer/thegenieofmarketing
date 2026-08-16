// app/api/featured/act/route.js
// POST { id, act } -> mark a stored earned-media opportunity.
//   act "apply" -> flag it applied (+ timestamp) so it shows "Applied" and is excluded
//                  from re-scans for REAPPLY_DAYS. (The email itself is sent via the
//                  shared /api/prospects/send, same engine + daily cap as Find clients.)
//   act "skip"  -> remove it from the list.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEDIA_TYPE } from "@/lib/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const id = body?.id;
  const act = body?.act === "skip" ? "skip" : "apply";
  if (!id) return json({ ok: false, error: "Missing id." }, 400);

  const admin = createAdminClient();
  const { data: row } = await admin.from("actions").select("id, payload, user_id, type").eq("id", id).eq("user_id", userId).eq("type", MEDIA_TYPE).maybeSingle();
  if (!row) return json({ ok: false, error: "Not found." }, 404);

  if (act === "skip") {
    await admin.from("actions").delete().eq("id", id).eq("user_id", userId);
    return json({ ok: true, removed: true });
  }

  // Only flag the payload — leave `status` untouched to avoid any status CHECK
  // constraint (media rows are excluded from Approvals by TYPE regardless of status).
  const payload = { ...(row.payload || {}), applied: true, appliedAt: new Date().toISOString() };
  const { error } = await admin.from("actions").update({ payload }).eq("id", id).eq("user_id", userId);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, applied: true });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
