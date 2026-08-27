// app/api/local/route.js
// The Local Service Optimizer surface. GET tells the UI whether this business is local
// (so the tool only shows for businesses it helps) and returns the last generated set.
// POST generates a fresh city-tagged service list from the business profile + a city.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { classifyEntity } from "@/lib/entity";
import { buildLocalServices, latestLocalServices } from "@/lib/local-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function context(supabase, userId, hostHint) {
  let host = hostHint || null, ai = null;
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { host = host || hostOf(scan); ai = scan.ai || null; }
  } catch {}
  const localImportance = (() => { try { return classifyEntity(ai || {})?.dims?.localImportance || 0; } catch { return 0; } })();
  return { host, ai: ai || {}, local: localImportance >= 0.6 };
}

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const hostHint = new URL(request.url).searchParams.get("host");
  const { host, local } = await context(supabase, user.id, hostHint);
  const latest = local ? await latestLocalServices(supabase, user.id, host) : null;
  return json({ ok: true, local, city: latest?.city || null, services: latest?.services || [], generatedAt: latest?.at || null });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { host, ai, local } = await context(supabase, userId, body?.host);
  if (!local) return json({ ok: false, reason: "not_local", message: "This tool is for local businesses with a physical service area. Your business looks online-first, so ‘near me’ tagging won’t help here." }, 200);

  const city = String(body?.city || "").trim();
  if (!city) return json({ ok: false, reason: "no_city", message: "Tell Genie your city (and it'll tag your services for ‘near me’ search)." }, 400);

  const r = await buildLocalServices(supabase, userId, host, ai, { city, services: body?.services || [] });
  if (!r.ok) {
    const msg = r.reason === "ai_failed" ? "Genie is busy — try again in a moment." : "Couldn’t build the service list. Add a bit more about what you sell and try again.";
    return json({ ok: false, reason: r.reason, message: msg }, r.reason === "ai_failed" ? 503 : 200);
  }
  return json({ ok: true, city: r.city, services: r.services, message: `Optimized ${r.services.length} services for ${r.city}. Paste them into your Google Business Profile.` });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
