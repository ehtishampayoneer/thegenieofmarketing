import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Work Genie holds back must stay findable. The publish guard sets
// needs_review when it blocks something at approval time; the queue listed
// only "proposed", so a held article disappeared from the product entirely —
// no page showed it, and the owner had one toast to catch it.
const approvalsApi = readFileSync(join(process.cwd(), "app/api/approvals/route.js"), "utf8");
const approvalsPage = readFileSync(join(process.cwd(), "app/approvals/page.js"), "utf8");
const launchpad = readFileSync(join(process.cwd(), "app/api/launchpad/route.js"), "utf8");
const execute = readFileSync(join(process.cwd(), "app/api/actions/[id]/execute/route.js"), "utf8");

describe("work the guard holds back", () => {
  it("is still listed in the queue", () => {
    expect(approvalsApi).toContain('.in("status", ["proposed", "needs_review"])');
  });

  it("arrives with the reason and the sentences that caused it", () => {
    expect(approvalsApi).toMatch(/heldReasons/);
    expect(approvalsApi).toMatch(/heldClaims/);
    expect(execute).toMatch(/claims: \(guard\.claims \|\| \[\]\)/);
  });

  it("says so on the card, rather than looking like an ordinary draft", () => {
    expect(approvalsPage).toMatch(/held this back to protect your brand/);
    expect(approvalsPage).toMatch(/The sentences to change/);
  });

  it("still counts as an article waiting for the owner", () => {
    expect(launchpad).toMatch(/\.in\("status", \["proposed", "needs_review"\]\)\.eq\("type", "article"\)/);
  });
});
