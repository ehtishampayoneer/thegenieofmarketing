import { describe, it, expect } from "vitest";
import { findCannibalization, findDecliningPages, explainInspection } from "@/lib/search-health";

const row = (keys, clicks, impressions, position) => ({ keys, clicks, impressions, position });

describe("cannibalization", () => {
  it("flags a query where two pages each take a real share", () => {
    const out = findCannibalization([
      row(["ar catalogue for furniture", "https://s.com/ar-catalogue"], 12, 300, 6.1),
      row(["ar catalogue for furniture", "https://s.com/blog/ar-furniture"], 3, 220, 8.4),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].keep).toBe("https://s.com/ar-catalogue");
    expect(out[0].advice).toMatch(/Merge|different question/); // positions close
  });

  it("ignores a second page with a sliver of the impressions", () => {
    expect(findCannibalization([
      row(["q", "https://s.com/a"], 20, 900, 3),
      row(["q", "https://s.com/b"], 0, 20, 40),
    ])).toEqual([]);
  });

  it("ignores queries without real demand", () => {
    expect(findCannibalization([row(["q", "https://s.com/a"], 1, 20, 5), row(["q", "https://s.com/b"], 1, 20, 6)])).toEqual([]);
  });

  it("recommends pointing the weaker page at the stronger one when ranks are far apart", () => {
    const [c] = findCannibalization([
      row(["q", "https://s.com/a"], 30, 500, 2),
      row(["q", "https://s.com/b"], 1, 300, 25),
    ]);
    expect(c.advice).toMatch(/add a link to \/a/);
  });
});

describe("declining pages", () => {
  const prev = [row(["https://s.com/p", "rug sizes"], 40, 1000, 4), row(["https://s.com/p", "rug guide"], 10, 400, 6)];

  it("names the searches that account for the drop", () => {
    const cur = [row(["https://s.com/p", "rug sizes"], 8, 900, 9), row(["https://s.com/p", "rug guide"], 9, 380, 6)];
    const [d] = findDecliningPages(cur, prev);
    expect(d.dropPct).toBe(66);
    expect(d.lostQueries[0].query).toBe("rug sizes");
    expect(d.advice).toMatch(/slipped/); // position fell, so the content needs work
  });

  it("blames the title when rank held but clicks fell", () => {
    const cur = [row(["https://s.com/p", "rug sizes"], 10, 1000, 4), row(["https://s.com/p", "rug guide"], 5, 400, 6)];
    expect(findDecliningPages(cur, prev)[0].advice).toMatch(/title and description/);
  });

  it("does not flag small pages or small dips", () => {
    expect(findDecliningPages([row(["https://s.com/x", "q"], 1, 10, 5)], [row(["https://s.com/x", "q"], 5, 50, 5)])).toEqual([]);
    expect(findDecliningPages([row(["https://s.com/p", "rug sizes"], 45, 1000, 4)], prev)).toEqual([]);
  });

  it("counts a page that vanished entirely", () => {
    expect(findDecliningPages([], prev)[0].clicksNow).toBe(0);
  });
});

describe("indexing verdicts", () => {
  const r = (idx) => ({ inspectionResult: { indexStatusResult: idx } });

  it("indexed", () => expect(explainInspection("https://s.com/", r({ verdict: "PASS" })).status).toBe("indexed"));

  it("treats noindex as intentional, not an error", () => {
    const v = explainInspection("https://s.com/thanks", r({ verdict: "NEUTRAL", indexingState: "BLOCKED_BY_META_TAG" }));
    expect(v.status).toBe("noindex");
    expect(v.intentional).toBe(true);
  });

  it("robots.txt block", () => expect(explainInspection("https://s.com/p", r({ verdict: "FAIL", robotsTxtState: "DISALLOWED" })).status).toBe("blocked"));

  it("crawled but not indexed", () => {
    expect(explainInspection("https://s.com/p", r({ verdict: "NEUTRAL", coverageState: "Crawled - currently not indexed" })).status).toBe("crawled_not_indexed");
  });

  it("Google picked another canonical", () => {
    expect(explainInspection("https://s.com/p?x=1", r({ verdict: "NEUTRAL", userCanonical: "https://s.com/p?x=1", googleCanonical: "https://s.com/p" })).status).toBe("canonical");
  });
});
