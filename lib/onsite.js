// lib/onsite.js
// ── THE ON-SITE LAYER (shared helpers) ──
// Genie's job is to find or convince a buyer and then hand them off to wherever
// the owner already closes deals. It never takes payment. These helpers back the
// three things that live on the owner's OWN site:
//   • counting real visits (so "traffic today" is first-party, not estimated)
//   • catching the visitors who aren't ready to buy yet
//   • pointing everyone at the money page, UTM-tagged so sales trace back
//
// Shared by /api/px/view, /api/px/lead, /api/embed and /api/traffic so the
// token gate, rate limit and entity resolution can never drift apart.

import { verifyIngestToken } from "@/lib/commerce";
import { hostOf } from "@/lib/business";

// ── Rate limiting ────────────────────────────────────────────────────────────
// In-memory, per token, matching the pixel/ai-router pattern. Pageviews get a
// far higher ceiling than conversions (a busy site legitimately fires many),
// but it is still bounded so a loop on someone's page can't flood the ledger.
const BUCKETS = new Map();
export function limited(token, { max = 120, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const key = `${token}:${max}`;
  const hits = (BUCKETS.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { BUCKETS.set(key, hits); return true; }
  hits.push(now);
  BUCKETS.set(key, hits);
  return false;
}

// Keep the map from growing without bound on a long-lived lambda.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of BUCKETS) {
    const live = v.filter((t) => now - t < 60_000);
    if (live.length) BUCKETS.set(k, live); else BUCKETS.delete(k);
  }
}, 300_000).unref?.();

// ── Token → user ─────────────────────────────────────────────────────────────
// Same DB-free HMAC token the commerce webhooks and conversion pixel already
// use, so the owner has exactly ONE value to paste and nothing new to configure.
export function userFromToken(k) {
  return verifyIngestToken(k);
}

// ── Which business is this? ──────────────────────────────────────────────────
// Resolve the entity the same way the conversion pixel does, so on-site traffic,
// leads and revenue all attach to the same host. Falls back to the account's
// most recent scan when the page didn't tell us.
export async function resolveHost(admin, userId, pageUrl) {
  const fromPage = pageUrl ? hostOf(pageUrl) : null;
  if (fromPage && fromPage !== "your site") return fromPage;
  try {
    const { data } = await admin.from("scans").select("final_url, url")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ? hostOf(data) : null;
  } catch { return null; }
}

// ── Privacy ──────────────────────────────────────────────────────────────────
// We store no IP, no cookie, and no personal data for a pageview. The referrer
// is reduced to its HOST so we can say "came from Google" without keeping the
// full query string a visitor may have typed. The session id is generated in the
// visitor's own tab (sessionStorage), lives only for that tab, and is used
// purely to tell one visitor's five pages from five different visitors.
export function refHost(referrer) {
  if (!referrer) return null;
  try {
    const h = new URL(referrer).hostname.replace(/^www\./, "");
    return h.slice(0, 120) || null;
  } catch { return null; }
}

// A path we are willing to store: no query string (it can carry personal data
// people paste into URLs), capped, and always rooted.
export function safePath(url) {
  if (!url) return "/";
  try {
    const p = new URL(url).pathname || "/";
    return p.slice(0, 200);
  } catch {
    const s = String(url).split("?")[0];
    return (s.startsWith("/") ? s : `/${s}`).slice(0, 200);
  }
}

// ── Email sanity (client-visible surface, so keep it strict but cheap) ───────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export function cleanEmail(v) {
  const e = String(v || "").trim().toLowerCase().slice(0, 254);
  return EMAIL_RE.test(e) ? e : null;
}

// ── CORS ─────────────────────────────────────────────────────────────────────
// These endpoints are called from the owner's own domain, which we do not know
// ahead of time, so the origin is open. That is safe here because every write is
// gated by the signed token, rate limited, capped, and stores no secrets.
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function corsJson(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
