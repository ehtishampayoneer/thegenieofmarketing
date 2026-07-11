// app/api/entity/route.js
// Resolve (GET) or correct (POST) the ENTITY Genie is growing for a host.
// Read-only to every existing capability; purely additive. The entity's adaptive
// playbook is what future capabilities (buyer-intent, AEO, content, outreach)
// consume so one intelligence adapts to any entity type automatically.

import { createClient } from "@/lib/supabase/server";
import { resolveEntity } from "@/lib/growth-memory";
import { entityTypeOptions } from "@/lib/entity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function latestScanAi(supabase, userId, host) {
  try {
    const { data } = await supabase
      .from("scans")
      .select("ai, final_url, url, created_at")
      .eq("user_id", userId)
      .or(`final_url.ilike.%${host}%,url.ilike.%${host}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.ai || {};
  } catch {
    return {};
  }
}

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: "Not authenticated." }, 401);

  const host = new URL(request.url).searchParams.get("host");
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  const ai = await latestScanAi(supabase, user.id, host);
  const entity = await resolveEntity(supabase, user.id, host, ai);
  return json({ ok: true, entity, options: entityTypeOptions() });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: "Not authenticated." }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, type } = body || {};
  if (!host || !type) return json({ ok: false, error: "host and type are required." }, 400);

  const ai = await latestScanAi(supabase, user.id, host);
  const entity = await resolveEntity(supabase, user.id, host, ai, type);
  return json({ ok: true, entity });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
