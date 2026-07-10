// lib/keyword-research.js
// A real, free keyword RESEARCH engine (like a Keyword Planner). Discovery is
// REAL and free via Google Autocomplete (the same source that powers the search
// box). Volume/competition/difficulty are AI estimates, clearly labeled, and
// upgrade to real numbers when Google Search Console is connected.

import { callAI } from "@/lib/ai-router";

// Pull real autocomplete suggestions for a seed. Expands with a-z / question
// prefixes to surface long-tail keywords people actually type.
export async function discoverKeywords(seed) {
  const clean = String(seed || "").trim().toLowerCase();
  if (!clean) return [];
  const prefixes = ["", ...("abcdefghijklmnopqrstuvwxyz".split("")), "how ", "best ", "why ", "for ", "vs "];
  const found = new Set();

  // Fire a bounded set of autocomplete calls in parallel.
  const queries = prefixes.map((pre) => pre.endsWith(" ") ? `${pre}${clean}` : `${clean} ${pre}`.trim());
  const results = await Promise.allSettled(
    queries.slice(0, 20).map((q) => fetchSuggest(q))
  );
  for (const r of results) {
    if (r.status === "fulfilled") for (const s of r.value) found.add(s);
  }
  found.delete(clean);
  return Array.from(found).slice(0, 120);
}

async function fetchSuggest(q) {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    // Firefox client returns [query, [suggestions...]]
    return Array.isArray(data?.[1]) ? data[1].filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

// Enrich a batch of raw keywords with estimated volume/competition/difficulty/
// intent using AI. Estimates are labeled as such in the UI. If discovery found
// nothing (e.g. network), AI also generates the keyword ideas themselves.
export async function enrichKeywords(seed, rawKeywords, productContext) {
  const list = rawKeywords.slice(0, 60);
  const askForIdeas = list.length === 0;
  try {
    const result = await callAI({
      system: "You are an SEO keyword research engine. Return ONLY JSON. For each keyword estimate: volume (monthly searches, integer estimate), trend ('up'|'flat'|'down'), competition (0-100), difficulty ('easy'|'medium'|'hard'), intent ('informational'|'commercial'|'transactional'|'navigational'). Base estimates on realistic search behaviour. Be honest: long-tail = lower volume, lower competition.",
      maxTokens: 3000, temperature: 0.4,
      prompt: `Product context: ${productContext || seed}
Seed keyword: "${seed}"
${askForIdeas
  ? `Generate 40 real, useful keyword ideas people would search related to this product (mix of head terms and long-tail, commercial and informational).`
  : `Here are ${list.length} real keywords discovered from Google Autocomplete. Enrich each:\n${list.join("\n")}`}

Return ONLY this JSON:
{"keywords":[{"keyword":"...","volume":1200,"trend":"up","competition":45,"difficulty":"medium","intent":"commercial"}]}`,
    });
    const txt = (result.text || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(txt);
    return (parsed.keywords || []).map((k) => ({
      keyword: String(k.keyword || "").toLowerCase().trim(),
      volume: clampInt(k.volume, 0),
      trend: ["up", "flat", "down"].includes(k.trend) ? k.trend : "flat",
      competition: clampInt(k.competition, 50),
      difficulty: ["easy", "medium", "hard"].includes(k.difficulty) ? k.difficulty : "medium",
      intent: k.intent || "informational",
      estimated: true,
    })).filter((k) => k.keyword);
  } catch {
    // Last-resort: return raw keywords with neutral estimates.
    return list.map((kw) => ({ keyword: kw, volume: 0, trend: "flat", competition: 50, difficulty: "medium", intent: "informational", estimated: true }));
  }
}

function clampInt(n, dflt) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? Math.max(0, v) : dflt;
}
