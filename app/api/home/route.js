// app/api/home/route.js
// The clean daily home's data: Genie's strength (from real connections),
// today's counts (taps + replies waiting), and an HONEST traffic graph built
// from real GSC daily snapshots. No fake curves — if there's no data, it says so.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  // Strength from real connections + profile.
  const { data: conns } = await supabase.from("connections").select("provider").eq("user_id", user.id);
  const providers = new Set((conns || []).map((c) => c.provider));
  const { data: prof } = await supabase.from("profiles").select("sender_email, company_name").eq("id", user.id).maybeSingle();
  let strength = 0;
  if (providers.has("google")) strength += 30;
  if (providers.has("x")) strength += 15;
  if (providers.has("wordpress")) strength += 15;
  if (prof?.sender_email) strength += 10;
  if (prof?.company_name) strength += 10;
  // Signed-in tap platforms are tracked client-side; give a base for having a business.
  strength = Math.min(100, strength + 20);

  // Today's counts.
  let placementsQ = supabase.from("placements").select("id, status, platform").eq("user_id", user.id);
  if (host) placementsQ = placementsQ.eq("host", host);
  const { data: placements } = await placementsQ;
  const readyTaps = (placements || []).filter((p) => p.status === "ready").length;

  let notifQ = supabase.from("notifications").select("id, kind, status").eq("user_id", user.id).eq("kind", "reply").neq("status", "actioned").neq("status", "dismissed");
  if (host) notifQ = notifQ.eq("host", host);
  const { data: replies } = await notifQ;
  const repliesWaiting = (replies || []).length;

  // Honest traffic graph: sum real clicks per day from keyword_history.
  let histQ = supabase.from("keyword_history").select("clicks, impressions, recorded_on").eq("user_id", user.id);
  if (host) histQ = histQ.eq("host", host);
  const { data: hist } = await histQ;
  const byDay = {};
  for (const row of hist || []) {
    const d = row.recorded_on;
    if (!byDay[d]) byDay[d] = { date: d, clicks: 0, impressions: 0 };
    byDay[d].clicks += row.clicks || 0;
    byDay[d].impressions += row.impressions || 0;
  }
  const traffic = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
  const hasTraffic = traffic.length >= 2 && traffic.some((t) => t.clicks > 0);

  return json({
    ok: true,
    strength,
    connections: { google: providers.has("google"), x: providers.has("x"), wordpress: providers.has("wordpress") },
    profileComplete: !!(prof?.sender_email && prof?.company_name),
    today: { readyTaps, repliesWaiting },
    traffic,
    hasTraffic,
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
