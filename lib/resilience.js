// lib/resilience.js
// Small retry-with-backoff primitive for external calls. Exponential backoff +
// jitter, with a retryOn predicate so we retry transient failures (network) but
// NOT ones better handled by failover (e.g., 429/5xx → move to the next provider).

export async function retry(fn, { tries = 2, baseMs = 300, factor = 2, jitter = true, retryOn = () => true } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (i === tries - 1 || !retryOn(e)) throw e;
      const backoff = baseMs * Math.pow(factor, i) * (jitter ? 0.5 + Math.random() : 1);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw last;
}
