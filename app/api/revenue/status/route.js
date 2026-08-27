// app/api/revenue/status/route.js
// ── REVENUE CONNECTION STATUS ──
// Powers the guided "connect your revenue" flow: has ANY webhook from the user's
// payment provider reached us yet (a test ping counts), and have any real sales come
// through? Lets the setup UI say "Connected ✓ — received a Stripe event just now"
// before a real purchase happens, so the user knows the wiring works.

import { createClient } from "@/lib/supabase/server";
import { getEvents } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const [received, sales] = await Promise.all([
    getEvents(supabase, { userId: user.id, types: ["webhook.received"], limit: 10 }),
    getEvents(supabase, { userId: user.id, types: ["conversion.recorded"], limit: 1 }),
  ]);

  const last = received[0] || null;
  return json({
    ok: true,
    connected: received.length > 0,
    lastEventAt: last?.created_at || null,
    provider: last?.data?.provider || last?.subject || null,
    hasSales: sales.length > 0,
    lastSaleAt: sales[0]?.created_at || null,
  });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
