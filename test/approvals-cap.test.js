import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const route = readFileSync(join(ROOT, "app/api/approvals/route.js"), "utf8");
const page = readFileSync(join(ROOT, "app/approvals/page.js"), "utf8");

// The cap is the smallest change in the rebuild and the one that decides whether
// a beginner opens the app a second time. It is also the easiest to undo by
// accident, so it is pinned here rather than trusted to a comment.
describe("the queue asks for three, not forty", () => {
  it("serves three by default", () => {
    expect(route).toMatch(/DAILY_CARDS\s*=\s*3/);
    expect(route).toMatch(/items\.slice\(0,\s*DAILY_CARDS\)/);
  });

  it("still sorts by impact before it cuts, so the three are the best three", () => {
    const sortAt = route.indexOf("items.sort(");
    const sliceAt = route.indexOf("items.slice(0, DAILY_CARDS)");
    expect(sortAt).toBeGreaterThan(-1);
    expect(sliceAt).toBeGreaterThan(sortAt);
    expect(route).toMatch(/b\.impact\s*-\s*a\.impact/);
  });

  it("hides nothing — the rest is one request away", () => {
    expect(route).toMatch(/searchParams\.get\("all"\)/);
    expect(page).toMatch(/\?all=1/);
  });

  it("reports how many are waiting, and counts the whole queue in `count`", () => {
    // The bug this codebase keeps having is a number that quietly means something
    // other than its label. `count` is the queue; `backlog` is what is held back.
    expect(route).toMatch(/backlog/);
    expect(route).toMatch(/count:\s*items\.length/);
  });

  it("tells the owner before they start, not only when they finish", () => {
    expect(page).toMatch(/for you today/);
    expect(page).toMatch(/lined up behind them/);
  });

  it("offers a way to carry on, so the cap is a pace and not a wall", () => {
    expect(page).toMatch(/Keep going/);
    expect(page).toMatch(/That is today's three/);
  });
});
