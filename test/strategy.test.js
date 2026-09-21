import { describe, it, expect } from "vitest";
import { normalizeStrategy, strategyReady, fallbackStrategy, readStrategy, strategyBlock } from "@/lib/strategy";

const arqr = {
  businessName: "ARQR360",
  whatTheySell: "Augmented reality product views — shoppers see the sofa in their own room before buying",
  targetCustomer: "furniture stores and rug retailers",
  competitors: [],
  brief: {
    offer: "AR previews and 3D models on your product pages, from a QR code, with no app to install",
    segments: ["furniture retailers", "rug and carpet shops"],
    problems: ["Customers can't tell if a sofa will fit their room, so a third of orders come back"],
    cta: "Book a 10-minute demo",
    neverSay: ["Never promise a specific conversion uplift"],
  },
};

describe("the strategy every engine follows", () => {
  it("fills every field, so an engine never has to defend against a half-built one", () => {
    const s = normalizeStrategy({});
    expect(s.who).toEqual([]);
    expect(s.angle).toBe("");
    expect(s.mechanism).toBe("");
    expect(s.markets).toEqual([]);
    expect(s.confirmedAt).toBeNull();
  });

  it("is only ready when it says who, what they want, how we show up and why", () => {
    expect(strategyReady({})).toBe(false);
    expect(strategyReady({ who: ["furniture retailer"], theirGoal: ["increase sales"], angle: "a way to grow" })).toBe(false);
    expect(strategyReady({ who: ["furniture retailer"], theirGoal: ["increase sales"], angle: "a way to grow", mechanism: "because X" })).toBe(true);
  });

  it("builds a usable strategy with no AI at all, because Genie must never stop", () => {
    const s = fallbackStrategy(arqr);
    expect(s.source).toBe("fallback");
    expect(strategyReady(s)).toBe(true);
    expect(s.who).toContain("furniture retailer");
    expect(s.theirGoal).toContain("increase sales");
    expect(s.theirGoal).toContain("reduce returns");
    // The angle is about what the seller is doing, not what we sell.
    expect(s.angle).toMatch(/one of the ways/i);
    expect(s.angle).not.toMatch(/augmented|AR\b/i);
    // And it carries the owner's own rules.
    expect(s.cta).toBe("Book a 10-minute demo");
    expect(s.neverSay[0]).toMatch(/conversion uplift/);
  });

  it("searches where the seller already looks, never for the product's name", () => {
    const s = fallbackStrategy(arqr);
    expect(s.whereTheyLook.some((q) => /increase furniture retailer sales/.test(q))).toBe(true);
    expect(s.whereTheyLook.every((q) => !/augmented|\bar\b/i.test(q))).toBe(true);
  });

  it("prefers the deterministic strategy over an AI answer that decided nothing", () => {
    const empty = readStrategy({ who: [], angle: "" }, arqr);
    expect(empty.source).toBe("fallback");
    expect(strategyReady(empty)).toBe(true);
  });

  it("takes the AI's answer when it actually resolved the business", () => {
    const s = readStrategy({
      who: ["furniture retailer"], theirGoal: ["increase online sales"],
      angle: "One of the ways furniture retailers are increasing online sales",
      mechanism: "Shoppers see it in their room, know it fits, and stop hesitating",
    }, arqr);
    expect(s.source).toBe("ai");
    expect(s.angle).toMatch(/increasing online sales/);
  });

  it("falls back rather than throwing when the model returns nothing usable", () => {
    expect(readStrategy(null, arqr).source).toBe("fallback");
    expect(readStrategy("not json", arqr).source).toBe("fallback");
  });

  it("tells engines plainly when the owner has not confirmed it yet", () => {
    const draft = strategyBlock(fallbackStrategy(arqr));
    expect(draft).toMatch(/has NOT confirmed/);
    const confirmed = strategyBlock({ ...fallbackStrategy(arqr), confirmedAt: "2026-09-21T00:00:00Z" });
    expect(confirmed).toMatch(/has confirmed this is right/);
  });

  it("says nothing at all rather than half a plan", () => {
    expect(strategyBlock({ who: ["someone"] })).toBe("");
  });
});

// ── The engines actually read it ─────────────────────────────────────────────
// A strategy nothing consumes is the problem it was built to solve, so this
// pins the wiring: if an engine stops passing the plan into its prompt, this
// fails rather than the owner noticing months later in the output.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ENGINES = [
  ["the article writer", "app/api/content/route.js"],
  ["keyword strategy", "app/api/keywords/route.js"],
  ["buyer hunt", "app/api/radar/intent/route.js"],
  ["find clients", "app/api/prospects/discover/route.js"],
  ["get featured", "app/api/featured/discover/route.js"],
  ["outreach", "app/api/outreach/campaign/route.js"],
  ["the crowd", "lib/swarm/engine.js"],
];

describe("every engine works to the plan", () => {
  for (const [name, file] of ENGINES) {
    it(`${name} reads it`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src).toContain("strategyPromptBlock");
    });
  }

  it("the testers judge against it and the improvers rewrite towards it", () => {
    const judge = readFileSync(join(process.cwd(), "lib/swarm/judge.js"), "utf8");
    const improve = readFileSync(join(process.cwd(), "lib/swarm/improve.js"), "utf8");
    expect(judge).toMatch(/plan = ""/);
    expect(judge).toMatch(/never heard of this kind of product/);
    expect(improve).toMatch(/plan = ""/);
    expect(improve).toMatch(/Never open by naming the product/);
  });
});

describe("the plan does not re-answer what another section already answered", () => {
  it("asks the model to leave markets empty", () => {
    const src = readFileSync(join(process.cwd(), "lib/strategy.js"), "utf8");
    // Market Testing ranks every country on real demand, competition and the
    // owner's own Search Console data. A second answer from a model would
    // contradict it, which is what "every section is different software" means.
    expect(src).toMatch(/Leave "markets" empty/);
    expect(src).toMatch(/Genie fills it from Market Testing/);
  });

  it("fills them from the Market Testing scorer instead", () => {
    const src = readFileSync(join(process.cwd(), "lib/strategy-store.js"), "utf8");
    expect(src).toMatch(/scoreMarkets/);
    expect(src).toMatch(/getGscCountries/);
    // Only markets it is actually sure about: an estimate is not a recommendation.
    expect(src).toMatch(/confidence === "verified"/);
  });
});
