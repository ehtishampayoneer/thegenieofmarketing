import { describe, it, expect } from "vitest";
import { dueFollowUps, followUpPrompt, stepBrief, STEP_AFTER_DAYS, MAX_FOLLOWUPS, COLD_AFTER_DAYS } from "@/lib/followup";

const DAY = 86400000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();

// A stand-in for the send log. dueFollowUps only ever reads outreach_log.
function log(rows) {
  // Supabase's query builder is a thenable that keeps chaining after limit(),
  // which is exactly what dueFollowUps relies on when it adds the host filter.
  const q = {
    select: () => q, eq: () => q, order: () => q, limit: () => q,
    then: (resolve) => resolve({ data: rows }),
  };
  return { from: () => q };
}
const sent = (email, days, extra = {}) => ({
  contact_email: email, contact_name: "Sam", subject: "A quick idea", body: "the first one",
  status: "sent", sent_at: ago(days), created_at: ago(days), replied_at: null,
  is_followup: false, followup_step: 0, source: "discovery", ...extra,
});

describe("who is due a follow-up", () => {
  it("leaves someone alone until the fourth day", async () => {
    expect((await dueFollowUps(log([sent("a@b.com", 2)]), "u1", "x.com")).due).toEqual([]);
    const r = await dueFollowUps(log([sent("a@b.com", 5)]), "u1", "x.com");
    expect(r.due).toHaveLength(1);
    expect(r.due[0].step).toBe(1);
  });

  it("sends the second follow-up on day eight, not before", async () => {
    const one = [sent("a@b.com", 6), sent("a@b.com", 2, { is_followup: true, followup_step: 1 })];
    expect((await dueFollowUps(log(one), "u1", "x.com")).due).toEqual([]);
    const two = [sent("a@b.com", 9), sent("a@b.com", 5, { is_followup: true, followup_step: 1 })];
    const r = await dueFollowUps(log(two), "u1", "x.com");
    expect(r.due).toHaveLength(1);
    expect(r.due[0].step).toBe(2);
  });

  it("never sends two messages to the same person in the same few days", async () => {
    // Day 9 by the first-message clock, but they heard from us yesterday.
    const rows = [sent("a@b.com", 9), sent("a@b.com", 1, { is_followup: true, followup_step: 1 })];
    expect((await dueFollowUps(log(rows), "u1", "x.com")).due).toEqual([]);
  });

  it("stops at two follow-ups, whatever the calendar says", async () => {
    const rows = [
      sent("a@b.com", 20),
      sent("a@b.com", 16, { is_followup: true, followup_step: 1 }),
      sent("a@b.com", 12, { is_followup: true, followup_step: 2 }),
    ];
    const r = await dueFollowUps(log(rows), "u1", "x.com");
    expect(r.due).toEqual([]);
    expect(MAX_FOLLOWUPS).toBe(2);
  });
});

describe("who Genie must leave alone", () => {
  it("never chases someone who replied", async () => {
    const rows = [sent("a@b.com", 9, { replied_at: ago(3) })];
    expect((await dueFollowUps(log(rows), "u1", "x.com")).due).toEqual([]);
  });

  it("never chases a bounce, a failure or an unsubscribe", async () => {
    for (const status of ["bounced", "failed", "unsubscribed"]) {
      const r = await dueFollowUps(log([sent("a@b.com", 9, { status })]), "u1", "x.com");
      expect(r.due, status).toEqual([]);
    }
  });

  it("marks someone cold after two weeks of silence, once", async () => {
    const rows = [
      sent("a@b.com", 15),
      sent("a@b.com", 11, { is_followup: true, followup_step: 1 }),
      sent("a@b.com", 7, { is_followup: true, followup_step: 2 }),
    ];
    const r = await dueFollowUps(log(rows), "u1", "x.com");
    expect(r.cold).toHaveLength(1);
    expect(r.cold[0].email).toBe("a@b.com");
    expect(r.cold[0].sentCount).toBe(3);
    expect(r.due).toEqual([]);
    expect(COLD_AFTER_DAYS).toBe(14);
  });
});

describe("it carries what it needs, and never throws", () => {
  it("hands the writer the previous message so it cannot repeat itself", async () => {
    const r = await dueFollowUps(log([sent("a@b.com", 5)]), "u1", "x.com");
    expect(r.due[0].previous.subject).toBe("A quick idea");
    expect(r.due[0].previous.body).toBe("the first one");
  });

  it("carries provenance forward, so a follow-up can still say where the address came from", async () => {
    const r = await dueFollowUps(log([sent("a@b.com", 5, { source: "directory" })]), "u1", "x.com");
    expect(r.due[0].source).toBe("directory");
  });

  it("oldest first, because they are closest to going cold", async () => {
    const r = await dueFollowUps(log([sent("new@b.com", 5), sent("old@b.com", 12)]), "u1", "x.com");
    expect(r.due[0].email).toBe("old@b.com");
  });

  it("returns empty rather than throwing when the database is down", async () => {
    const dead = { from() { throw new Error("db down"); } };
    expect(await dueFollowUps(dead, "u1", "x.com")).toEqual({ due: [], cold: [] });
    expect(await dueFollowUps(null, "u1", "x.com")).toEqual({ due: [], cold: [] });
  });
});

describe("each message is a different one, not a resend", () => {
  const contact = { name: "Sam", company: "Ali's Rugs", daysSince: 4 };
  const previous = { subject: "A quick idea for your product pages", body: "Shoppers hesitate on rugs." };

  it("shows the writer exactly what was already said, and forbids repeating it", () => {
    const p = followUpPrompt({ contact, business: { name: "ARQR360" }, step: 1, previous });
    expect(p).toMatch(/do NOT repeat any of it/);
    expect(p).toMatch(/A quick idea for your product pages/);
    expect(p).toMatch(/Shoppers hesitate on rugs/);
    expect(p).toMatch(/4 DAYS/);
  });

  it("refuses a faked reply subject", () => {
    const p = followUpPrompt({ contact, business: {}, step: 1, previous });
    expect(p).toMatch(/must NOT start with "Re:"/);
  });

  it("asks for a different angle on the second, and a graceful exit on the third", () => {
    expect(stepBrief(1)).toMatch(/DIFFERENT angle/);
    expect(stepBrief(1)).toMatch(/did you see my last message/);
    expect(stepBrief(2)).toMatch(/LAST message/);
    expect(stepBrief(2)).toMatch(/easy, graceful way out/);
    // Each one shorter than the last.
    expect(stepBrief(1)).toMatch(/60 words/);
    expect(stepBrief(2)).toMatch(/45 words/);
  });

  it("keeps the schedule it documents", () => {
    expect(STEP_AFTER_DAYS).toEqual([4, 8]);
  });
});
