import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(process.cwd(), "app/b/[handle]/[[...path]]/route.js"), "utf8");

// ── AN ARTICLE THAT IS LIVE AND INVISIBLE ON ITS OWN BLOG ──
// The first article published, was reachable at its own address, appeared in the
// sitemap, the RSS feed and llms.txt — and the blog page still said "New articles
// are on their way". Confirmed by the self-test against real data: 1 published, 0
// listed. The worst shape a bug can take, because every other signal looks right.
describe("the index cannot know less than the sitemap", () => {
  it("every list reads once, and shares it", () => {
    // Four callers asking the same question four slightly different ways is how it
    // became possible to get four different answers.
    expect(route).toMatch(/if \(ctx\._pages\) return ctx\._pages\.slice\(0, limit\)/);
    expect(route).toMatch(/ctx\._pages = rows/);
  });

  it("asks the way the article page asks, which always worked", () => {
    expect(route).toMatch(/from\("published_pages"\)\.select\("\*"\)/);
  });

  it("orders without letting undated rows jump the queue", () => {
    expect(route).toMatch(/nullsFirst: false/);
  });

  it("no longer swallows a failed read in silence", () => {
    // Silence is what let the index render an empty page beside a sitemap that
    // listed the article.
    expect(route).toMatch(/blog\.listPages_failed/);
  });
});

describe("a list is not cached like an article", () => {
  it("keeps the hard cache for article bodies, which never change", () => {
    expect(route).toMatch(/const CACHE = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"/);
  });

  it("serves lists fresh, because they gain a row whenever one is approved", () => {
    // The index carried the article header: ten minutes fresh, then STALE for up to
    // twenty-four hours. The copy cached while the blog was empty kept being handed
    // out after the first article went live.
    expect(route).toMatch(/const LIST_CACHE = "public, max-age=0, s-maxage=60, must-revalidate"/);
    expect(route).not.toMatch(/stale-while-revalidate=86400";\s*\n\s*const LIST_CACHE[\s\S]{0,200}86400/);
  });

  it("applies it to the index and all three feeds", () => {
    expect((route.match(/LIST_CACHE/g) || []).length).toBeGreaterThanOrEqual(5);
    expect(route).toMatch(/\}\), LIST_CACHE\)/);
  });

  it("and the self-test still watches for it coming back", () => {
    const self = readFileSync(join(process.cwd(), "lib/selftest.js"), "utf8");
    expect(self).toMatch(/id: "blog-index"/);
    expect(self).toMatch(/Anyone browsing your blog sees an empty page/);
  });
});
