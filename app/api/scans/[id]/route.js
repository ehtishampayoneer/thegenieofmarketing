// app/api/scans/[id]/route.js
// Fetch one saved scan (for the detail view) or delete it.
// RLS guarantees a user can only reach their own rows.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data, error } = await supabase
    .from("scans")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) return json({ ok: false, error: "Scan not found." }, 404);
  return json({ ok: true, scan: data });
}

export async function DELETE(_request, { params }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { error } = await supabase.from("scans").delete().eq("id", params.id);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
