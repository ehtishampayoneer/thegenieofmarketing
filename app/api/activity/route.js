// app/api/activity/route.js
// The live "Genie is working right now" feed. Returns recent activity entries
// so the UI can narrate what Genie has been doing — making the invisible
// engine visible. This is the wow: users SEE their AI employee at work.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10), 60);

  let q = supabase.from("activity").select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(limit);
  if (host) q = q.eq("host", host);
  const { data } = await q;

  return json({ ok: true, activity: data || [] });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
