import { describe, it, expect } from "vitest";
import { rampCeiling, daysSending, rampReason, effectiveDailyCap, RAMP, RESET_AFTER_QUIET_DAYS } from "@/lib/sending-ramp";

const DAY = 86400000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();

// Supabase's builder is a thenable that keeps chaining, which is what the cap
// lookup relies on.
function log(rows) {
  const q = {
    select: () => q, eq: () => q, not: () => q, order: () => q, limit: () => q,
    then: (resolve) => resolve({ data: rows }),
  };
  return { from: () => q };
}

describe("a new sender starts small", () => {
  it("allows five a day in the first week, ten in the second", () => {
    expect(rampCeiling(0)).toBe(5);
    expect(rampCeiling(6)).toBe(5);
    expect(rampCeiling(7)).toBe(10);
    expect(rampCeiling(13)).toBe(10);
  });

  it("keeps climbing for a plan that allows more", () => {
    expect(rampCeiling(14)).toBe(20);
    expect(rampCeiling(21)).toBe(35);
    expect(rampCeiling(28)).toBe(Infinity);
  });

  it("treats nonsense as the first rung, which is the safe direction to be wrong in", () => {
    expect(rampCeiling(undefined)).toBe(RAMP[0]);
    expect(rampCeiling(-5)).toBe(RAMP[0]);
    expect(rampCeiling("nope")).toBe(RAMP[0]);
  });
});

describe("the ramp measures sending history, not how long ago they signed up", () => {
  it("counts from the first send", () => {
    expect(Math.floor(daysSending([ago(9), ago(3)]))).toBe(9);
  });

  it("starts over after a long silence, because a mailbox that wakes up and blasts looks stolen", () => {
    // Sent months ago, then went quiet, then started again three days ago.
    const days = daysSending([ago(200), ago(190), ago(3)]);
    expect(Math.floor(days)).toBe(3);
    expect(rampCeiling(days)).toBe(5);
    expect(RESET_AFTER_QUIET_DAYS).toBe(30);
  });

  it("does not reset for an ordinary weekend off", () => {
    expect(Math.floor(daysSending([ago(20), ago(17), ago(1)]))).toBe(20);
  });

  it("has no history when nothing was ever sent", () => {
    expect(daysSending([])).toBe(0);
    expect(daysSending(null)).toBe(0);
    expect(daysSending(["not a date"])).toBe(0);
  });
});

describe("the cap that actually applies", () => {
  it("holds a brand-new free account to five", async () => {
    const r = await effectiveDailyCap(log([]), "u1", "free");
    expect(r.cap).toBe(5);
    expect(r.ramping).toBe(true);
  });

  it("reaches the free plan's own cap and stops there", async () => {
    const r = await effectiveDailyCap(log([{ sent_at: ago(30) }]), "u1", "free");
    expect(r.cap).toBe(15);
    expect(r.ramping).toBe(false);
  });

  it("never lets the ramp exceed what the plan allows", async () => {
    // Week three's rung is 20, but a free plan is 15.
    const r = await effectiveDailyCap(log([{ sent_at: ago(15) }]), "u1", "free");
    expect(r.cap).toBe(15);
  });

  it("walks pro up through the middle rungs instead of jumping to fifty", async () => {
    expect((await effectiveDailyCap(log([{ sent_at: ago(1) }]), "u1", "pro")).cap).toBe(5);
    expect((await effectiveDailyCap(log([{ sent_at: ago(8) }]), "u1", "pro")).cap).toBe(10);
    expect((await effectiveDailyCap(log([{ sent_at: ago(15) }]), "u1", "pro")).cap).toBe(20);
    expect((await effectiveDailyCap(log([{ sent_at: ago(22) }]), "u1", "pro")).cap).toBe(35);
    expect((await effectiveDailyCap(log([{ sent_at: ago(40) }]), "u1", "pro")).cap).toBe(50);
  });

  it("falls back to the smallest cap when the log cannot be read", async () => {
    const dead = { from() { throw new Error("db down"); } };
    const r = await effectiveDailyCap(dead, "u1", "pro");
    expect(r.cap).toBe(5);
    expect(r.ramping).toBe(true);
  });
});

describe("it never gives a number without a reason", () => {
  it("explains the first week in words a beginner can act on", () => {
    const r = rampReason(5, 15, 0);
    expect(r).toMatch(/5 a day/);
    expect(r).toMatch(/builds a sending history/);
    expect(r).toMatch(/lands in spam/);
  });

  it("says when the next rung arrives", () => {
    const r = rampReason(5, 15, 3);
    expect(r).toMatch(/Goes up to 10 in 4 days/);
  });

  it("stops explaining once there is nothing to explain", () => {
    expect(rampReason(15, 15, 40)).toBe("Sending up to 15 a day.");
  });
});
