// lib/usage.js
// ── COST & USAGE INSTRUMENTATION ──
// Every external call (LLM, data) can emit a usage.* event to the Event Ledger
// with tokens, estimated cost, latency, provider, and cache status. This is how
// we collect REAL unit-economics data from day one instead of optimizing from
// assumptions. Free tiers cost $0 but we still track token/call volume, so the
// moment we move to paid models the true cost is already known.

import { recordEvent } from "@/lib/events";

// Approx USD per 1k tokens (input/output). Free tiers → 0 (volume still tracked).
// Provider-agnostic: add a model, not code. Update as pricing changes.
const COST_PER_1K = {
  "gemini-2.5-flash": { in: 0, out: 0 },
  "openai/gpt-oss-120b": { in: 0, out: 0 },
  "meta-llama/llama-3.3-70b-instruct:free": { in: 0, out: 0 },
  // paid fallbacks (examples; adjust to the configured PAID_LLM_MODEL):
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "gpt-4o": { in: 0.0025, out: 0.01 },
  default: { in: 0, out: 0 },
};

export function estimateTokens(text) { return Math.ceil(String(text || "").length / 4); }

export function estimateCost(model, tokensIn = 0, tokensOut = 0) {
  const c = COST_PER_1K[model] || COST_PER_1K.default;
  return Math.round(((tokensIn / 1000) * c.in + (tokensOut / 1000) * c.out) * 1e6) / 1e6;
}

// kind: "llm" | "data". Best-effort; never throws.
export async function recordUsage(supabase, { userId = null, host = null, kind, provider, model, tokensIn = 0, tokensOut = 0, latencyMs = 0, cached = false, ok = true, tag = null } = {}) {
  const costUsd = cached ? 0 : estimateCost(model, tokensIn, tokensOut);
  await recordEvent(supabase, {
    userId, host, type: `usage.${kind}`, actor: "system",
    subject: provider || model || kind,
    data: { provider, model, tokensIn, tokensOut, costUsd, latencyMs, cached, ok, tag },
  });
  return costUsd;
}
