import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkScaledContent } from "@/lib/publish-guard";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");

// ── THE BUG THIS PINS ──
// The duplicate check compared the article being published against every article
// the owner had — INCLUDING the one being published. Identical titles match at
// 100%, so every article was refused as a near-copy of itself, no article could
// ever go live, and the owner's blog sat empty for weeks while the work log
// explained, in careful prose, that Genie had thrown the work away to protect them.
//
// Three real articles were destroyed by this before anyone noticed, because the
// message it produced was indistinguishable from the feature working correctly.
function db(rows) {
  const q = {
    from: () => q, select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: rows }),
    neq(_c, v) { this._excluded = v; return { ...q, limit: async () => ({ data: rows.filter((r) => r.id !== v) }) }; },
  };
  return q;
}

const BODY = "Measure the doorway, the stairwell and the turn at the top. " .repeat(20);
const SELF = { id: "a1", title: "Will This Sofa Fit My Living Room?", payload: { body: BODY, title: "Will This Sofa Fit My Living Room?" } };

describe("an article is never a near-copy of itself", () => {
  it("does not match the row it is checking", async () => {
    const r = await checkScaledContent(db([SELF]), {
      userId: "u1", host: "x.com", title: SELF.title, body: BODY, excludeActionId: "a1",
    });
    expect(r.duplicateOf).toBe(null);
    expect(r.similarity).toBe(0);
  });

  it("still catches a genuine near-copy written under a different id", async () => {
    const other = { id: "a2", title: "A different headline entirely", payload: { body: BODY } };
    const r = await checkScaledContent(db([SELF, other]), {
      userId: "u1", host: "x.com", title: SELF.title, body: BODY, excludeActionId: "a1",
    });
    expect(r.duplicateOf).toBe("A different headline entirely");
    expect(r.similarity).toBeGreaterThan(0.5);
  });

  it("skips a self-match even when the caller forgets to pass the id", async () => {
    // The filter is done in SQL; this is the second line of defence, because the
    // cost of getting it wrong is every article the owner will ever write.
    const guard = read("lib/publish-guard.js");
    expect(guard).toMatch(/if \(excludeActionId && a\?\.id === excludeActionId\) continue;/);
  });

  it("is told which article it is looking at, on both passes", () => {
    const route = read("app/api/actions/[id]/execute/route.js");
    expect((route.match(/excludeActionId: action\.id/g) || []).length).toBe(2);
  });

  it("is still thin-checked, which never depended on the comparison", async () => {
    const r = await checkScaledContent(db([]), { userId: "u1", host: "x.com", title: "t", body: "too short" });
    expect(r.thin).toBe(true);
  });
});

describe("a discarded draft gives its topic back", () => {
  const route = read("app/api/actions/[id]/execute/route.js");
  const usage = read("lib/keyword-usage.js");

  it("releases the keyword so it comes round again", () => {
    // Coverage advances when an article is DRAFTED, so a draft that is thrown away
    // leaves its keyword marked covered forever and the topic is lost in silence.
    expect(usage).toMatch(/export async function releaseUsage/);
    expect(route).toMatch(/releaseUsage\(supabase, user\.id/);
  });

  it("never drops coverage below zero", () => {
    expect(usage).toMatch(/Math\.max\(0, \(Number\(data\?\.coverage\) \|\| 0\) - 1\)/);
  });

  it("clears the trail rows so they do not point at work that is gone", () => {
    expect(usage).toMatch(/from\("keyword_usage"\)\.delete\(\)/);
  });
});
