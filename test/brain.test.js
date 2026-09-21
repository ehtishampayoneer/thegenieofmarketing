import { describe, it, expect } from "vitest";
import { brainBlock, businessNameFrom, genieBrain } from "@/lib/brain";
import { normalizeStrategy, strategyBlock, fallbackStrategy } from "@/lib/strategy";

const ready = normalizeStrategy({
  who: ["furniture retailer"],
  theirGoal: ["increase sales"],
  angle: "One of the ways furniture retailers are working to increase sales",
  mechanism: "Shoppers who see the sofa in their room order with less doubt, so fewer come back",
  markets: ["United Kingdom", "Canada"],
  neverSay: ["Never promise a specific conversion uplift"],
  cta: "Book a 10-minute demo",
});

const ai = {
  businessName: "ARQR360",
  whatTheySell: "AR product views",
  targetCustomer: "furniture stores",
  brief: { offer: "AR previews on your product pages", cta: "Book a 10-minute demo" },
};

describe("the countries reach the engines that write", () => {
  // The bug this whole layer exists to close: Market Testing ranked the
  // countries, the plan stored them, the owner could see them, and the string
  // every writing engine reads never mentioned them.
  it("names the best countries in the plan block", () => {
    const block = strategyBlock(ready);
    expect(block).toMatch(/United Kingdom/);
    expect(block).toMatch(/Canada/);
    expect(block).toMatch(/strongest first/i);
  });

  it("says nothing about countries when Market Testing has not verified any", () => {
    const block = strategyBlock(normalizeStrategy({ ...ready, markets: [] }));
    expect(block).not.toMatch(/countries to win/i);
  });

  it("keeps 'when we last asked' apart from 'when the plan changed'", () => {
    const s = normalizeStrategy({ ...ready, marketsAt: "2026-09-01T00:00:00.000Z" });
    expect(s.marketsAt).toBe("2026-09-01T00:00:00.000Z");
    expect(normalizeStrategy({}).marketsAt).toBeNull();
  });
});

describe("one block every engine pastes", () => {
  it("leads with the plan when there is one", () => {
    const block = brainBlock({ strategy: ready, ai });
    expect(block).toMatch(/THE STRATEGY/);
    expect(block).toMatch(/Never say: Never promise a specific conversion uplift/);
  });

  it("falls back to the owner's own brief when the plan is not ready, so wiring an engine up can never make it worse", () => {
    const block = brainBlock({ strategy: normalizeStrategy({}), ai });
    expect(block).toMatch(/WHAT THE OWNER TOLD GENIE/);
    expect(block).toMatch(/AR previews on your product pages/);
  });

  it("returns an empty string rather than an excuse when it knows nothing", () => {
    expect(brainBlock({})).toBe("");
    expect(brainBlock({ strategy: null, ai: null })).toBe("");
  });

  it("tells the engine which keyword the strategy picked, and its cluster", () => {
    const block = brainBlock({
      strategy: ready, ai,
      targets: { primary: "buy sofa online", related: ["modern sectional", "corner sofa"], aeo: false },
    });
    expect(block).toMatch(/Target: "buy sofa online"/);
    expect(block).toMatch(/modern sectional, corner sofa/);
    // The plan comes first: the constraint before the task.
    expect(block.indexOf("THE STRATEGY")).toBeLessThan(block.indexOf("WHAT THIS PIECE IS FOR"));
  });

  it("asks for an answer-first shape only when the target is an AI-search gap", () => {
    const aeo = brainBlock({ strategy: ready, ai, targets: { primary: "does AR reduce returns", related: [], aeo: true } });
    expect(aeo).toMatch(/answer the question directly/i);
    const plain = brainBlock({ strategy: ready, ai, targets: { primary: "buy sofa online", related: [], aeo: false } });
    expect(plain).not.toMatch(/answer the question directly/i);
  });
});

describe("the brain never takes an engine down with it", () => {
  it("returns a usable shape with no client at all", async () => {
    const b = await genieBrain(null, { userId: "u1", host: "x.com" });
    expect(b.ready).toBe(false);
    expect(b.block).toBe("");
    expect(b.markets).toEqual([]);
    expect(b.targets).toBeNull();
  });

  it("still works to a plan when the database is down, instead of guessing", async () => {
    const angry = { from() { throw new Error("db down"); } };
    const b = await genieBrain(angry, { userId: "u1", host: "x.com", ai });
    // Nothing could be read or written, but the brief is enough to resolve the
    // same plan deterministically — so the engines stay in agreement even now.
    expect(b.ready).toBe(true);
    expect(b.businessName).toBe("ARQR360");
    expect(b.block).toMatch(/THE STRATEGY/);
    expect(b.targets).toBeNull();
  });

  it("has no plan and no floor when it has neither a database nor a scan", async () => {
    const angry = { from() { throw new Error("db down"); } };
    const b = await genieBrain(angry, { userId: "u1", host: "x.com" });
    expect(b.ready).toBe(false);
    expect(b.block).toBe("");
  });

  it("names the business from the host when the scan never said", () => {
    expect(businessNameFrom({}, "https://www.alis-rugs.com/shop")).toBe("alis-rugs");
    expect(businessNameFrom({ businessName: "Ali's Rugs" }, "alis-rugs.com")).toBe("Ali's Rugs");
    expect(businessNameFrom({}, "")).toBe("the business");
  });
});

describe("the floor is the same business the plan describes", () => {
  it("a fallback plan built from the brief is still ready to act on", () => {
    const s = fallbackStrategy(ai);
    const block = brainBlock({ strategy: s, ai });
    expect(block).toMatch(/THE STRATEGY|WHAT THE OWNER TOLD GENIE/);
  });
});
