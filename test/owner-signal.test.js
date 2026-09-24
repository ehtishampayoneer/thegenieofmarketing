import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ownerSignalLearnings, ownerSignal, skipPenalty, penaltyFor, alwaysImprove, MIN_SKIPS, MIN_EDITS } from "@/lib/owner-signal";
import { synthesizeLearnings } from "@/lib/learning";

const skip = (type) => ({ kind: "skipped", meta: { type } });
const edit = (type) => ({ kind: "edited", meta: { type } });

describe("the two signals an owner gives with their hands", () => {
  it("ignores one skip, because a busy morning is not a preference", () => {
    expect(MIN_SKIPS).toBe(3);
    expect(ownerSignalLearnings([skip("reddit"), skip("reddit")])).toEqual([]);
  });

  it("acts on the third", () => {
    const [l] = ownerSignalLearnings([skip("reddit"), skip("reddit"), skip("reddit")]);
    expect(l.key).toBe("owner_skips:reddit");
    expect(l.meta.weight).toBeLessThan(1);
    expect(l.insight).toMatch(/skipped 3 reddit cards/);
  });

  it("acts on a second rewrite, because a rewrite is never ambiguous", () => {
    expect(MIN_EDITS).toBe(2);
    expect(ownerSignalLearnings([edit("social_post")])).toEqual([]);
    const [l] = ownerSignalLearnings([edit("social_post"), edit("social_post")]);
    expect(l.key).toBe("owner_edits:social_post");
    expect(l.insight).toMatch(/rewrote 2 social post drafts/);
  });

  it("never lets a skipped kind fall so far it can never come back", () => {
    expect(skipPenalty(0)).toBe(1);
    expect(skipPenalty(2)).toBe(1);
    expect(skipPenalty(3)).toBeCloseTo(0.55);
    expect(skipPenalty(99)).toBe(0.45);
  });

  it("ignores rows with nothing to group by, and approvals, which were already learned from", () => {
    expect(ownerSignalLearnings([{ kind: "skipped" }, { kind: "skipped", meta: {} }])).toEqual([]);
    expect(ownerSignalLearnings(Array(5).fill({ kind: "approval", meta: { type: "article" } }))).toEqual([]);
    expect(ownerSignalLearnings(null)).toEqual([]);
  });

  it("is part of the nightly synthesis, not a second thing to remember to run", () => {
    const out = synthesizeLearnings({ decisions: [skip("reddit"), skip("reddit"), skip("reddit")] });
    expect(out.map((l) => l.key)).toContain("owner_skips:reddit");
  });
});

describe("reading the signal back", () => {
  function db(rows) {
    const q = { select: () => q, eq: () => q, like: () => q, then: (resolve) => resolve({ data: rows }) };
    return { from: () => q };
  }

  it("turns stored learnings back into a multiplier and a set", async () => {
    const s = await ownerSignal(db([
      { mkey: "owner_skips:reddit", meta: { type: "reddit", weight: 0.55 } },
      { mkey: "owner_edits:outreach_email", meta: { type: "outreach_email" } },
    ]), "u1");
    expect(s.skips.reddit).toBe(0.55);
    expect(s.edits.has("outreach_email")).toBe(true);
  });

  it("recomputes a multiplier an older row never stored", async () => {
    const s = await ownerSignal(db([{ mkey: "owner_skips:reddit", meta: { type: "reddit", skips: 4 } }]), "u1");
    expect(s.skips.reddit).toBeCloseTo(0.45); // four skips is already the floor
  });

  it("changes nothing when there is nothing, or when the read fails", async () => {
    const empty = { skips: {}, edits: new Set() };
    expect(await ownerSignal(db([]), "u1")).toEqual(empty);
    expect(await ownerSignal({ from() { throw new Error("db down"); } }, "u1")).toEqual(empty);
    expect(await ownerSignal(null, "u1")).toEqual(empty);
    expect(penaltyFor(undefined, "reddit")).toBe(1);
    expect(alwaysImprove(undefined, "reddit")).toBe(false);
  });

  it("matches an item by either name it goes by", () => {
    const s = { skips: { reddit: 0.55 }, edits: new Set(["social_post"]) };
    expect(penaltyFor(s, "community_engagement", "reddit")).toBe(0.55);
    expect(penaltyFor(s, "article", "blog")).toBe(1);
    expect(alwaysImprove(s, "social_post", "x")).toBe(true);
    expect(alwaysImprove(s, "article", null)).toBe(false);
  });
});

describe("both ends are actually wired, or none of it is learning", () => {
  const act = readFileSync(join(process.cwd(), "app/api/approvals/act/route.js"), "utf8");
  const queue = readFileSync(join(process.cwd(), "app/api/approvals/route.js"), "utf8");
  const engine = readFileSync(join(process.cwd(), "lib/swarm/engine.js"), "utf8");

  it("records a skip and a rewrite, on placements and on actions alike", () => {
    expect(act.match(/learnFromSkip\(/g)?.length).toBeGreaterThanOrEqual(3); // definition + both branches
    expect(act.match(/learnFromEdit\(/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the owner's own words, which is the whole value of an edit", () => {
    expect(act).toMatch(/before: from\.slice\(0, 1200\), after: to\.slice\(0, 1200\)/);
  });

  it("does not record a save that changed nothing as a correction", () => {
    expect(act).toMatch(/if \(!to \|\| from\.trim\(\) === to\.trim\(\)\) return;/);
  });

  it("compares the new text against the field it replaced, not against nothing", () => {
    expect(act).toMatch(/before: field \? a\?\.payload\?\.\[field\] : ""/);
    expect(act).toMatch(/select\("type, payload, target"\)/); // or the host is always null
  });

  it("lowers the queue rank rather than hiding the work", () => {
    expect(queue).toMatch(/const signal = await ownerSignal\(supabase, user\.id\)/);
    expect(queue).toMatch(/i\.impact = Math\.round\(i\.impact \* mult\)/);
    // A multiplier, never a filter: nothing is dropped from the list.
    expect(queue).not.toMatch(/items\s*=\s*items\.filter\([^)]*mult/);
  });

  it("asks the improvers for a kind the owner keeps rewriting", () => {
    expect(engine).toMatch(/alwaysImprove\(ctx\.signals\.get\(userId\), item\.type, item\.platform\)/);
    expect(engine).toMatch(/ctx\.signals \|\|= new Map\(\)/); // one read per owner, not per item
  });
});
