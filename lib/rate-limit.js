// lib/rate-limit.js
// ── THE CHEAPEST GUARD ON A ROUTE THAT SPENDS MONEY ──
//
// Three routes run a paid AI call for a caller who is not signed in: /api/verdict
// (deliberately — it is the free scan that brings people in), /api/audit and
// /api/community (not deliberately; nobody noticed). Only the first had a limit,
// written inline in its own file.
//
// A second and third copy of the same twelve lines is how they drift apart, and
// the one that drifts is always the one nobody is looking at. One copy.
//
// WHAT THIS IS NOT. It is in-memory, so it is per serverless instance and resets
// on a cold start: a determined attacker with a spread of addresses gets through.
// It is a speed bump on casual abuse, not a security control, and calling it
// anything more would be the kind of claim this codebase keeps having to walk
// back. The real control on a route that spends money is requiring a login, which
// is what /api/content now does.

const BUCKETS = new Map();

/** The caller's address, as far as the platform will say. */
export function ipOf(req) {
  const xff = req?.headers?.get?.("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || req?.headers?.get?.("x-real-ip") || "anon";
}

/**
 * True when this caller has already had its allowance in the window.
 *
 * @param ip       from ipOf(request)
 * @param key      which allowance — routes with different costs get their own
 * @param max      how many in the window
 * @param windowMs how long the window is
 */
export function isLimited(ip, { key = "default", max = 5, windowMs = 10 * 60 * 1000 } = {}) {
  const id = `${key}:${ip || "anon"}`;
  const now = Date.now();
  const hits = (BUCKETS.get(id) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { BUCKETS.set(id, hits); return true; }
  hits.push(now);
  BUCKETS.set(id, hits);
  // A long-running instance would otherwise hold a bucket per address for ever.
  if (BUCKETS.size > 5000) {
    for (const [k, v] of BUCKETS) {
      if (!v.length || now - v[v.length - 1] > windowMs) BUCKETS.delete(k);
      if (BUCKETS.size <= 2500) break;
    }
  }
  return false;
}

/** The reply a limited caller gets. Plain, and never blames them. */
export function limitedResponse(what = "that") {
  return {
    ok: false,
    reason: "rate_limited",
    message: `You've run ${what} a few times already — give it a couple of minutes and try again.`,
  };
}
