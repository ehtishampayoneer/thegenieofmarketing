// lib/factcheck.js
// ── FACT-CHECK / CLAIM VERIFICATION ──
// Protects the user's brand from hallucinated or legally risky claims published
// under their name. Two tiers: a fast heuristic scan (patterns that are usually
// risky) and a deep AI verification pass (used for high-stakes owned auto-publish).
// Provider-agnostic (uses the AI router). Never blocks silently — flags + reasons.

import { callAI } from "@/lib/ai-router";
import { scanClaims as scan } from "@/lib/claim-rules";

// The patterns live in lib/claim-rules.js now, beside the words the WRITER is
// given, because those two drifting apart is what produced an article Genie wrote
// and Genie then refused. Re-exported, so every existing caller is unchanged.
export { scanClaims } from "@/lib/claim-rules";

// Deep verification. Only worth the LLM call when the heuristic finds risk.
export async function verifyClaims(content, { entity, ctx } = {}) {
  const heur = scan(content);
  if (heur.length === 0) return { confidence: 95, risky: [], safe: true, mode: "heuristic" };
  try {
    const r = await callAI({
      system: "You are a fact-checker protecting a brand's reputation and legal exposure. Identify claims in the text that are unverifiable, false, exaggerated, or legally risky (absolute guarantees, superlatives, medical/financial claims, fabricated statistics). Be strict. Return ONLY JSON.",
      json: true, maxTokens: 700, temperature: 0.2, ctx,
      prompt: `Entity: ${entity?.label || "a business"}.\nText:\n"""${String(content).slice(0, 2200)}"""\n\nReturn {"risky":[{"claim":"...","why":"...","severity":"low|medium|high"}],"safe":true,"confidence":0-100}`,
    });
    const j = r.json || {};
    return { confidence: clampNum(j.confidence, 60), risky: Array.isArray(j.risky) ? j.risky : [], safe: j.safe !== false, mode: "ai" };
  } catch {
    // Fail safe: if we can't verify, treat heuristic flags as real risk.
    return { confidence: 55, risky: heur.map((h) => ({ claim: h, severity: "medium" })), safe: false, mode: "heuristic_fallback" };
  }
}

function clampNum(n, d) { const v = Number(n); return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : d; }
