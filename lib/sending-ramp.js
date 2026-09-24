// lib/sending-ramp.js
// ── HOW MANY EMAILS A DAY, AND WHY IT STARTS SMALL ──
//
// The daily cap was flat from the first day: fifteen on the free plan, fifty on
// pro. A mailbox that has never sent cold email and then sends fifteen strangers
// a message on day one looks, to Google and Microsoft, exactly like a mailbox
// somebody just took over. The reply rate is not what suffers first — the
// deliverability is, and that failure is invisible: everything reports "sent"
// while quietly landing in spam.
//
// So the cap ramps. Five a day in the first week, ten in the second, and the
// plan's real cap once there is a week of history behind it. The owner loses
// almost nothing — twenty-five emails in week one against thirty-five — and
// gains the thing the whole channel rests on.
//
// ONE POINT IN THE OWNER'S FAVOUR. This is their existing Gmail, with years of
// real correspondence behind it, not a freshly bought domain. Providers trust it
// far more than a new sender, which is why the ramp is a fortnight rather than
// the six-week warmup a cold domain needs.
//
// AND IT RESTARTS AFTER A LONG SILENCE. A mailbox that sent nothing for two
// months and then resumes at fifty is the same signal as a new one. Coming back
// after a quiet spell starts at five again.

import { DAILY_CAP } from "@/lib/email-engine";

// Ceiling for each week of actual sending history. After this list runs out, the
// plan's own cap applies. Pro ramps through the middle rungs; free reaches its
// fifteen in week three and stops there because the plan cap is lower.
export const RAMP = [5, 10, 20, 35];

// Quiet for longer than this and the next send starts the ramp again.
export const RESET_AFTER_QUIET_DAYS = 30;

const DAY = 86400000;

/**
 * The ceiling for someone with this many days of sending behind them. Pure.
 * Day 0-6 → 5, day 7-13 → 10, day 14-20 → 20, day 21-27 → 35, then no ceiling.
 */
export function rampCeiling(daysSending) {
  const d = Number(daysSending);
  if (!Number.isFinite(d) || d < 0) return RAMP[0];
  const week = Math.floor(d / 7);
  return week < RAMP.length ? RAMP[week] : Infinity;
}

/**
 * How many days of sending history this list of send dates represents, counting
 * only the current run: a gap longer than RESET_AFTER_QUIET_DAYS starts it over.
 * Pure, so the rule can be tested without a database.
 * @param {string[]} sentAtIso  send timestamps, any order
 */
export function daysSending(sentAtIso = [], now = Date.now()) {
  const times = (sentAtIso || [])
    .map((t) => Date.parse(t))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (!times.length) return 0;

  // Walk back from the most recent send to the start of the current run.
  let start = times[0];
  for (let i = times.length - 1; i > 0; i--) {
    if (times[i] - times[i - 1] > RESET_AFTER_QUIET_DAYS * DAY) { start = times[i]; break; }
  }
  return Math.max(0, (now - start) / DAY);
}

/**
 * The cap that actually applies right now, and a sentence explaining it.
 *
 * Both send paths call this — the nightly campaign and the one-at-a-time send on
 * Find clients. A ramp only one of them respected would be a ramp the owner
 * could step around without meaning to.
 *
 * Never throws: an unreadable log falls back to the first rung, which is the safe
 * direction to be wrong in.
 */
export async function effectiveDailyCap(supabase, userId, plan = "free") {
  const planCap = DAILY_CAP[plan === "pro" ? "pro" : "free"];
  let days = 0;
  try {
    const { data } = await supabase.from("outreach_log")
      .select("sent_at").eq("user_id", userId).not("sent_at", "is", null)
      .order("sent_at", { ascending: false }).limit(400);
    days = daysSending((data || []).map((r) => r.sent_at));
  } catch {
    return { cap: RAMP[0], planCap, ramping: true, days: 0, reason: rampReason(RAMP[0], planCap, 0) };
  }

  const ceiling = rampCeiling(days);
  const cap = Math.min(ceiling, planCap);
  const ramping = cap < planCap;
  return { cap, planCap, ramping, days: Math.floor(days), reason: rampReason(cap, planCap, days) };
}

/** Plain English, for the screen and the daily brief. Never a number without a why. */
export function rampReason(cap, planCap, days) {
  if (cap >= planCap) return `Sending up to ${planCap} a day.`;
  const next = RAMP.find((r) => r > cap);
  const upTo = Math.min(next ?? planCap, planCap);
  if (days < 1) {
    return `Sending ${cap} a day this week while your address builds a sending history, then ${upTo}. A new sender going straight to ${planCap} lands in spam.`;
  }
  const daysLeft = Math.max(1, Math.ceil(7 - (days % 7)));
  return `Sending ${cap} a day while your address builds a sending history. Goes up to ${upTo} in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`;
}
