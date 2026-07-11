// app/api/analytics/sync/route.js
// Pull Genie-attributed traffic from GA4 (via the Google connection) and record it
// as a traffic.recorded event so Impact can show real sessions Genie drove.
// Revenue stays sourced from the commerce webhooks (single source of $ truth) to
// avoid double-counting; GA4 revenue is captured for context only.
// Runs on demand and nightly (via the entity pipeline). Never throws.

import { resolveRadarUser } from "@/lib/radar-auth";
import { getValidAccessToken } from "@/lib/google";
import { listGa4Properties, getGenieAnalytics } from "@/lib/analytics";
import { recordEvent } from "@/lib/events";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  const host = body?.host || null;

  const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
  if (!conn) return json({ ok: false, reason: "not_connected" });

  const token = await getValidAccessToken(supabase, conn);
  if (!token) return json({ ok: false, reason: "no_token" });

  // Resolve the GA4 property (stored preference, else auto-discover + remember).
  let property = conn.meta?.ga4_property || null;
  if (!property) {
    const props = await listGa4Properties(token);
    if (!props.length) return json({ ok: false, reason: "no_ga4_property" });
    property = props[0].property;
    try { await supabase.from("connections").update({ meta: { ...(conn.meta || {}), ga4_property: property } }).eq("id", conn.id); } catch {}
  }

  let a;
  try { a = await getGenieAnalytics(token, property, 30); }
  catch (e) { return json({ ok: false, reason: "ga4_error", detail: String(e?.message || e) }); }

  await recordEvent(supabase, {
    userId, host, type: "traffic.recorded", actor: "system", subject: "ga4",
    data: { source: "ga4", genieSessions: a.genieSessions, genieConversions: a.genieConversions, genieRevenue: a.genieRevenue, totalSessions: a.totalSessions, share: a.share, currency: a.currency },
    dedupeKey: `ga4:${host || "all"}:${new Date().toISOString().slice(0, 10)}`,
  });
  if (a.genieSessions > 0) {
    await logActivity(supabase, userId, { host, verb: "traction", message: `Genie drove ${a.genieSessions} real sessions (GA4)`, detail: `${a.share}% of your traffic`, meta: { source: "ga4" } });
  }

  return json({ ok: true, ...a });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
