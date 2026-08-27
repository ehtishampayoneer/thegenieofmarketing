// app/api/foundation/route.js
// GET  -> the foundation-link checklist: the curated sites, Genie-written bios (from
//         your profile), and which you've marked done. POST { id, done } toggles one.
// Progress persists per user (stored in the actions table, type "foundation", so it's
// excluded from the Approvals queue).

import { resolveRadarUser } from "@/lib/radar-auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostOf } from "@/lib/business";
import { FOUNDATION_SITES, buildBios } from "@/lib/foundation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPE = "foundation";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let business = { name: "", pitch: "", whatTheySell: "", website: "" };
  try {
    const { data: prof } = await supabase.from("profiles").select("company_name, company_pitch, company_website").eq("id", user.id).maybeSingle();
    if (prof) business = { name: prof.company_name || "", pitch: prof.company_pitch || "", whatTheySell: "", website: prof.company_website || "" };
  } catch {}
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { const ai = scan.ai || {}; business.name = business.name || ai.businessName || ""; business.whatTheySell = ai.whatTheySell || ai.keyProducts || ""; business.pitch = business.pitch || ai.whyChooseYou || ai.whatTheySell || ""; business.website = business.website || (hostOf(scan) ? `https://${hostOf(scan)}` : ""); }
  } catch {}

  let done = [];
  try {
    const { data } = await supabase.from("actions").select("payload").eq("user_id", user.id).eq("type", TYPE).order("created_at", { ascending: true }).limit(1);
    done = Array.isArray(data?.[0]?.payload?.done) ? data[0].payload.done : [];
  } catch {}

  return json({ ok: true, sites: FOUNDATION_SITES, bios: buildBios(business), done });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const id = String(body?.id || "");
  const wantDone = !!body?.done;
  if (!id) return json({ ok: false, error: "Missing id." }, 400);

  const admin = createAdminClient();
  const { data } = await admin.from("actions").select("id, payload").eq("user_id", userId).eq("type", TYPE).order("created_at", { ascending: true }).limit(1);
  const row = data?.[0] || null;
  let done = Array.isArray(row?.payload?.done) ? row.payload.done : [];
  done = done.filter((x) => x !== id);
  if (wantDone) done.push(id);

  if (row) await admin.from("actions").update({ payload: { done } }).eq("id", row.id);
  else await admin.from("actions").insert({ user_id: userId, type: TYPE, status: "proposed", title: "Foundation links", payload: { done } });

  return json({ ok: true, done });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
