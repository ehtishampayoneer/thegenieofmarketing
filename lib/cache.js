// lib/cache.js
// Provider-agnostic TTL cache. In-memory today (per serverless instance); the
// interface (get/set) is deliberately tiny so it can be swapped for a durable
// store (Upstash Redis / Supabase) with zero call-site changes when we scale.
// Used to dedupe identical external calls (e.g., the same web search across
// entities/nights) — the same code path whether we have 10 users or 100,000.

const store = new Map(); // key -> { v, exp }
const MAX = 3000;

export function cacheGet(key) {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.exp) { store.delete(key); return undefined; }
  return e.v;
}

export function cacheSet(key, v, ttlMs) {
  store.set(key, { v, exp: Date.now() + ttlMs });
  if (store.size > MAX) prune();
}

function prune() {
  const now = Date.now();
  for (const [k, e] of store) if (now > e.exp) store.delete(k);
  if (store.size > MAX) {
    const it = store.keys();
    for (let i = 0; i < Math.floor(MAX / 4); i++) { const k = it.next().value; if (k) store.delete(k); }
  }
}
