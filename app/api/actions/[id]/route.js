// app/api/actions/[id]/route.js
// Fetch one action (for the detail view). RLS ensures ownership.
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) return json({ ok: false, error: "Action not found." }, 404);
  return json({ ok: true, action: data });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
