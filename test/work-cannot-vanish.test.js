// test/work-cannot-vanish.test.js
// ── THE TESTS THIS CODEBASE KEPT NOT HAVING ──
//
// Every test file here proves a function returns the right answer. Not one of them
// proved a function was REACHED, or that what it produced arrived anywhere. So the
// suite stayed green through: a country ranking that reached no engine, a keyword
// volume measured in the wrong country, a company-to-country match that read a
// field nothing writes, an article held back and hidden from the only person who
// could release it, and a queue that told the owner 62 items were waiting while
// being structurally unable to show twelve of them.
//
// These are connection tests. Each one pins a place where finished work used to be
// able to disappear with nobody told.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");
const approvals = read("app/api/approvals/route.js");
const act = read("app/api/approvals/act/route.js");
const campaign = read("app/api/outreach/campaign/route.js");
const selftest = read("lib/selftest.js");

describe("the queue can reach its own backlog", () => {
  // `.limit(50)` with no `.order()` lets Postgres return whichever fifty it likes.
  // countWaiting counts exactly, so the screen could say "62 waiting" and never be
  // able to hand over twelve of them — and expireStaleDrafts retires unreachable
  // drafts at fourteen days.
  it("orders before it cuts", () => {
    // Comments stripped first: the comment explaining the fix mentions .limit(50).
    const code = approvals.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(String.fromCharCode(10));
    const from = code.indexOf('.from("actions")');
    const q = code.slice(from, code.indexOf(";", code.indexOf(".limit(", from)));
    expect(q).toMatch(/\.order\("created_at", \{ ascending: false \}\)/);
    expect(q.indexOf('.order("created_at"')).toBeLessThan(q.indexOf(".limit("));
  });

  it("asking for everything asks for more than the default page", () => {
    expect(approvals).toMatch(/\.limit\(showAll \? 250 : 50\)/);
  });

  it("no unordered limit is left anywhere in the queue", () => {
    const unordered = approvals
      .split("\n")
      .filter((l) => /\.limit\(\d+\)/.test(l) && !/order|countWaiting/.test(l) && !l.trim().startsWith("//"));
    // The pitch and placement reads have their own ordering; assert each surviving
    // bare limit sits next to an order() in its own statement rather than trusting
    // the line in isolation.
    for (const line of unordered) {
      const at = approvals.indexOf(line);
      const stmt = approvals.slice(Math.max(0, at - 400), at + line.length);
      expect(stmt, `unordered limit: ${line.trim()}`).toMatch(/\.order\(/);
    }
  });
});

describe("a draft is only counted when it exists", () => {
  // supabase-js RETURNS its errors rather than throwing, so this insert could fail
  // and the function still looked like it had worked. The activity feed then told
  // the owner "5 outreach emails are waiting for you to approve" and Approvals was
  // empty — on the one screen whose job is to prove Genie did something.
  it("the staging insert's error is read", () => {
    expect(campaign).toMatch(/const \{ error: stageErr \} = await supabase\.from\("actions"\)\.insert/);
    expect(campaign).toMatch(/if \(stageErr\)/);
  });

  it("staging says whether it worked, and the caller believes it", () => {
    expect(campaign).toMatch(/const didStage = await stageForApproval/);
    expect(campaign).toMatch(/if \(didStage\) staged\+\+/);
    // The unconditional increment is gone, not merely guarded somewhere else.
    expect(campaign).not.toMatch(/^\s*staged\+\+;\s*$/m);
  });

  it("a failure to stage leaves a trace a developer can find", () => {
    expect(campaign).toMatch(/outreach\.stage_failed/);
    expect(campaign).toMatch(/outreach\.stage_threw/);
    expect(campaign).toMatch(/import \{ logger \} from "@\/lib\/log"/);
  });

  it("the owner is only told about emails that are really waiting", () => {
    const at = campaign.indexOf("waiting for you to approve");
    expect(at).toBeGreaterThan(-1);
    expect(campaign.slice(at - 200, at)).toMatch(/if \(staged > 0\)/);
  });
});

describe("approving something leaves a mark", () => {
  // Nothing in the codebase reads status "approved" — one write, zero reads. Every
  // social post, Google Business post, review request and listing ends there. That
  // is a legitimate finish for draft-and-you-post work; a finish with no record is
  // indistinguishable from losing it.
  it("writes to the activity feed, not only to the decision log", () => {
    const at = act.indexOf('status: "approved"');
    expect(at).toBeGreaterThan(-1);
    const around = act.slice(Math.max(0, at - 1200), at + 1200);
    expect(around).toMatch(/logActivity\(supabase, user\.id/);
    expect(around).toMatch(/verb: "approved"/);
  });

  it("no longer claims there is a publish queue picking it up", () => {
    // The phrase survives only inside the comment explaining that it was wrong.
    const code = act.split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith("//")).join(" ");
    expect(code).not.toMatch(/enters publish queue/);
    expect(act).toMatch(/There is no publish queue/);
  });
});

describe("the self-test can go red when nothing is produced", () => {
  // Every other row checks something CAN work. None asked the only question an
  // owner has, which is how each of these bugs stayed invisible while the report
  // was green.
  it("counts what the last 48 hours actually made", () => {
    expect(selftest).toMatch(/id: "produced"/);
    expect(selftest).toMatch(/articles written/);
    expect(selftest).toMatch(/emails sent/);
  });

  it("fails on nothing at all, and warns on written-but-never-delivered", () => {
    const row = selftest.slice(selftest.indexOf('id: "produced"'), selftest.indexOf('id: "markets"'));
    expect(row).toMatch(/if \(total === 0\)[\s\S]{0,200}return fail\(/);
    expect(row).toMatch(/emailsDrafted > 0 && emailsSent === 0/);
    expect(row).toMatch(/articles > 0 && published === 0/);
  });
});
