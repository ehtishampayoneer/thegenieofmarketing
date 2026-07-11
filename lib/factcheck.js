// lib/factcheck.js
// ── FACT-CHECK / CLAIM VERIFICATION ──
// Protects the user's brand from hallucinated or legally risky claims published
// under their name. Two tiers: a fast heuristic scan (patterns that are usually
// risky) and a deep AI verification pass (used for high-stakes owned auto-publish).
// Provider-agnostic (uses the AI router). Never blocks silently — flags + reasons.

import { callAI } from "@/lib/ai-router";

const RISKY = [
  { re: /\b(guarantee[ds]?|100%|risk[- ]free|no risk|always works)\b/i, label: "absolute guarantee" },
  { re: /\b(#1|number one|world'?s (best|leading|#1)|the best (in|on))\b/i, label: "unverifiable superlative" },
  { re: /\b(cure|cures|treat|treats|prevents?|diagnos\w+)\b/i, label: "medical claim" },
  { re: /\b(fda[- ]approved|clinically proven|scientifically proven|doctor recommended)\b/i, label: "authority claim" },
  { re: /\b(guaranteed (roi|returns|income|profit)|double your|get rich)\b/i, label: "financial claim" },
  { re: /(\b\d{2,}%|\$\d[\d,]{2,})/, label: "specific statistic" },
];

export function scanClaims(text) {
  const t = String(text || "");
  const flags = [];
  for (const r of RISKY) if (r.re.test(t)) flags.push(r.label);
  return [...new Set(flags)];
}

// Deep verification. Only worth the LLM call when the heuristic finds risk.
export async function verifyClaims(content, { entity, ctx } = {}) {
  const heur = scanClaims(content);
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
