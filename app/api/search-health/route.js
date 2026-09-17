// app/api/search-health/route.js
// POST { host } -> run the three Search Console checks (lib/search-health.js) and
//                  save the result. Called nightly and by the "Check now" button.
// GET  ?host=   -> the latest saved result, without calling Google.

import { createClient } from "@/lib/supabase/server";
import { resolveRadarUser } from "@/lib/radar-auth";
import { getValidAccessToken } from "@/lib/google";
import { runSearchHealth } from "@/lib/search-health";
import { recordEvent, getEvents } from "@/lib/events";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  const host = String(body?.host || "").trim();
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
  if (!conn) return json({ ok: true, available: false, reason: "not_connected" });
  const token = await getValidAccessToken(supabase, conn);
  if (!token) return json({ ok: true, available: false, reason: "no_token" });

  let result;
  try { result = await runSearchHealth(token, host); }
  catch { return json({ ok: false, error: "Search Console did not answer. Try again shortly." }, 502); }
  if (!result.available) return json({ ok: true, ...result });

  await recordEvent(supabase, { userId, host, type: "search.health", actor: "genie", subject: host, data: result });

  const issues = result.cannibalization.length + result.declining.length + result.indexing.problems.length;
  if (issues) {
    const bits = [];
    if (result.indexing.problems.length) bits.push(`${result.indexing.problems.length} page${result.indexing.problems.length > 1 ? "s" : ""} not on Google`);
    if (result.declining.length) bits.push(`${result.declining.length} losing clicks`);
    if (result.cannibalization.length) bits.push(`${result.cannibalization.length} search${result.cannibalization.length > 1 ? "es" : ""} where your pages compete`);
    await logActivity(supabase, userId, { host, verb: "discovered", message: "Checked your site in Google Search Console", detail: bits.join(" · "), meta: { issues } });
  }
  return json({ ok: true, ...result });
}

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const host = new URL(request.url).searchParams.get("host") || null;
  const [latest] = await getEvents(supabase, { userId: user.id, host, types: ["search.health"], limit: 1 });
  return json({ ok: true, result: latest?.data || null });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
