// lib/commerce.js
// ── PROVIDER-AGNOSTIC COMMERCE LAYER ──
// Marketing Genie is never coupled to one payment provider. Every commerce
// platform (Stripe, Shopify, Paddle, Lemon Squeezy, 2Checkout, PayPro, …) is a
// thin adapter that (a) verifies its own webhook signature and (b) maps its
// payload into ONE normalized conversion. Everything downstream only knows the
// normalized shape. Adding a provider = a new adapter, not new architecture.
// (The same pattern will back our OWN billing in Phase 6 — agnostic both ways.)
//
// Normalized conversion: { value, currency, dedupeKey, campaign, ref }  (ref =
// the decision id we tagged via utm_content, so revenue traces to the action.)

import crypto from "crypto";

function hmacHex(raw, secret, algo = "sha256") { return crypto.createHmac(algo, secret).update(raw, "utf8").digest("hex"); }
function hmacB64(raw, secret, algo = "sha256") { return crypto.createHmac(algo, secret).update(raw, "utf8").digest("base64"); }
function safeEq(a, b) { try { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); } catch { return false; } }

// Each adapter: { label, secretEnv, verify(raw, headers, secret) -> bool,
//                 parse(payload, headers) -> normalized | null }
// NOTE: verify() is defense-in-depth and only ENFORCED when the secret env is
// set. The primary gate is our own per-user ingest token (below). Each verify
// should be validated against real provider payloads before production hardening.
export const PROVIDERS = {
  stripe: {
    label: "Stripe",
    secretEnv: "STRIPE_WEBHOOK_SECRET",
    verify(raw, headers, secret) {
      const sig = headers["stripe-signature"] || "";
      const parts = Object.fromEntries(sig.split(",").map((kv) => kv.split("=")));
      if (!parts.t || !parts.v1) return false;
      return safeEq(hmacHex(`${parts.t}.${raw}`, secret), parts.v1);
    },
    parse(p) {
      const ok = ["checkout.session.completed", "invoice.paid", "payment_intent.succeeded"];
      if (!ok.includes(p?.type)) return null;
      const o = p?.data?.object || {};
      const cents = o.amount_total ?? o.amount_paid ?? o.amount ?? 0;
      return { value: (Number(cents) || 0) / 100, currency: (o.currency || "usd").toUpperCase(), dedupeKey: `stripe:${p.id}`, campaign: o.metadata?.utm_campaign || null, ref: o.metadata?.utm_content || null };
    },
  },
  shopify: {
    label: "Shopify",
    secretEnv: "SHOPIFY_WEBHOOK_SECRET",
    verify(raw, headers, secret) { return safeEq(headers["x-shopify-hmac-sha256"] || "", hmacB64(raw, secret)); },
    parse(p, headers) {
      const topic = headers["x-shopify-topic"] || "";
      if (!/orders\/(paid|create)/.test(topic)) return null;
      const note = (p?.note_attributes || []).reduce((a, n) => { a[n.name] = n.value; return a; }, {});
      return { value: Number(p?.total_price) || 0, currency: p?.currency || "USD", dedupeKey: `shopify:${p?.id}`, campaign: note.utm_campaign || null, ref: note.utm_content || null };
    },
  },
  paddle: {
    label: "Paddle",
    secretEnv: "PADDLE_WEBHOOK_SECRET",
    verify(raw, headers, secret) {
      const sig = headers["paddle-signature"] || "";
      const parts = Object.fromEntries(sig.split(";").map((kv) => kv.split("=")));
      if (!parts.ts || !parts.h1) return false;
      return safeEq(hmacHex(`${parts.ts}:${raw}`, secret), parts.h1);
    },
    parse(p) {
      if (p?.event_type !== "transaction.completed") return null;
      const t = p?.data?.details?.totals || {};
      const cd = p?.data?.custom_data || {};
      return { value: (Number(t.total) || 0) / 100, currency: t.currency_code || "USD", dedupeKey: `paddle:${p?.event_id || p?.data?.id}`, campaign: cd.utm_campaign || null, ref: cd.utm_content || null };
    },
  },
  lemonsqueezy: {
    label: "Lemon Squeezy",
    secretEnv: "LEMONSQUEEZY_WEBHOOK_SECRET",
    verify(raw, headers, secret) { return safeEq(headers["x-signature"] || "", hmacHex(raw, secret)); },
    parse(p) {
      if (p?.meta?.event_name !== "order_created") return null;
      const a = p?.data?.attributes || {};
      const meta = p?.meta?.custom_data || {};
      return { value: (Number(a.total) || 0) / 100, currency: a.currency || "USD", dedupeKey: `ls:${p?.data?.id}`, campaign: meta.utm_campaign || null, ref: meta.utm_content || null };
    },
  },
};

// ── Per-user ingest token (DB-free): the primary gate on webhook ingress ──
// The user configures their provider webhook at /api/webhooks/<provider>?k=<token>.
// Token = base64url(userId).hmac — verifiable without a DB lookup.
function tokenSecret() { return process.env.WEBHOOK_SECRET || process.env.CRON_SECRET || "genie-dev-secret"; }
export function makeIngestToken(userId) {
  const b = Buffer.from(String(userId)).toString("base64url");
  const sig = hmacHex(b, tokenSecret()).slice(0, 20);
  return `${b}.${sig}`;
}
export function verifyIngestToken(token) {
  if (!token || !token.includes(".")) return null;
  const [b, sig] = token.split(".");
  if (!safeEq(hmacHex(b, tokenSecret()).slice(0, 20), sig)) return null;
  try { return Buffer.from(b, "base64url").toString("utf8"); } catch { return null; }
}
