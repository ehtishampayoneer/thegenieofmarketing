// lib/intent.js
// ── THE BUYER-INTENT BRAIN ──
// One universal intelligence that finds people most likely to become customers
// across the WHOLE journey and the whole internet — not more traffic, better
// buyers. Platform-agnostic: the scoring/ranking is shared; each platform is a
// thin adapter in the source registry. The ENTITY playbook decides which sources
// to hunt, so a SaaS, a restaurant, and an artist each get hunted where their
// buyers actually research and decide.
//
//   buildIntentQueries(entity, ai)  → the buyer-question universe
//   selectSources(entity)           → which platforms to hunt (from the playbook)
//   scoreIntent(text, ctx)          → journey stage + intent 0..100 + signals
//   rankOpportunities(candidates)   → prioritized, deduped, reachability-aware

import { painQueries, awarenessOf } from "@/lib/buyer-angle";

// The customer journey. Intent (and value to Genie) rises left → right, peaking
// at "comparing" and "ready_to_buy" — people about to choose.
export const JOURNEY = ["unaware", "problem_aware", "solution_aware", "comparing", "ready_to_buy", "post_purchase"];
const STAGE_VALUE = { unaware: 8, problem_aware: 30, solution_aware: 52, comparing: 84, ready_to_buy: 96, post_purchase: 40 };

