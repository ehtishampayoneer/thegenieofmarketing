// app/api/pipeline/act/route.js
// POST { email, act, value? } -> record a deal outcome (won / lost / reopen) for a
// contact, as an event. The pipeline reads the newest outcome per email, so this is
// the single source of truth for closed revenue across every channel.

import { resolveRadarUser } from "@/lib/radar-auth";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const email = String(body?.email || "").toLowerCase().trim();
  const act = body?.act;
  if (!email || !["won", "lost", "reopen"].includes(act)) return json({ ok: false, error: "Bad request." }, 400);

  const value = act === "won" ? String(body?.value ?? "") : null;
  await recordEvent(supabase, { userId, type: "deal.outcome", actor: "user", subject: email, data: { email, outcome: act === "reopen" ? null : act, value } });
  return json({ ok: true });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
