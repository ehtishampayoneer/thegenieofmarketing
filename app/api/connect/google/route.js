// app/api/connect/google/route.js
// GET  → is Google connected? which account/site?
// DELETE → disconnect (remove the stored connection).
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, connected: false });

  const { data } = await supabase
    .from("connections")
    .select("google_email, gsc_site, scopes, created_at")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  return json({
    ok: true,
    connected: !!data,
    email: data?.google_email || null,
    site: data?.gsc_site || null,
  });
}

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false }, 401);

  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "google");

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
