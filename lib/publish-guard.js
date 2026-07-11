// lib/publish-guard.js
// ── THE PUBLISH GATE ──
// One function every publish/execute path calls before content leaves the system.
// Combines platform policy + brand safety + claim/fact-checking into a single
// CONFIDENCE (0-100) and a decision: publish | review | block. Fails safe.
//   deep=true → runs the AI fact-check (for high-stakes owned auto-publish)

import { checkPolicy } from "@/lib/platform-policy";
import { verifyClaims, scanClaims } from "@/lib/factcheck";

// Brand safety — never publish these under a user's name.
// Match the stem + any suffix so inflected forms ("fucking", "shitty") are caught.
const TOXIC = [/\b(fuck|shit|bitch|asshole|bastard|cunt)\w*/i, /\b(nazi|racist|slur)\w*/i, /\b(kill|murder) (yourself|them)\b/i];

export async function guardContent(supabase, { userId, host, channel, content, entity, deep = false } = {}) {
  const text = String(content || "");
  const flags = [];
  const reasons = [];

  const policy = checkPolicy(channel, text);
  if (policy.flags.length) { flags.push(...policy.flags); if (policy.note) reasons.push(policy.note); }

  let toxic = false;
  for (const re of TOXIC) if (re.test(text)) { toxic = true; break; }
  if (toxic) { flags.push("toxic_language"); reasons.push("Contains language that could damage the brand."); }

  const claim = deep
    ? await verifyClaims(text, { entity, ctx: { supabase, userId, host } })
    : (() => { const h = scanClaims(text); return { confidence: h.length ? 70 : 92, risky: h.map((x) => ({ claim: x, severity: "medium" })), safe: h.length === 0 }; })();
  if (claim.risky?.length) reasons.push(`${claim.risky.length} claim(s) need verification.`);

  let confidence = 100;
  confidence -= policy.risk * 0.4;
  if (toxic) confidence -= 70;
  confidence = Math.min(confidence, claim.confidence ?? 100);
  confidence = Math.max(0, Math.round(confidence));

  const highRiskClaim = (claim.risky || []).some((r) => r.severity === "high");
  const decision = (toxic || highRiskClaim) ? "block" : confidence < 80 ? "review" : "publish";

  return { confidence, decision, flags, reasons, claims: claim.risky || [] };
}
