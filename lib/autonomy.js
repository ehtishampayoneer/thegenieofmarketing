// lib/autonomy.js
// ── THE AUTONOMY DECISION ──
// The single fail-safe gate for acting WITHOUT a human. Combines the Trust Ramp
// (earned autonomy per channel) with the Publish Gate (confidence). Genie acts
// autonomously ONLY when trust == auto AND the content passes AND confidence is
// high enough. Otherwise it falls back to human approval — always. Every decision
// is recorded (explainable) so users can see exactly why Genie did or didn't act.

import { getTrustLevel } from "@/lib/trust";
import { guardContent } from "@/lib/publish-guard";
import { recordDecision } from "@/lib/growth-memory";

const CONFIDENCE_THRESHOLD = 80;

export async function decideExecution(supabase, { userId, host, channel, content, entity }) {
  const trust = await getTrustLevel(supabase, { userId, host, channel });
  const guard = await guardContent(supabase, { userId, host, channel, content, entity, deep: trust === "auto" });

  const execute = trust === "auto" && guard.decision === "publish" && guard.confidence >= CONFIDENCE_THRESHOLD;
  const reason = execute
    ? "trusted + confident"
    : trust !== "auto" ? `trust is "${trust}" (not auto)`
    : guard.decision !== "publish" ? `content guard: ${guard.decision}`
    : `confidence ${guard.confidence} < ${CONFIDENCE_THRESHOLD}`;

  try {
    await recordDecision(supabase, {
      userId, host, kind: "autonomy_check", choice: channel,
      rationale: `${execute ? "Auto-executed" : "Held for review"} — ${reason}.`,
      confidence: guard.confidence / 100,
      meta: { channel, trust, decision: execute ? "auto" : "review", confidence: guard.confidence, flags: guard.flags },
    });
  } catch {}

  return { execute, mode: execute ? "auto" : "review", trust, confidence: guard.confidence, guard, reason };
}
