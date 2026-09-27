// lib/trust.js
// ── THE TRUST RAMP ──
// Autonomy is earned, like a new employee. Per entity + channel, Genie is at one
// of three levels:
//   review   — everything needs your approval (the safe default)
//   assisted — Genie drafts, you one-tap
//   auto     — Genie acts autonomously on that channel
// The level is EARNED from real approvals + positive outcomes on the Decision
// Ledger (so it compounds with the Learning Loop), and can be set manually by the
// user (recorded as a trust.set event — explainable). This is both the safety
// model AND a real differentiator: trust that grows with proven results.

import { recordEvent, getEvents } from "@/lib/events";

export const TRUST_LEVELS = ["review", "assisted", "auto"];
const DEFAULT = "review";

// Thresholds to EARN autonomy from proven work on a channel.
const EARN = { assisted: { approvals: 3 }, auto: { approvals: 6, wins: 1 } };

function matchesChannel(data = {}, channel) {
  const vals = [data.platform, data.medium, data.source, data.type, data.channel].filter(Boolean).map(String);
  if (vals.some((v) => v === channel)) return true;
  // article/seo_fix/distribution publish to the owned blog.
  if (channel === "blog" && vals.some((v) => ["article", "seo_fix", "distribution"].includes(v))) return true;
  return false;
}

// Effective trust for an entity + channel: manual override wins, else earned.
export async function getTrustLevel(supabase, { userId, host, channel }) {
  if (!supabase || !userId || !channel) return DEFAULT;
  try {
    const overrides = await getEvents(supabase, { userId, host, types: ["trust.set"], limit: 50 });
    const match = overrides.find((e) => e.data?.channel === channel);
    if (match?.data?.level && TRUST_LEVELS.includes(match.data.level)) return match.data.level;
  } catch {}
  const earned = await earnedTrust(supabase, { userId, host, channel });
  // ── EARNING MAKES GENIE ELIGIBLE. ONLY THE OWNER SWITCHES IT ON. ──
  // "auto" is the one level at which Genie acts on the outside world with nobody
  // looking — for email, that is cold messages leaving the owner's own Gmail
  // every night. It used to be reached automatically, and the rule that reached
  // it was broken twice over:
  //   - wins were counted from ANY channel, so six email approvals plus one
  //     social post that did well would have switched on unattended email;
  //   - every win was recorded without a user id (lib/growth-memory.js), and
  //     this reads only the owner's own events, so it never found one.
  // The second bug was the only thing stopping the first. Safe by accident is
  // one fix away from not safe, so it is safe on purpose instead: earned trust
  // stops at "assisted", eligibility is reported, and "auto" comes only from the
  // owner choosing it (a trust.set event, handled above).
  return earned.level === "auto" ? "assisted" : earned.level;
}

/**
 * What Genie has earned on a channel, from that channel's own record. Reported so
 * the owner can be told "Genie has earned this — turn it on?"; never applied by
 * itself.
 *
 * A WIN is counted only on the same channel. For email the win is a reply —
 * recorded by lib/gmail-read.js with the owner's id, which is the one outcome
 * that proves the emails are working.
 */
export async function earnedTrust(supabase, { userId, host, channel }) {
  const out = { level: DEFAULT, approvals: 0, wins: 0, eligibleForAuto: false };
  if (!supabase || !userId || !channel) return out;
  try {
    const types = channel === "email"
      ? ["decision.approval", "outreach.reply"]
      : ["decision.approval", "outcome.recorded"];
    const evs = await getEvents(supabase, { userId, host, types, limit: 400 });
    for (const e of evs) {
      if (e.type === "decision.approval" && matchesChannel(e.data, channel)) out.approvals++;
      else if (e.type === "outreach.reply") out.wins++;
      else if (e.type === "outcome.recorded" && ["converted", "winning"].includes(e.data?.outcome) && matchesChannel(e.data, channel)) out.wins++;
    }
    out.eligibleForAuto = out.approvals >= EARN.auto.approvals && out.wins >= EARN.auto.wins;
    out.level = out.eligibleForAuto ? "auto" : out.approvals >= EARN.assisted.approvals ? "assisted" : DEFAULT;
  } catch {}
  return out;
}

// User grants/revokes autonomy — recorded on the ledger (auditable, explainable).
export async function setTrustLevel(supabase, { userId, host, channel, level }) {
  if (!TRUST_LEVELS.includes(level) || !channel) return false;
  await recordEvent(supabase, { userId, host, type: "trust.set", actor: "user", subject: channel, data: { channel, level } });
  return true;
}

// The gate the execution/autonomy layer consults before acting WITHOUT a human.
// Fails safe: anything less than "auto" means stage it for approval instead.
export async function canAutoExecute(supabase, ctx) {
  return (await getTrustLevel(supabase, ctx)) === "auto";
}
