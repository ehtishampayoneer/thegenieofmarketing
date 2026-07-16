// lib/autocomplete.js
// ── FREE, REAL KEYWORD GROUNDING (Google Autocomplete) ──
// Google's public Suggest endpoint returns the actual phrases people type. We use
// it to ground Genie's keyword candidates in reality instead of pure AI guesses.
// No key, no account. Best-effort: if it's rate-limited from the server, we just
// fall back to the AI's own ideas.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export async function autocompleteSuggestions(seed) {
  const q = String(seed || "").trim();
  if (!q) return [];
  try {
    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json(); // [ query, [suggestions...] ]
    return Array.isArray(data?.[1]) ? data[1].filter((s) => typeof s === "string") : [];
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
