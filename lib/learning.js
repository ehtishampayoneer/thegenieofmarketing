// lib/learning.js
// ── THE LEARNING LOOP ──
// The capability that makes Genie an employee, not a tool: it turns accumulated
// OUTCOMES into weighted LEARNINGS that change future DECISIONS. It is not a new
// system — it's a synthesis pass over data three existing capabilities already
// produce (the Decision Ledger, placement engagement, keyword/GSC performance),
// written into Growth Memory, which every capability already reads via getBrief().
//
//   synthesizeLearnings(signals) -> [{ key, insight, weight, meta }]   (pure)
//   channelWeights(learnings)    -> { platform: multiplier }
//   getChannelWeights(...)       -> read the learned weights back (closes the loop)
//   applyChannelWeights(...)     -> re-rank sources by what actually wins

export function synthesizeLearnings({ decisions = [], placements = [], keywords = [] }) {
  const learnings = [];

  // 1) CHANNEL PERFORMANCE — what actually wins, per surface.
  const chan = {};
  for (const p of placements) {
    const plat = p.platform; if (!plat) continue;
    const c = (chan[plat] ||= { platform: plat, posted: 0, winning: 0, dud: 0 });
    const perf = p.performance || p.meta?.performance || null;
    if (p.status === "posted" || perf) c.posted++;
    if (perf === "winning") c.winning++;
    else if (perf === "dud") c.dud++;
  }
  for (const c of Object.values(chan)) {
    if (c.posted === 0) continue;
    if (c.winning < 1 && c.dud < 2) continue;
    const weight = clamp(1 + c.winning * 0.35 - c.dud * 0.25, 0.3, 3);
    learnings.push({
      key: `channel_perf:${c.platform}`,
      insight: c.winning >= c.dud
        ? `${cap(c.platform)} is one of your best channels (${c.winning} winning ${plural(c.winning, "post")}). Genie will hunt there more.`
        : `${cap(c.platform)} keeps underperforming (${c.dud} ${plural(c.dud, "dud")}). Genie will ease off it.`,
      weight: 1 + c.winning,
      changed: c.winning >= c.dud ? `Prioritizing ${cap(c.platform)} in the hunt` : `De-prioritizing ${cap(c.platform)}`,
      meta: { weight, winning: c.winning, dud: c.dud, dimension: "channel" },
    });
  }

  // 2) KEYWORD PERFORMANCE — what brings real, measured traffic.
  const realKw = keywords.filter((k) => (k.gsc_clicks || 0) > 0).sort((a, b) => (b.gsc_clicks || 0) - (a.gsc_clicks || 0));
  if (realKw.length) {
    const top = realKw.slice(0, 3).map((k) => k.keyword);
    learnings.push({
      key: "top_keywords",
      insight: `These keywords bring real traffic: ${top.join(", ")}. Genie will create more content around them.`,
      weight: 2, changed: "Weighting content toward proven keywords",
      meta: { dimension: "keyword", keywords: top, verified: true },
    });
  }

  // 3) AEO OPENINGS — which content type wins AI citations most often.
  const aeoTypes = {};
  for (const d of decisions) {
    if (d.kind !== "aeo_gap") continue;
    const t = d.meta?.recommendation?.type; if (t) aeoTypes[t] = (aeoTypes[t] || 0) + 1;
  }
  const topType = Object.entries(aeoTypes).sort((a, b) => b[1] - a[1])[0];
  if (topType) {
    learnings.push({
      key: "aeo_focus",
      insight: `${cap(topType[0])} content is your biggest AI-search opening (${topType[1]} ${plural(topType[1], "gap")}). Genie will prioritize it.`,
      weight: 1.5, changed: `Prioritizing ${topType[0]} content for AI citations`,
      meta: { dimension: "content", type: topType[0], count: topType[1] },
    });
  }

  // 4) BUYER-INTENT SOURCE — which surface actually finds buyers.
  const src = {};
  for (const d of decisions) {
    if (d.kind !== "buyer_intent_pick") continue;
    const s = d.meta?.source; if (!s) continue;
    const o = (src[s] ||= { source: s, picks: 0, won: 0 });
    o.picks++;
    if (d.outcome === "winning" || d.outcome === "converted") o.won++;
  }
  const bestSrc = Object.values(src).sort((a, b) => b.won - a.won || b.picks - a.picks)[0];
  if (bestSrc && bestSrc.picks >= 2) {
    learnings.push({
      key: `intent_source:${bestSrc.source}`,
      insight: `${cap(bestSrc.source)} surfaces the most buyers for you. Genie will weight it higher.`,
      weight: 1 + bestSrc.won, changed: `Hunting buyers on ${cap(bestSrc.source)} first`,
      meta: { dimension: "intent_source", source: bestSrc.source, won: bestSrc.won },
    });
  }

  return learnings;
}

// Derive channel multipliers from freshly synthesized learnings.
export function channelWeights(learnings = []) {
  const w = {};
  for (const l of learnings) if (l.key?.startsWith("channel_perf:")) w[l.key.split(":")[1]] = l.meta?.weight ?? 1;
  return w;
}

// Read learned channel weights back out of Growth Memory (the loop's read side).
export async function getChannelWeights(supabase, userId, host) {
  const w = {};
  try {
    const { data } = await supabase
      .from("growth_memory").select("mkey, meta")
      .eq("user_id", userId).eq("host", host).like("mkey", "channel_perf:%");
    for (const r of data || []) {
      const p = r.mkey.split(":")[1];
      const val = r.meta?.weight;
      if (p && typeof val === "number") w[p] = val;
    }
  } catch {}
  return w;
}

// Re-rank a source list by learned performance — this is where learning changes
// behavior, not just text.
export function applyChannelWeights(sources = [], weights = {}) {
  if (!sources.length) return sources;
  return [...sources]
    .map((s) => ({ ...s, _score: (s.fit ?? 0.5) * (weights[s.platform] ?? 1) }))
    .sort((a, b) => b._score - a._score);
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function cap(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
function plural(n, w) { return n === 1 ? w : w + "s"; }
