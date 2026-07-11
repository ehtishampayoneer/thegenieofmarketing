// app/api/webhooks/[provider]/route.js
// One generic webhook ingress for EVERY commerce provider. The user points their
// Stripe/Shopify/Paddle/Lemon Squeezy webhook at
//   /api/webhooks/<provider>?k=<their ingest token>
// We verify the ingest token (primary gate) + the provider signature (when its
// secret is configured), normalize the payload via the adapter, resolve which
// entity it belongs to, and record the conversion. Provider-agnostic by design.

import { createAdminClient } from "@/lib/supabase/admin";
import { PROVIDERS, verifyIngestToken } from "@/lib/commerce";
import { recordConversion } from "@/lib/attribution";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const adapter = PROVIDERS[params.provider];
  if (!adapter) return json({ ok: false, error: "unknown_provider" }, 404);

  // Gate 1: our per-user ingest token identifies the account (no session on webhooks).
  const userId = verifyIngestToken(new URL(request.url).searchParams.get("k"));
  if (!userId) return json({ ok: false, error: "invalid_token" }, 401);

  const raw = await request.text();
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  // Gate 2: provider signature — enforced only when its secret is configured.
  const secret = process.env[adapter.secretEnv];
  if (secret && !adapter.verify(raw, headers, secret)) return json({ ok: false, error: "bad_signature" }, 401);

  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ ok: true, ignored: "unparseable" }); }

  const norm = adapter.parse(payload, headers);
  if (!norm) return json({ ok: true, ignored: "not_a_purchase" }); // ignore non-purchase events cleanly

  const admin = createAdminClient();
  // Which entity? Prefer the decision we tagged (ref), else the user's primary scan.
  let host = null;
  try {
    if (norm.ref) { const { data } = await admin.from("decisions").select("host").eq("id", norm.ref).maybeSingle(); host = data?.host || null; }
    if (!host) { const { data } = await admin.from("scans").select("final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(); host = data ? hostOf(data) : null; }
  } catch {}

  await recordConversion(admin, {
    userId, host,
    value: norm.value, currency: norm.currency,
    source: params.provider, medium: params.provider,
    campaign: norm.campaign, ref: norm.ref, decisionId: norm.ref || null,
    dedupeKey: norm.dedupeKey,
  });

  return json({ ok: true });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
