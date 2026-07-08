// app/api/connect/x/route.js
// Status + disconnect for the X connection.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, connected: false });

  const { data } = await supabase.from("connections").select("meta")
    .eq("user_id", user.id).eq("provider", "x").maybeSingle();

  return json({ ok: true, connected: !!data, handle: data?.meta?.handle || null });
}

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false }, 401);
  const { error } = await supabase.from("connections").delete()
    .eq("user_id", user.id).eq("provider", "x");
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