// Linguistic signals of intent. Each maps to a journey stage + a weight.
const SIGNALS = [
  { re: /\b(vs\.?|versus|compared? to|comparison|alternative[s]? to|instead of)\b/i, stage: "comparing", w: 26, label: "comparison" },
  { re: /\bbest\b.*\b(for|to)\b/i, stage: "comparing", w: 18, label: "best-for query" },
  { re: /\b(worth it|worth the|is it good|any good|honest review|actually work)\b/i, stage: "ready_to_buy", w: 24, label: "evaluation" },
  { re: /\b(pricing|price|how much|cost|per month|per year|discount|coupon|deal)\b/i, stage: "ready_to_buy", w: 22, label: "pricing" },
  { re: /\b(recommend|recommendation|suggest|any(one)? (use|using|tried)|looking for|need a|need an|shopping for|in the market for)\b/i, stage: "ready_to_buy", w: 20, label: "seeking-recommendation" },
  { re: /\b(should i (buy|get|use|switch)|which (one|tool|option) should)\b/i, stage: "ready_to_buy", w: 22, label: "decision" },
  { re: /\b(how (do|to)|is there a|tool for|software for|app for|service for|best way to)\b/i, stage: "solution_aware", w: 12, label: "solution-seeking" },
  { re: /\b(problem|issue|struggling|frustrat|hate|annoying|can'?t figure|stuck|pain)\b/i, stage: "problem_aware", w: 8, label: "problem" },
];
const URGENCY = /\b(asap|urgent|today|right now|this week|deadline|immediately|need .* fast)\b/i;

// Score a candidate's text for buyer intent, competitor-aware.
export function scoreIntent(text, { competitors = [] } = {}) {
  const t = String(text || "");
  if (!t.trim()) return { score: 0, stage: "unaware", signals: [], competitorMention: false };

  let best = "unaware";
  let signalScore = 0;
  const labels = [];
  for (const s of SIGNALS) {
    if (s.re.test(t)) {
      signalScore += s.w;
      labels.push(s.label);
      if (STAGE_VALUE[s.stage] > STAGE_VALUE[best]) best = s.stage;
    }
  }
  // Competitor mention = someone actively evaluating your space → strong signal.
  const competitorMention = competitors.some((c) => c && new RegExp(`\\b${escapeRe(c)}\\b`, "i").test(t));
  if (competitorMention) { signalScore += 22; if (STAGE_VALUE.comparing > STAGE_VALUE[best]) best = "comparing"; labels.push("competitor mention"); }

  if (URGENCY.test(t)) { signalScore += 10; labels.push("urgency"); }

  // Blend stage value with matched-signal strength; specificity nudges it up.
  const specificity = Math.min(12, Math.round(t.length / 40));
  const score = clamp(Math.round(STAGE_VALUE[best] * 0.55 + Math.min(45, signalScore) + specificity * 0.4));
  return { score, stage: best, signals: [...new Set(labels)], competitorMention };
}

// How can Genie actually reach this person? (drives the action + owned/tap logic)
export function reachabilityFor(platform) {
  switch (platform) {
    case "reddit": return { action: "reply", owned: false };
    case "quora": return { action: "answer", owned: false };
    case "hackernews": return { action: "reply", owned: false };
    case "stackexchange": return { action: "answer", owned: false };
    case "github": return { action: "reply", owned: false };
    case "producthunt": return { action: "reply", owned: false };
    case "youtube": return { action: "reply", owned: false };
    case "forum": return { action: "reply", owned: false };
    case "review": return { action: "content", owned: false };   // usually can't reply — win the comparison instead
    case "marketplace": return { action: "content", owned: false };
    case "x": return { action: "reply", owned: true };            // owned once X is connected
    case "linkedin": return { action: "post", owned: false };
    default: return { action: "reply", owned: false };
  }
}

// ── Source registry: platform adapters are config; discovery runs in the route
//    via lib/search.js. channelKeys tie each source to the entity playbook so the
//    playbook decides where to hunt. `mode`: search | native | connected | ai.
export const INTENT_SOURCES = {
  // Reliable, free, keyless APIs (work from any server) — the fuel that makes the
  // storm real. `mode: "api"` routes to lib/intent-sources.js instead of web search.
  hackernews:   { key: "hackernews", label: "Hacker News", platform: "hackernews", mode: "api", channelKeys: ["forums", "search", "aiSearch"] },
  // Label is deliberately generic: the actual sites are chosen per business by
  // lib/intent-verticals.js (Home Improvement for a builder, Seasoned Advice for
  // a caterer, Hardware Recommendations for a product seller), so calling this
  // "Software Recommendations" was wrong for every non-tech business.
  stackexchange:{ key: "stackexchange", label: "Q&A communities", platform: "stackexchange", mode: "api", channelKeys: ["forums", "reviews", "search"] },
  github:       { key: "github", label: "GitHub", platform: "github", mode: "api", channelKeys: ["forums", "aiSearch"] },
  reddit:       { key: "reddit", label: "Reddit", platform: "reddit", site: "reddit.com", mode: "native", channelKeys: ["reddit"] },
  quora:        { key: "quora", label: "Quora", platform: "quora", site: "quora.com", mode: "search", channelKeys: ["quora"] },
  producthunt:  { key: "producthunt", label: "Product Hunt", platform: "producthunt", site: "producthunt.com", mode: "search", channelKeys: ["social", "search"] },
  youtube:      { key: "youtube", label: "YouTube", platform: "youtube", site: "youtube.com", mode: "search", channelKeys: ["youtube", "video"] },
  reviews:      { key: "reviews", label: "Review sites (G2 · Capterra · Trustpilot)", platform: "review", site: "g2.com OR site:capterra.com OR site:trustpilot.com", mode: "search", channelKeys: ["reviews", "search"] },
  forums:       { key: "forums", label: "Niche forums & communities", platform: "forum", site: "", mode: "search", channelKeys: ["forums", "community"] },
  // Declared, light up when connected / in a later milestone:
  x:            { key: "x", label: "X / Twitter", platform: "x", site: "", mode: "connected", channelKeys: ["x"] },
  linkedin:     { key: "linkedin", label: "LinkedIn", platform: "linkedin", site: "linkedin.com", mode: "connected", channelKeys: ["linkedin"] },
  aisearch:     { key: "aisearch", label: "AI Search (ChatGPT · Perplexity · AI Overviews)", platform: "aisearch", site: "", mode: "ai", channelKeys: ["aiSearch"] },
};

// Pick which sources to hunt for THIS entity, ordered by playbook fit.
export function selectSources(entity, { includePlanned = false } = {}) {
  const topChannels = (entity?.playbook?.channels || []).map((c) => c.key);
  const ranked = Object.values(INTENT_SOURCES)
    .filter((s) => includePlanned || s.mode === "search" || s.mode === "native" || s.mode === "api")
    .map((s) => {
      const fit = s.channelKeys.reduce((best, k) => {
        const idx = topChannels.indexOf(k);
        return idx === -1 ? best : Math.max(best, 1 - idx / Math.max(1, topChannels.length));
      }, 0);
      return { ...s, fit };
    })
    .sort((a, b) => b.fit - a.fit);

  // Always keep the reliable free-API surfaces (Hacker News, Software Recommendations,
  // GitHub) plus Reddit + Quora — these are where buyers actually ask — then the
  // best-fit remainder. The API ones are what turn the trickle into a storm.
  const forced = ["hackernews", "stackexchange", "github", "reddit", "quora"];
  const chosen = [];
  for (const k of forced) { const s = ranked.find((r) => r.key === k); if (s) chosen.push(s); }
  for (const s of ranked) { if (!chosen.includes(s) && chosen.length < 6) chosen.push(s); }
  return chosen;
}

// Build the buyer-question universe from the entity + its scan analysis.
export function buildIntentQueries(entity, ai = {}, keywords = []) {
  // ── THE BUYER WHO HAS NEVER HEARD OF THE CATEGORY ──
  // Every query here used to assume the buyer was shopping: comparing names,
  // asking for the best one, looking for an alternative. That only finds people
  // when the category is one they already know. ARQR360 sells AR to furniture
  // retailers, and no furniture retailer searches for an AR vendor — but they
  // say constantly that a third of their sofas come back. Same people, found by
  // the problem instead of the product. The owner already told Genie what that
  // problem is; until now only the article writer read it.
  const pain = painQueries(ai, { limit: 6 });
  const awareness = awarenessOf(ai);
  const label = ai.subCategory || ai.industry || entity?.label || "";
  const category = (ai.industry || entity?.label || "").toLowerCase().replace(/\s+/g, " ").trim();
  const audience = entity?.dims?.audience === "b2b" ? "teams" : entity?.dims?.audience === "local" ? "near me" : "";
  const competitors = (ai.competitors || []).map((c) => c?.name).filter(Boolean).slice(0, 3);
  // Keywords are NOT wrapped as "{keyword} alternative" any more. The keyword
  // strategy is product and buyer language ("3d product viewer for shopify"), and
  // "3d product viewer for shopify alternative" matches nothing a buyer writes.
  // Only names get the alternative/vs treatment.
  const seeds = dedupe([ai.businessName, category].filter(Boolean)).slice(0, 2);

  const goal = entity?.dims?.conversionGoal || "lead";
  const q = [];
  const push = (query, stage, weight, group = "named") => { if (query && query.length > 3) q.push({ query: query.replace(/\s+/g, " ").trim(), stage, weight, group }); };

  // Buyer language first. Before this, every query came from the brand name, the
  // category and competitor names. For a B2B tool that finds other builders of
  // the same technology (ARQR's hunt surfaced Unity developers asking about AR
  // image tracking) instead of the retailers who would pay for it.
  for (const k of keywords.slice(0, 4)) {
    push(`best ${k}`, "comparing", 0.97, "buyer");
    push(`${k} recommendations`, "ready_to_buy", 0.9, "buyer");
  }
  const segments = Array.isArray(ai.brief?.segments) ? ai.brief.segments.slice(0, 2) : [];
  const offer = String(ai.subCategory || ai.industry || "").toLowerCase().trim();
  for (const seg of segments) if (offer) push(`${offer} for ${String(seg).toLowerCase()}`, "solution_aware", 0.93, "buyer");

  for (const s of seeds) {
    // "alternative" only makes sense after a name, never after a category.
    if (s === ai.businessName) push(`${s} alternative`, "comparing", 0.95);
    push(`best ${s || category} ${audience}`.trim(), "comparing", 0.8);
    if (goal === "purchase" || goal === "download") { push(`is ${s} worth it`, "ready_to_buy", 0.95); push(`${s} review`, "ready_to_buy", 0.75); }
    if (goal === "signup" || goal === "lead") { push(`looking for a ${s || category}`, "ready_to_buy", 0.9); push(`${s} vs`, "comparing", 0.8); }
    if (goal === "booking") { push(`best ${category} ${audience}`.trim(), "ready_to_buy", 0.9); push(`${category} recommendations`, "ready_to_buy", 0.8); }
  }
  // A rival whose name contains a huge platform's name poisons every query built
  // from it: "Shopify AR alternative" is read by search engines as "Shopify
  // alternative", and comes back full of people leaving Shopify for reasons that
  // have nothing to do with what the owner sells — payments, email, hosting.
  // Quoting the name keeps the phrase together, and pairing it with the category
  // keeps the results in the right market.
  const quoted = (name) => (String(name).trim().includes(" ") ? `"${String(name).trim()}"` : String(name).trim());
  for (const c of competitors) {
    const n = quoted(c);
    push(category ? `${n} alternative ${category}` : `${n} alternative`, "comparing", 1.0);
    push(`alternatives to ${n}`, "comparing", 0.95);
    push(`${n} too expensive`, "ready_to_buy", 0.85);
  }
  if (category) push(`recommend a ${category}`, "ready_to_buy", 0.85);

  // Each surface only runs the first three or four queries, so a plain sort by
  // weight let competitor-name queries take every slot. Alternate buyer-language
  // and name-based queries so both are always searched.
  q.push(...pain);

  // Each surface only runs the first three or four queries, so a plain sort by
  // weight let competitor-name queries take every slot. Interleave the three
  // kinds so all are always searched — and when nobody is comparing (no rivals
  // named), the pain is the whole game, so it goes first and the name-based
  // queries fill what is left rather than the other way round.
  const sorted = dedupeBy(q, (x) => x.query.toLowerCase()).sort((a, b) => b.weight - a.weight);
  const painQ = sorted.filter((x) => x.group === "pain");
  const buyer = sorted.filter((x) => x.group === "buyer");
  const named = sorted.filter((x) => x.group !== "buyer" && x.group !== "pain");
  // "alternative to X" finds nobody when X is a name buyers have never heard.
  const order = awareness === "problem" ? [painQ, buyer, named] : [buyer, painQ, named];
  const out = [];
  while (order.some((l) => l.length) && out.length < 8) {
    for (const list of order) {
      if (list.length && out.length < 8) out.push(list.shift());
    }
  }
  return out;
}

// Prioritize scored candidates: intent first, reachable & fresh boosted, deduped.
export function rankOpportunities(candidates) {
  const seen = new Set();
  const out = [];
  for (const c of candidates.sort((a, b) => b.intent.score - a.intent.score)) {
    const url = (c.url || "").split("#")[0];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(c);
  }
  return out;
}

// helpers
function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function dedupe(arr) { return [...new Set(arr)]; }
function dedupeBy(arr, keyFn) { const m = new Map(); for (const x of arr) { const k = keyFn(x); if (!m.has(k)) m.set(k, x); } return [...m.values()]; }

// Which step emptied the run, in the owner's words. Naming the real reason is
// the difference between "Genie is broken" and "change your rivals list".
export function emptyRunMessage(f) {
  if (!f.pages) return "The searches came back empty this time. Genie will try different wording on the next run.";
  if (f.alreadyOnList && f.alreadyOnList >= f.pages - f.lowIntent) {
    return `Nothing new: all ${f.alreadyOnList} page${f.alreadyOnList === 1 ? " Genie found is" : "s Genie found are"} already on your list. Genie needs different search wording to reach new people — change your rivals, or your keywords.`;
  }
  if (f.notBuyers) {
    return `Genie read ${f.notBuyers + f.alreadyOnList + (f.pages - f.lowIntent - f.alreadyOnList - f.notBuyers)} page${f.pages === 1 ? "" : "s"} and none were real buyers — mostly people asking about something else. Sharper rivals or keywords would help.`;
  }
  return `Genie found ${f.pages} page${f.pages === 1 ? "" : "s"}, but none showed anyone close to buying. It will keep hunting.`;
}
