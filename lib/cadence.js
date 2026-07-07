// lib/cadence.js
// The cadence brain. Reads placement memory to decide, per target and per
// platform, what Genie should do: post now, repost later, pause, or skip —
// so we spread every keyword across many places WITHOUT spamming any one place.

// Per-platform daily posting ceilings (protects accounts from spam flags).
export const DAILY_CAP = {
  reddit: 3,     // conservative — Reddit bans fast
  quora: 4,
  forum: 5,
  guest: 3,
  x: 8,
  linkedin: 2,
  medium: 1,
  wordpress: 2,
};

// Default cooldown before the SAME target can be touched again.
export const COOLDOWN_DAYS = {
  reddit: 14,    // never hit the same subreddit/thread again soon
  quora: 30,     // one great answer per question
  forum: 10,
  guest: 90,
  x: 0,
  linkedin: 1,
  medium: 30,
  wordpress: 0,
};

export function cooldownFor(platform) {
  return COOLDOWN_DAYS[platform] ?? 7;
}

export function nextEligible(platform, from = new Date()) {
  const days = cooldownFor(platform);
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Did we already post to this platform today? (don't repeat same place same day)
export function postedTodayCount(placements, platform) {
  const today = new Date().toDateString();
  return placements.filter(
    (p) => p.platform === platform && p.status === "posted" && p.posted_at && new Date(p.posted_at).toDateString() === today
  ).length;
}

// Is a specific target still cooling down?
export function inCooldown(placement, now = new Date()) {
  if (!placement.next_eligible_at) return false;
  return new Date(placement.next_eligible_at) > now;
}

// Build today's "taps" plan: ready placements per platform, capped, cooldown-aware.
// Returns { blocks: [{platform, owned, count, items[]}], totalTaps, totalAuto }.
export function buildTapPlan(placements) {
  const now = new Date();
  const ready = placements.filter(
    (p) => p.status === "ready" && !inCooldown(p, now)
  );

  const byPlatform = {};
  for (const p of ready) {
    (byPlatform[p.platform] ||= []).push(p);
  }

  const blocks = [];
  let totalTaps = 0;
  let totalAuto = 0;

  for (const [platform, items] of Object.entries(byPlatform)) {
    const alreadyToday = postedTodayCount(placements, platform);
    const remaining = Math.max(0, (DAILY_CAP[platform] ?? 3) - alreadyToday);
    const todays = items.slice(0, remaining);
    if (todays.length === 0) continue;

    const owned = todays[0].owned;
    if (owned) totalAuto += todays.length;
    else totalTaps += todays.length;

    blocks.push({ platform, owned, count: todays.length, items: todays });
  }

  // Order: human-tap blocks first (that's the daily ritual), then auto.
  blocks.sort((a, b) => Number(a.owned) - Number(b.owned));
  return { blocks, totalTaps, totalAuto };
}
