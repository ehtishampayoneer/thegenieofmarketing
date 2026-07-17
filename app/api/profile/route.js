// app/api/profile/route.js
// Genie's profile: who the user is + their company details. Baked into every
// outreach email so messages go out complete and professional. Editable anytime.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = ["sender_name", "sender_email", "company_name", "company_website", "company_phone", "company_address", "company_pitch", "logo_url"];

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data } = await supabase.from("profiles")
    .select("sender_name, sender_email, company_name, company_website, company_phone, company_address, company_pitch, logo_url, setup_completed")
    .eq("id", user.id).maybeSingle();

  return json({ ok: true, profile: data || {} });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }

  const patch = { id: user.id };
  for (const f of FIELDS) if (f in body) patch[f] = body[f] ? String(body[f]).slice(0, 500) : null;
  if (body.setup_completed != null) patch.setup_completed = !!body.setup_completed;

  const { error } = await supabase.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
