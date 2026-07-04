// app/api/safety/route.js
// F2 — Safety Architecture settings. The permission ladder, kill switch, and
// spend cap that gate ALL auto-execution (F3 checks these before doing anything).
// Hard rule enforced regardless of level: community & outreach are ALWAYS
// human-approved — no permission level unlocks auto-posting those.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = { permission_level: 1, kill_switch: false, monthly_spend_cap: 0 };

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data } = await supabase
    .from("safety_settings")
    .select("permission_level, kill_switch, monthly_spend_cap")
    .eq("user_id", user.id)
    .maybeSingle();

  return json({ ok: true, settings: data || DEFAULTS });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }

  const level = Number(body.permission_level);
  const settings = {
    user_id: user.id,
    permission_level: Number.isInteger(level) && level >= 1 && level <= 4 ? level : 1,
    kill_switch: !!body.kill_switch,
    monthly_spend_cap: Math.max(0, Number(body.monthly_spend_cap) || 0),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("safety_settings")
    .upsert(settings, { onConflict: "user_id" });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, settings });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
