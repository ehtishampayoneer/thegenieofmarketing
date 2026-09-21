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
 * Only genuinely targetable markets, best opportunity first, and only ones the
 * scorer is reasonably sure about — a country it had to guess at is not a
 * recommendation worth putting in a plan every engine follows.
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
    return (rows || [])
      .filter((r) => r.targetable && r.confidence === "verified")
      .slice(0, limit)
      .map((r) => r.name)
      .filter(Boolean);
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
    if (markets.length) strategy = normalizeStrategy({ ...strategy, markets });
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
