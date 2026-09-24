import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(process.cwd(), "app/api/content/route.js"), "utf8");
const at = (needle) => route.indexOf(needle);

// ── WHY THIS EXISTS ──
// Vercel Hobby kills any function at 60 seconds whatever maxDuration declares. This
// route declares 120 and spends it in stages: the article (up to 70s for a deep
// one), then the social pass (40s), then an image hunt that fetches the owner's site
// and a stock library, then branded cards. The single insert used to be the LAST
// thing it did — so on Hobby the function died mid-enrichment and threw away an
// article a writer-grade model had already been paid to write. The owner saw
// nothing and was told nothing, which is the exact failure this codebase keeps
// having: work that disappears into a stage nothing reports.
//
// So the order is the fix, and the order is what is pinned. Nothing here asserts a
// timeout number; it asserts that whatever runs out of time, the article survives.
describe("the article is saved before anything that can run out of time", () => {
  it("writes the article row before the social pass starts", () => {
    const save = at('type: "article",');
    const social = at("The social pass.");
    expect(save).toBeGreaterThan(0);
    expect(social).toBeGreaterThan(0);
    expect(save, "the article insert must come before the social pass").toBeLessThan(social);
  });

  it("writes it before the image hunt, which fetches two sites", () => {
    expect(at('type: "article",')).toBeLessThan(at("ON-BRAND IMAGERY"));
  });

  it("cleans the article before storing it, not after", () => {
    // Otherwise the row an owner reads and publishes is the uncleaned one.
    expect(at("data.article.body = deDash(")).toBeLessThan(at('type: "article",'));
  });

  it("does not leave a second article row behind when the enrichment finishes", () => {
    // A duplicate article in Approvals is worse than a missing hero image.
    expect(route).toMatch(/if \(data\.article && articleId\) \{/);
    expect(route).toMatch(/\.update\(\{ payload: data\.article, priority: articlePriority \}\)/);
    expect(route).toMatch(/\.eq\("id", articleId\)\.eq\("user_id", userId\)/);
  });

  it("still saves the article the old way if the early save failed", () => {
    expect(route).toMatch(/\} else if \(data\.article\) \{/);
  });

  it("counts the early-saved article in what it reports as saved", () => {
    // `saved` is what the UI shows. Dropping the article from the count would be an
    // honest-numbers failure in the other direction.
    expect(route).toMatch(/actionIds\.push\(articleId\)/);
    expect(route).toMatch(/actionIds = \[\.\.\.actionIds, \.\.\.\(inserted \|\| \[\]\)\.map/);
  });

  it("says so out loud when the early save is the thing that failed", () => {
    expect(route).toMatch(/content\.early_article_save_failed/);
  });

  it("records the keyword chain once, not twice", () => {
    // recordUsage twice for one article would inflate that keyword's coverage.
    const early = route.slice(at("let articleId = null;"), at("The social pass."));
    expect(early).toMatch(/recordUsage\(/);
    expect(early.match(/recordUsage\(/g).length).toBe(1);
  });
});
