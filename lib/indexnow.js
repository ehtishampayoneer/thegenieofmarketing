// lib/indexnow.js
// ── INSTANT INDEXING (IndexNow) ──
// The moment Genie publishes a page, tell the search engines — so it's indexed in
// HOURS, not the usual weeks. IndexNow is free and account-less (Bing, Yandex,
// Seznam, Naver). It matters doubly here: ChatGPT Search and Perplexity lean on
// Bing's index, so fast Bing inclusion accelerates the AI citations Genie is built
// to win. Env-gated (INDEXNOW_KEY) + a no-op when unset. Never throws.

export async function pingIndexNow(urls) {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return { ok: false, reason: "no_key" };
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
  if (!list.length) return { ok: false, reason: "no_urls" };
  try {
    const first = new URL(list[0]);
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: first.host,
        key,
        keyLocation: `${first.origin}/api/indexnow/key`,
        urlList: list.slice(0, 100),
      }),
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, reason: "error" };
  }
}
