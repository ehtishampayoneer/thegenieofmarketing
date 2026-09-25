import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const api = readFileSync(join(process.cwd(), "app/api/worklog/route.js"), "utf8");
const page = readFileSync(join(process.cwd(), "app/worklog/page.js"), "utf8");

// ── WHY THIS EXISTS ──
// "I published and cannot find it anywhere." There are four ways an approved
// article ends up nowhere: it published (fine), it failed, it was held for review,
// or Genie threw it away as a near-copy. Three of those four said so in a toast and
// then the toast went away — so the only record of the most alarming thing that can
// happen to an owner's work was a sentence they had four seconds to read.
//
// This page is the one place work is not allowed to vanish from. That has to
// include the work that never left.
describe("every way a piece of work can end has a home", () => {
  it("reads the ones that stopped, not only the ones that landed", () => {
    expect(api).toMatch(/in\("status", \["failed", "needs_review"\]\)/);
    expect(api).toMatch(/types: \["publish\.own_url"[^\]]*"content\.discarded"\]/);
  });

  it("says what stopped it, in the words the route recorded", () => {
    expect(api).toMatch(/It stopped with: \$\{String\(a\.result\.error\)/);
    expect(api).toMatch(/Genie rewrote what it could and this is what is left/);
  });

  it("says plainly that nothing went out, because that is the real question", () => {
    expect(api).toMatch(/Nothing was sent or posted/);
  });

  it("tells them where it is and what to do, never just that it broke", () => {
    for (const w of ["approve it again to retry", "It is in Approvals", "Nothing for you to do"]) {
      expect(api.includes(w), w).toBe(true);
    }
  });

  it("renders all three, rather than falling through to a generic row", () => {
    for (const k of ["discarded", "failed", "held"]) {
      expect(page.includes(`  ${k}: { icon:`), k).toBe(true);
    }
  });

  it("never claims a publish that did not happen", () => {
    // The published row comes from published_pages, which only holds real rows.
    expect(api).toMatch(/from\("published_pages"\)/);
    expect(api).not.toMatch(/kind: "published"[\s\S]{0,200}status === "approved"/);
  });
});
