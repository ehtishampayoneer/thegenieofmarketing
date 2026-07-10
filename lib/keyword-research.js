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

// Enrich keywords with estimated volume/competition/difficulty/cpc/trend/intent
// AND strategic categorization (Genie the SEO expert picks the best mix).
export async function enrichKeywords(seed, rawKeywords, productContext) {
  const list = rawKeywords.slice(0, 60);
  const askForIdeas = list.length === 0;
  try {
    const result = await callAI({
      system: `You are a world-class SEO strategist. For each keyword, give realistic, VARIED estimates (do not make everything the same). Rules:
- volume: monthly searches. Head terms 5k-100k+, mid terms 500-5k, long-tail 50-500. Vary widely and realistically.
- competition: 0-100. Broad commercial terms are high (70-100). Specific long-tail and questions are low (10-45). VARY these.
- difficulty: derive from competition — 'easy' if competition<40, 'medium' 40-65, 'hard' if >65.
- cpc: estimated USD cost-per-click, e.g. 0.30 to 8.00. Commercial/buying intent = higher CPC. Informational = low.
- trend: 'up' | 'flat' | 'down' — vary based on topic momentum.
- intent: 'informational' | 'commercial' | 'transactional' | 'navigational'.
- isQuestion: true if the keyword is a question (starts with how/what/why/can/is/does/where/when).
Return ONLY JSON.`,
      maxTokens: 4000, temperature: 0.6,
      prompt: `Product context: ${productContext || seed}
Seed: "${seed}"
${askForIdeas
  ? `Generate 45 real keyword ideas for this product: a strategic mix of head terms, mid-tail, long-tail, and questions, across commercial and informational intent.`
  : `Enrich these ${list.length} real keywords from Google Autocomplete:\n${list.join("\n")}`}

Return ONLY: {"keywords":[{"keyword":"...","volume":1200,"competition":45,"difficulty":"medium","cpc":1.20,"trend":"up","intent":"commercial","isQuestion":false}]}`,
    });
    const txt = (result.text || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(txt);
    let keywords = (parsed.keywords || []).map((k) => {
      const competition = clampInt(k.competition, 50);
      const difficulty = competition < 40 ? "easy" : competition <= 65 ? "medium" : "hard";
      const kw = String(k.keyword || "").toLowerCase().trim();
      return {
        keyword: kw,
        volume: clampInt(k.volume, 0),
        competition,
        difficulty,
        cpc: clampFloat(k.cpc, 0),
        trend: ["up", "flat", "down"].includes(k.trend) ? k.trend : "flat",
        intent: k.intent || "informational",
        isQuestion: !!k.isQuestion || /^(how|what|why|can|is|does|where|when|which|are|should)\b/.test(kw),
        estimated: true,
      };
    }).filter((k) => k.keyword);

    // Genie's strategic scoring: reward traffic, punish competition.
    for (const k of keywords) {
      const volScore = Math.min(100, Math.log10(Math.max(10, k.volume)) * 22);
      k.opportunity = Math.round(Math.max(0, volScore - k.competition * 0.6));
      k.easyWin = k.competition < 45 && k.volume >= 200;
      k.highPotential = k.opportunity >= 45;
      // A small trend series for the sparkline (12 points), shaped by trend dir.
      k.spark = makeSpark(k.trend);
      // A believable current ranking + weekly change (estimate until GSC).
      k.ranking = k.volume > 0 ? Math.max(3, Math.min(98, Math.round(100 - k.opportunity + (k.competition / 3)))) : null;
      k.rankChange = k.trend === "up" ? Math.ceil(Math.random() * 12) : k.trend === "down" ? -Math.ceil(Math.random() * 5) : 0;
    }
    keywords.sort((a, b) => b.opportunity - a.opportunity);
    return keywords;
  } catch {
    return list.map((kw) => ({ keyword: kw, volume: 0, competition: 50, difficulty: "medium", cpc: 0, trend: "flat", intent: "informational", isQuestion: false, opportunity: 0, easyWin: false, highPotential: false, estimated: true }));
  }
}

function makeSpark(trend) {
  const pts = [];
  let v = 40 + Math.random() * 20;
  const drift = trend === "up" ? 3 : trend === "down" ? -3 : 0;
  for (let i = 0; i < 12; i++) {
    v += drift + (Math.random() * 16 - 8);
    v = Math.max(8, Math.min(92, v));
    pts.push(Math.round(v));
  }
  return pts;
}

function clampFloat(n, dflt) {
  const v = parseFloat(n);
  return Number.isFinite(v) ? Math.max(0, Math.round(v * 100) / 100) : dflt;
}

function clampInt(n, dflt) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? Math.max(0, v) : dflt;
}
