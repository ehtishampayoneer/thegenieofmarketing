import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STALE_AFTER_DAYS } from "@/lib/stuck";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");
const approvals = read("app/api/approvals/route.js");

// ── WHY THE EMAILS WERE INVISIBLE ──
// Seventy-eight things waiting, three shown, and not one of them an email. Sorting
// was by impact alone: a social post is filed "high" and scores 92, a cold email is
// filed "medium" and scores 66. So every post Genie wrote outranked every email it
// wrote, and a copy-and-paste LinkedIn draft beat the one channel that can produce
// a reply this week. Priority describes how good a piece is; it says nothing about
// which KIND of work deserves the owner's three minutes, and the plan already
// decided that.
describe("the channel that produces replies is reachable", () => {
  it("ranks by kind before score", () => {
    expect(approvals).toMatch(/const KIND_RANK = \{ article: 0, outreach_email: 1, media_pitch: 2 \}/);
    expect(approvals).toMatch(/kindRank\(a\) - kindRank\(b\) \|\|\s*\n\s*b\.impact - a\.impact/);
  });

  it("applies the same order after the emails are batched", () => {
    // Otherwise batching would quietly put the batch back behind the posts.
    expect((approvals.match(/kindRank\(a\) - kindRank\(b\)/g) || []).length).toBe(2);
  });

  it("puts community replies behind the three that matter, not in front", () => {
    expect(approvals).toMatch(/i\.source === "placement" \? 3 : 4/);
  });
});

describe("the badge is today's job, not the pile", () => {
  const today = read("app/api/today/route.js");

  it("shows what needs doing, and reports the backlog separately", () => {
    // 78 beside a screen showing three reads as seventy-eight things you are
    // behind on. The answer is three.
    expect(today).toMatch(/Math\.min\(waiting, DAILY_CARDS\)/);
    expect(today).toMatch(/out\.approvalsWaiting = waiting/);
  });

  it("reads the same constant the queue does", () => {
    expect(read("lib/queue-count.js")).toMatch(/export const DAILY_CARDS = 3/);
    expect(today).toMatch(/countWaiting, DAILY_CARDS \} from "@\/lib\/queue-count"/);
  });
});

describe("a queue that only grows is a debt, not a day's work", () => {
  const stuck = read("lib/stuck.js");
  const jobs = read("lib/genie-jobs.js");
  const worklog = read("app/api/worklog/route.js");

  it("retires what nobody reached, after long enough to be sure", () => {
    expect(STALE_AFTER_DAYS).toBe(14);
    expect(stuck).toMatch(/export async function expireStaleDrafts/);
    expect(stuck).toMatch(/status: "expired"/);
  });

  it("never retires an article", () => {
    // The slowest thing to produce, the one that does not go off the same way, and
    // the only kind an owner might deliberately be saving.
    expect(stuck).toMatch(/\.neq\("type", "article"\)/);
  });

  it("only touches drafts nobody has acted on", () => {
    expect(stuck).toMatch(/\.eq\("status", "proposed"\)/);
  });

  it("runs nightly rather than on a page load", () => {
    expect(jobs).toMatch(/expireStaleDrafts\(admin, \{ userId, host \}\)/);
    expect(jobs).toMatch(/dispatched, retired, escalated, pillared, proposed, expired,/);
  });

  it("is shown, because deleting work quietly is the one thing forbidden here", () => {
    expect(worklog).toMatch(/"content\.expired"/);
    expect(worklog).toMatch(/kind: "expired"/);
    expect(read("app/worklog/page.js")).toMatch(/expired: \{ icon:/);
  });

  it("blames Genie for it, not the owner", () => {
    expect(worklog).toMatch(/Genie writing more than there was time for, not you falling behind/);
  });
});
