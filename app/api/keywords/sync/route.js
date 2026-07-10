// app/api/keywords/sync/route.js
// POST → pull real GSC data, reconcile keyword health, mark dead, add fresh.
// GET  → per-keyword daily history for the climbing progress bars.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createClient } from "@/lib/supabase/server";
import { syncKeywordsFromGsc } from "@/lib/keyword-sync";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { host } = body || {};
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  const result = await syncKeywordsFromGsc(supabase, userId, host);

  if (result.available) {
    const bits = [];
    if (result.updated) bits.push(`${result.updated} updated with real data`);
    if (result.added) bits.push(`${result.added} new keyword${result.added > 1 ? "s" : ""} found`);
    if (result.killed) bits.push(`${result.killed} retired`);
    if (bits.length) {
      await logActivity(supabase, userId, {
        host, verb: "keywords", message: "Synced real Google data",
        detail: bits.join(" · "), meta: result,
      });
    }
  }
  return json({ ok: true, ...result });
}

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const keyword = url.searchParams.get("keyword");
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  let q = supabase.from("keyword_history").select("keyword, clicks, impressions, position, recorded_on")
    .eq("user_id", user.id).eq("host", host).order("recorded_on", { ascending: true }).limit(400);
  if (keyword) q = q.eq("keyword", keyword);
  const { data } = await q;

  // Group by keyword for easy charting.
  const series = {};
  for (const row of data || []) {
    (series[row.keyword] ||= []).push({ date: row.recorded_on, clicks: row.clicks, impressions: row.impressions, position: row.position });
  }
  return json({ ok: true, series });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
