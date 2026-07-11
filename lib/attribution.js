// lib/attribution.js
// ── ATTRIBUTION ──
// Ties Genie's actions → clicks → conversions → revenue, on top of the Event
// Ledger. Two small pieces: tag every link Genie publishes so clicks are
// trackable, and record conversions as events that ALSO close the loop back to
// the originating decision — so the Learning Loop learns from money, not vanity.
// Deliberately minimal; connectors (GA4/Stripe/Shopify) are just callers of this.

import { recordEvent } from "@/lib/events";
import { recordOutcome } from "@/lib/growth-memory";

const SOURCE = "marketing-genie";

// UTM-tag a link so every click Genie generates is attributable.
// ref = the decision/placement id, so a conversion can trace back to the action.
export function taggedLink(rawUrl, { channel = "genie", campaign = "", ref = "" } = {}) {
  try {
    const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    u.searchParams.set("utm_source", SOURCE);
    if (channel) u.searchParams.set("utm_medium", slug(channel));
    if (campaign) u.searchParams.set("utm_campaign", slug(campaign));
    if (ref) u.searchParams.set("utm_content", String(ref));
    return u.toString();
  } catch {
    return rawUrl;
  }
}

// Pull Genie attribution back out of inbound params (pixel/webhook/redirect).
export function attributionFromParams(params = {}) {
  const g = (k) => params[k] ?? params[k.toUpperCase()] ?? null;
  return {
    fromGenie: (g("utm_source") || "").toLowerCase() === SOURCE,
    medium: g("utm_medium"),
    campaign: g("utm_campaign"),
    ref: g("utm_content"),
  };
}

// The universal conversion sink. Writes a conversion.recorded event (idempotent
// via dedupeKey) and, if we know which decision drove it, marks that decision
// "converted" with its value — the revenue signal the Learning Loop consumes.
export async function recordConversion(supabase, {
  userId = null, host = null, value = 0, currency = "USD",
  source = null, medium = null, campaign = null, ref = null,
  decisionId = null, dedupeKey = null,
} = {}) {
  const data = { value: Number(value) || 0, currency, source, medium, campaign, ref, decisionId };
  await recordEvent(supabase, {
    userId, host, type: "conversion.recorded", actor: "user",
    subject: campaign || source || "conversion", data, dedupeKey,
  });
  if (decisionId) {
    try { await recordOutcome(supabase, { decisionId, outcome: "converted", metrics: { value: data.value, currency } }); } catch {}
  }
  return true;
}

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); }
