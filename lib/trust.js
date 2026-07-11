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
  try {
    const evs = await getEvents(supabase, { userId, host, types: ["decision.approval", "outcome.recorded"], limit: 400 });
    let approvals = 0, wins = 0;
    for (const e of evs) {
      if (e.type === "decision.approval" && matchesChannel(e.data, channel)) approvals++;
      if (e.type === "outcome.recorded" && ["converted", "winning"].includes(e.data?.outcome)) wins++;
    }
    if (approvals >= EARN.auto.approvals && wins >= EARN.auto.wins) return "auto";
    if (approvals >= EARN.assisted.approvals) return "assisted";
  } catch {}
  return DEFAULT;
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
