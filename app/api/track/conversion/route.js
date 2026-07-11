// app/api/track/conversion/route.js
// The universal conversion sink. Anything that knows a customer converted — a
// site pixel, a Stripe/Shopify webhook (via the cron-secret service path), or a
// manual entry — posts here. It writes a conversion.recorded event and closes the
// loop to the originating decision. GA4/Stripe/Shopify connectors are just callers
// of this one endpoint; the measurement architecture stays elegantly simple.

import { resolveRadarUser } from "@/lib/radar-auth";
import { recordConversion } from "@/lib/attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { value, currency, source, medium, campaign, ref, decisionId, host, dedupeKey } = body || {};
  await recordConversion(supabase, {
    userId, host: host || null,
    value, currency: currency || "USD",
    source, medium, campaign, ref, decisionId, dedupeKey,
  });
  return json({ ok: true });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
