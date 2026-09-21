import { describe, it, expect } from "vitest";
import { readPatch, revisionPrompt, gatherEvidence, proposePlanRevision } from "@/lib/brain-learn";
import { normalizeStrategy } from "@/lib/strategy";

const plan = normalizeStrategy({
  who: ["furniture retailer"],
  theirGoal: ["increase sales"],
  angle: "One of the ways furniture retailers are increasing sales",
  mechanism: "Shoppers who see it in their room order with less doubt",
  whereTheyLook: ["how to increase furniture store sales"],
  contentThemes: ["What actually causes furniture returns"],
});

describe("a revision can never quietly undo the owner", () => {
  it("keeps everything already in the plan, even when the model drops it", () => {
    // The dangerous failure: a model "tidies" the plan and silently deletes a
    // line the owner put there. Then "one correction reaches everything" is a lie.
    const patch = readPatch({ who: ["rug retailer"] }, plan);
    expect(patch.who).toContain("furniture retailer");
    expect(patch.who).toContain("rug retailer");
  });

  it("proposes nothing when the model only repeats what the plan says", () => {
    expect(readPatch({ who: ["furniture retailer"] }, plan)).toBeNull();
    expect(readPatch({ who: ["Furniture Retailer"] }, plan)).toBeNull();
  });

  it("ignores fields it is not allowed to rewrite", () => {
    // proof, neverSay, cta and mechanism are the owner's word on what may be
    // claimed. Evidence about clicks has no business touching them.
    const patch = readPatch({ proof: "we tripled sales", neverSay: [], mechanism: "something else", who: ["rug retailer"] }, plan);
    expect(patch.proof).toBeUndefined();
    expect(patch.neverSay).toBeUndefined();
    expect(patch.mechanism).toBeUndefined();
    expect(patch.who).toContain("rug retailer");
  });

  it("refuses anything that would leave the plan unusable", () => {
    const thin = normalizeStrategy({ who: ["x"] }); // no goal, angle or mechanism
    expect(readPatch({ who: ["x", "y"] }, thin)).toBeNull();
  });

  it("returns nothing for junk", () => {
    expect(readPatch(null, plan)).toBeNull();
    expect(readPatch({}, plan)).toBeNull();
    expect(readPatch({ who: [] }, plan)).toBeNull();
    expect(readPatch("nope", plan)).toBeNull();
  });

  it("carries a plain-English reason to the owner, trimmed", () => {
    const patch = readPatch({ who: ["rug retailer"], reason: "Three of your replies came from rug shops." }, plan);
    expect(patch.reason).toBe("Three of your replies came from rug shops.");
    const long = readPatch({ who: ["rug retailer"], reason: "x".repeat(900) }, plan);
    expect(long.reason.length).toBe(300);
  });
});

describe("the prompt is told these are facts, not guesses", () => {
  it("shows the evidence and forbids inventing more", () => {
    const p = revisionPrompt(plan, [
      { field: "who", fact: "3 replies to your outreach came from rug retail" },
      { field: "whereTheyLook", fact: '"buy wool rug" brought 12 real visits from Google' },
    ]);
    expect(p).toMatch(/WHAT ACTUALLY HAPPENED SINCE/);
    expect(p).toMatch(/3 replies to your outreach came from rug retail/);
    expect(p).toMatch(/buy wool rug/);
    expect(p).toMatch(/Do not\s+add anything the evidence above does not support/);
    expect(p).toMatch(/Do not remove anything the owner\s+may/);
    // It must see the plan it is correcting, or it will repeat what is there.
    expect(p).toMatch(/furniture retailer/);
  });
});

describe("it stays quiet until there is something real to say", () => {
  const noDb = { from() { throw new Error("db down"); } };

  it("gathers nothing rather than throwing when the database is down", async () => {
    const { facts, counts } = await gatherEvidence(noDb, { userId: "u1", host: "x.com" });
    expect(facts).toEqual([]);
    expect(counts.searches).toBe(0);
  });

  it("needs a user and a host before it looks at anything", async () => {
    expect((await gatherEvidence(noDb, { userId: null, host: "x.com" })).facts).toEqual([]);
    expect((await gatherEvidence(noDb, { userId: "u1", host: null })).facts).toEqual([]);
  });

  it("proposes nothing, and never throws, with no entity", async () => {
    const r = await proposePlanRevision(noDb, { userId: null, host: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_entity");
  });

  it("proposes nothing when there is no plan to correct", async () => {
    // storedStrategy swallows the error and returns null, so this reaches no_plan
    // without ever calling a model.
    const r = await proposePlanRevision(noDb, { userId: "u1", host: "x.com" });
    expect(r.ok).toBe(false);
    expect(["no_plan", "error"]).toContain(r.reason);
  });
});
