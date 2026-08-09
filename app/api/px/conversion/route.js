// app/api/px/conversion/route.js
// ── THE UNIVERSAL CONVERSION PIXEL ──
// For every business that ISN'T on a supported checkout (lead-gen, services,
// bookings, custom carts): a public, token-keyed conversion beacon. The owner
// drops one snippet on their thank-you page and "Customers won" lights up — no
// Stripe/Shopify required. Keyed by the SAME per-user ingest token as the
// webhooks (lib/commerce), so nothing new to configure.
//
// Honesty + safety: pixel conversions are tagged source:"pixel" (soft signal —
// the token lives in client JS and is therefore public), rate-limited per token,
// value-capped, and de-duped. Signature-verified webhooks remain the hard source
// of truth; this is the wide net for the businesses webhooks can't reach.

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyIngestToken } from "@/lib/commerce";
import { recordConversion } from "@/lib/attribution";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF for the no-JS <img> beacon fallback.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// Per-token rate limit (in-memory; matches the ai-router pattern).
const RL = new Map();
const WINDOW_MS = 60_000, MAX_PER_WINDOW = 20;
function limited(tok) {
  const now = Date.now();
  const a = (RL.get(tok) || []).filter((t) => now - t < WINDOW_MS);
  if (a.length >= MAX_PER_WINDOW) { RL.set(tok, a); return true; }
  a.push(now); RL.set(tok, a);
  return false;
}

async function ingest({ k, value, currency, ref, campaign, dedupeKey }) {
  const userId = verifyIngestToken(k);
  if (!userId) return 401;
  if (limited(k)) return 429;

  let admin;
  try { admin = createAdminClient(); } catch { return 500; }

  // Which entity? Prefer the decision we tagged (ref → utm_content), else the
  // account's latest scan — identical resolution to the commerce webhook.
  let host = null;
  try {
    if (ref) { const { data } = await admin.from("decisions").select("host").eq("id", ref).maybeSingle(); host = data?.host || null; }
    if (!host) { const { data } = await admin.from("scans").select("final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(); host = data ? hostOf(data) : null; }
  } catch {}

  const v = Math.max(0, Math.min(Number(value) || 0, 1_000_000)); // cap runaway/abusive values
  try {
    await recordConversion(admin, {
      userId, host, value: v,
      currency: String(currency || "USD").slice(0, 8).toUpperCase(),
      source: "pixel", medium: "pixel",
      campaign: campaign || null, ref: ref || null, decisionId: ref || null,
      dedupeKey: dedupeKey || null,
    });
  } catch { return 500; }
  return 200;
}

export async function POST(request) {
  // Accept JSON body (fetch) or a sendBeacon blob; query params as fallback.
  let body = {};
  try { body = await request.json(); }
  catch { try { body = JSON.parse(await request.text()); } catch {} }
  const q = new URL(request.url).searchParams;
  const status = await ingest({
    k: body.k || q.get("k"),
    value: body.value ?? q.get("value"),
    currency: body.currency || q.get("currency"),
    ref: body.ref || q.get("ref"),
    campaign: body.campaign || q.get("campaign"),
    dedupeKey: body.dedupeKey || q.get("d"),
  });
  return new Response(JSON.stringify({ ok: status === 200 }), {
    status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// Image-beacon fallback: <img src=".../api/px/conversion?k=..&value=..&d=.."> — always
// returns the pixel so it can never break the customer's page, even on error.
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  try {
    await ingest({ k: q.get("k"), value: q.get("value"), currency: q.get("currency"), ref: q.get("ref"), campaign: q.get("campaign"), dedupeKey: q.get("d") });
  } catch {}
  return new Response(GIF, { status: 200, headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" } });
}

// Allow the browser preflight for cross-origin POSTs from the customer's site.
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  } });
}
