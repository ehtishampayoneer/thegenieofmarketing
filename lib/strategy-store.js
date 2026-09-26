// lib/strategy-store.js
// ── READING THE PLAN, FROM ANYWHERE ──
// Engines need the strategy the way they need the brief: one call, never
// throwing, never blocking the nightly run. This is that call.
//
// It reads the stored strategy first. If there is none it drafts one and saves
// it, so the first engine to ask pays for it once and every engine after reads
// it for free. If the AI is busy it still returns the deterministic strategy
// rather than nothing, because an engine with no plan falls back to guessing —
// which is the behaviour this whole layer exists to end.

import { recordEvent, getEvents } from "@/lib/events";
import { scoreMarkets } from "@/lib/markets";
import { briefText } from "@/lib/business-brief";
import { strategyPrompt, readStrategy, fallbackStrategy, normalizeStrategy, strategyReady, strategyBlock } from "@/lib/strategy";

/** The stored strategy, or null. Never throws. */
export async function storedStrategy(supabase, userId) {
  try {
    const rows = await getEvents(supabase, { userId, types: ["strategy.set"], limit: 1 });
    const s = rows?.[0]?.data?.strategy;
    return s ? normalizeStrategy(s) : null;
  } catch { return null; }
}

export async function saveStrategy(supabase, userId, host, strategy, actor = "genie") {
  try {
    await recordEvent(supabase, {
      userId, host, type: "strategy.set", actor,
      subject: strategy.angle || strategy.who.join(", ") || "strategy",
      data: { strategy },
    });
  } catch {}
}

/**
 * Which countries are worth targeting, from Market Testing rather than a guess.
 * Uses the same scorer the Market Testing page runs (lib/markets.js), with the
 * owner's real Search Console country data when Google is connected, so the
 * plan and that page can never recommend different places.
 *
 * Only genuinely targetable markets, best opportunity first.
 *
 * ── WHY THIS NO LONGER DEMANDS SEARCH CONSOLE ──
 * It used to accept a country only when `confidence === "verified"`, which means
 * Search Console already has traffic data for it. The reasoning was that a country
 * the scorer had to estimate is not worth putting in a plan every engine follows.
 * The consequence was worse than the risk it avoided:
 *
 *   - A business with no Search Console history got ZERO markets. Market Testing
 *     showed them 32 ranked countries and eleven they could target; the plan got
 *     none of them, so every engine that reads the plan went on knowing nothing
 *     about where this business sells.
 *   - A business WITH Search Console got only the countries it ALREADY ranks in —
 *     the exact opposite of finding a new market, and usually the United States,
 *     which the same scorer rates as one of the hardest to win.
 *
 * So: verified countries first, then the best estimated ones to fill the list,
 * each row carrying `verified` so nothing downstream can present an estimate as a
 * measurement. marketNote() on the screen already says "estimated, until Search
 * Console has enough data for this country" — this is the row it was written for.
 */
export async function marketsFor(supabase, { userId, host, ai = null, limit = 4 }) {
  try {
    // The same Search Console country data the Market Testing page reads, so
    // the two can never rank countries differently. Absent Google, the scorer
    // falls back to its reference model and marks those rows "estimated",
    // which the filter below then drops.
    let gsc = null;
    try {
      const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
      if (conn && host) {
        const { getValidAccessToken } = await import("@/lib/google");
        const { getGscCountries } = await import("@/lib/gsc");
        const token = await getValidAccessToken(supabase, conn);
        if (token) { const gc = await getGscCountries(token, host); if (gc?.available) gsc = gc; }
      }
    } catch {}
    const entity = ai?.entity?.dims ? { dims: ai.entity.dims } : {};
    const profile = { targetCustomer: ai?.targetCustomer || "", whatTheySell: ai?.whatTheySell || "", industry: ai?.industry || "" };
    const { rows } = scoreMarkets({ entity, profile, gsc });
    // The NAME was all this used to return, so the plan knew the owner sells into
    // the UAE and nothing about whether the UAE was the easy one. Green, amber and
    // red were all the same colour downstream. The scorer's own verdict travels
    // with the name now: how hard, and whether it came from real Search Console
    // numbers or the reference model.
    const usable = (rows || []).filter((r) => r?.name && r.targetable);
    const verified = usable.filter((r) => r.confidence === "verified");
    const estimated = usable.filter((r) => r.confidence !== "verified");
    return [...verified, ...estimated]
      .slice(0, limit)
      .map((r) => ({
        name: r.name,
        iso2: r.iso2 || null,
        score: Number.isFinite(Number(r.opp)) ? Math.round(Number(r.opp)) : null,
        difficulty: r.difficulty || null,
        verified: r.confidence === "verified",
      }));
  } catch { return []; }
}

/**
 * The strategy for this business: stored, or drafted and stored now.
 * @param {object} opts.ai   the latest scan's read of the business
 * @param {boolean} opts.draft  false to read only (for callers that must not spend AI)
 */
export async function getStrategy(supabase, { userId, host, ai = null, draft = true }) {
  const stored = await storedStrategy(supabase, userId);
  if (stored && strategyReady(stored)) return stored;
  if (!ai) return stored || null;

  const fb = fallbackStrategy(ai);
  if (!draft) return strategyReady(fb) ? fb : stored;

  let strategy = fb;
  try {
    const { callAI } = await import("@/lib/ai-router");
    const res = await callAI({
      system: "You resolve a business into one marketing strategy that other systems execute literally. Return only JSON. Never invent proof, numbers or customers.",
      prompt: strategyPrompt({ ai, briefText: briefText(ai, { max: 2500 }) }),
      json: true, maxTokens: 900, temperature: 0.4, timeoutMs: 40000, userId, host, tag: "strategy",
    });
    strategy = readStrategy(res?.json, ai);
  } catch { strategy = fb; }

  // The countries come from Market Testing, never from the model. The owner can
  // still overwrite them on /strategy; only an empty list is filled in.
  if (!strategy.markets?.length) {
    const markets = await marketsFor(supabase, { userId, host, ai });
    if (markets.length) {
      strategy = normalizeStrategy({ ...strategy, markets: markets.map((m) => m.name), marketData: markets });
    }
  }

  if (strategyReady(strategy)) await saveStrategy(supabase, userId, host, strategy, "genie");
  return strategy;
}

/**
 * The plan as prompt text, for engines that write. Returns "" when there is no
 * usable strategy, so a caller can fall back to the brief without branching.
 */
export async function strategyPromptBlock(supabase, { userId, host, ai = null, draft = false }) {
  const s = await getStrategy(supabase, { userId, host, ai, draft });
  return s ? strategyBlock(s) : "";
}
