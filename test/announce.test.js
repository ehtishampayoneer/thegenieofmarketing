import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIENCES, MAX_RECIPIENTS, checkAnnouncement, reachNote, audienceFor } from "@/lib/announce";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");
const route = read("app/api/announce/route.js");

// ── WHY THIS EXISTS ──
// Genie writes first-contact pitches and follow-ups, and nothing else. So an owner
// with something to say — a new product, a price change, a December offer, "we ship
// to the UAE now" — had no way to say it. They know their stock, their seasons and
// their margins; Genie does not and should not pretend to. The gap was never that
// Genie should decide to run an offer. It was that there was no way to hand it over
// once the owner had already decided.
describe("who an announcement may reach", () => {
  it("offers only people who have already heard from this business", () => {
    expect(Object.keys(AUDIENCES).sort()).toEqual(["contacted", "leads", "replied"]);
    // A cold list and an announcement are different things in law as well as in
    // manners. There is deliberately no "everyone Genie found" option.
    for (const k of Object.keys(AUDIENCES)) {
      expect(AUDIENCES[k].why.length, k).toBeGreaterThan(30);
    }
  });

  it("is bounded, because this is not a newsletter tool", () => {
    expect(MAX_RECIPIENTS).toBe(200);
  });

  it("drops anyone who opted out or bounced, whichever campaign it happened on", () => {
    expect(route).toMatch(/isSuppressed\(supabase, userId, person\.email\)/);
    const lib = read("lib/announce.js");
    expect(lib).toMatch(/\["bounced", "unsubscribed", "failed"\]\.includes/);
  });

  it("returns nothing rather than throwing when the database is unreachable", async () => {
    const dead = { from() { throw new Error("db down"); } };
    expect(await audienceFor(dead, "u1", "contacted")).toEqual([]);
    expect(await audienceFor(null, "u1", "contacted")).toEqual([]);
    expect(await audienceFor({}, "u1", "not-an-audience")).toEqual([]);
  });
});

describe("what an announcement may be", () => {
  it("refuses a message that would embarrass the sender", () => {
    expect(checkAnnouncement({ subject: "", body: "x".repeat(50) }).ok).toBe(false);
    expect(checkAnnouncement({ subject: "hi", body: "x".repeat(50) }).ok).toBe(false);
    expect(checkAnnouncement({ subject: "Ok", body: "short" }).ok).toBe(false);
    expect(checkAnnouncement({ subject: "x".repeat(200), body: "x".repeat(50) }).ok).toBe(false);
    expect(checkAnnouncement({ subject: "We now ship to the UAE", body: "x".repeat(60) }).ok).toBe(true);
  });

  it("says what to do, never just that it is wrong", () => {
    for (const bad of [{ subject: "", body: "x".repeat(50) }, { subject: "Fine subject", body: "hi" }]) {
      const r = checkAnnouncement(bad);
      expect(r.error.length).toBeGreaterThan(25);
      expect(r.error).not.toMatch(/invalid|error/i);
    }
  });
});

describe("it obeys every rule the nightly run obeys", () => {
  it("respects the kill switch, the ramp and the allowance already used", () => {
    expect(route).toMatch(/kill_switch/);
    expect(route).toMatch(/effectiveDailyCap\(supabase, userId, plan\)/);
    expect(route).toMatch(/const used = await sentToday\(supabase, userId\)/);
  });

  it("stops at the allowance instead of blowing through it", () => {
    // An announcement that ignored the ramp would be the one message that got the
    // owner's address throttled, and the one they cared about most.
    expect(route).toMatch(/if \(left <= 0\) \{ remaining\.push\(person\.email\); continue; \}/);
    expect(route).toMatch(/more are waiting for tomorrow's allowance/);
  });

  it("carries an unsubscribe link, like every other send", () => {
    expect(route).toMatch(/unsubscribeUrl: unsubUrl\(base, userId, person\.email\)/);
  });

  it("sends through the owner's own Gmail, one at a time", () => {
    expect(route).toMatch(/deliverEmail\(supabase, userId/);
    expect(route).toMatch(/setTimeout\(r, 400\)/);
  });

  it("logs every one so it can be read back afterwards", () => {
    expect(route).toMatch(/from\("outreach_log"\)\.insert\(/);
    expect(route).toMatch(/source: "announcement"/);
  });

  it("marks it so the chase sequence never mistakes it for a cold email", () => {
    // A follow-up engine that read an announcement as step 0 would start chasing
    // people about an offer they were simply told about.
    expect(route).toMatch(/followup_step: -1/);
  });
});

describe("the screen cannot send by accident", () => {
  const page = read("app/announce/page.js");

  it("asks twice, because an email cannot be recalled", () => {
    expect(page).toMatch(/setConfirming\(true\)/);
    expect(page).toMatch(/Yes, send it now/);
    expect(page).toMatch(/cannot be recalled/);
  });

  it("will not send an empty or near-empty message", () => {
    expect(page).toMatch(/subject\.trim\(\)\.length >= 3 && body\.trim\(\)\.length >= 40/);
  });

  it("says how many people, on the button, before it is pressed", () => {
    expect(page).toMatch(/Send to \{chosen\?\.count \|\| 0\}/);
  });
});
