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
