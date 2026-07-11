// app/api/impact/route.js
// The proof: what business impact has Genie actually driven? Reads
// conversion.recorded events from the ledger and rolls them up — conversions,
// revenue, and where they came from. This is the endpoint that turns "Genie was
// busy" into "Genie generated $X." Powers the Impact surface.

import { createClient } from "@/lib/supabase/server";
import { getEvents } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const host = new URL(request.url).searchParams.get("host");
  const events = await getEvents(supabase, { userId: user.id, host, types: ["conversion.recorded"], limit: 500 });

  let value = 0;
  let currency = "USD";
  const bySource = {};
  const attributed = events.filter((e) => e.data?.decisionId).length;
  for (const e of events) {
    const d = e.data || {};
    value += Number(d.value) || 0;
    if (d.currency) currency = d.currency;
    const src = d.medium || d.source || "direct";
    bySource[src] = (bySource[src] || 0) + 1;
  }

  return json({
    ok: true,
    live: true,
    conversions: events.length,
    value: Math.round(value * 100) / 100,
    currency,
    attributed, // conversions Genie can trace to a specific action
    bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count })),
    recent: events.slice(0, 10).map((e) => ({ at: e.created_at, value: e.data?.value ?? 0, source: e.data?.medium || e.data?.source || "direct", campaign: e.data?.campaign || null })),
  });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
