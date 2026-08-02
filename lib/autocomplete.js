// lib/autocomplete.js
// ── FREE, REAL KEYWORD GROUNDING (Google Autocomplete) ──
// Google's public Suggest endpoint returns the actual phrases people type. We use
// it to ground Genie's keyword candidates in reality instead of pure AI guesses.
// No key, no account. Best-effort: if it's rate-limited from the server, we just
// fall back to the AI's own ideas.

import { cacheGet, cacheSet } from "@/lib/cache";
import { logger } from "@/lib/log";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
// What people type doesn't change hour to hour, and this is an unofficial endpoint
// that WILL throttle if hammered. Caching cuts repeat calls (re-derives, rebuilds,
// nightly jobs over the same seeds) to near zero.
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function autocompleteSuggestions(seed) {
  const q = String(seed || "").trim();
  if (!q) return [];
  const key = `ac:${q.toLowerCase()}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  try {
    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      // 429 here means Google is throttling this server. Keyword derivation still
      // works (AI ideas), but it's no longer GROUNDED in real searches — say so in
      // the logs rather than quietly degrading quality.
      logger.warn("autocomplete.blocked", { status: res.status, seed: q.slice(0, 60) });
      return [];
    }
    const data = await res.json(); // [ query, [suggestions...] ]
    const out = Array.isArray(data?.[1]) ? data[1].filter((s) => typeof s === "string") : [];
    cacheSet(key, out, TTL_MS);
    return out;
  } catch { return []; }
}

// Expand a few seed terms into a deduped set of real searched phrases.
export async function expandSeeds(seeds, limit = 60) {
  const list = (seeds || []).filter(Boolean).slice(0, 8);
  if (!list.length) return [];
  const results = await Promise.allSettled(list.map(autocompleteSuggestions));
  const set = new Set();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const s of r.value) {
      const clean = s.toLowerCase().trim();
      if (clean.length > 2 && clean.length < 80) set.add(clean);
    }
  }
  return [...set].slice(0, limit);
}
