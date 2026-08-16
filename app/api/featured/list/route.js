// app/api/featured/list/route.js
// GET ?play=X -> this user's saved earned-media opportunities for that play (newest
// first). This is what makes results persist across navigation and section switches.

import { createClient } from "@/lib/supabase/server";
import { actionToOpp, MEDIA_TYPE } from "@/lib/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const url = new URL(request.url);
  const play = url.searchParams.get("play") || null;

  const { data } = await supabase.from("actions")
    .select("id, payload, created_at").eq("user_id", user.id).eq("type", MEDIA_TYPE)
    .order("created_at", { ascending: false }).limit(400);

  const rows = (data || []).filter((a) => !play || a.payload?.play === play).map(actionToOpp);
  // Group counts per play so the UI can badge each section.
  const counts = {};
  for (const a of data || []) { const pl = a.payload?.play; if (!pl) continue; counts[pl] = counts[pl] || { total: 0, applied: 0 }; counts[pl].total++; if (a.payload?.applied) counts[pl].applied++; }

  return json({ ok: true, play, opportunities: rows, counts });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
