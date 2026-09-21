import { describe, it, expect } from "vitest";
import { asSearchPhrase, buyerProblems, painQueries, awarenessOf } from "@/lib/buyer-angle";

// ARQR360 as the owner describes it: AR for furniture retailers, whose buyers
// have never considered AR but complain about returns every day.
const arqr = {
  targetCustomer: "furniture stores and rug retailers",
  competitors: [],
  brief: {
    segments: ["furniture retailers", "rug and carpet shops"],
    problems: [
      "Customers can't tell if a sofa will fit their room, so a third of orders come back",
      "Shoppers ask for photos of the item in a real room before they commit",
      "Online conversion is much lower than in store",
    ],
  },
};

describe("turning the owner's problem into the buyer's words", () => {
  it("drops the owner's lead-in so the phrase reads like a search", () => {
    expect(asSearchPhrase("Customers can't tell if a sofa will fit their room"))
      .toBe("tell if a sofa will fit their room");
    expect(asSearchPhrase("Our clients struggle to keep their staff rota filled"))
      .toBe("keep their staff rota filled");
  });

  it("keeps the first clause, because a sentence is not a search query", () => {
    expect(asSearchPhrase("Shoppers worry about delivery times, which makes them abandon the basket"))
      .toBe("delivery times");
  });

  it("leaves a phrase alone when there is no lead-in to strip", () => {
    expect(asSearchPhrase("Online conversion is much lower than in store"))
      .toBe("online conversion is much lower than in store");
  });

  it("reads the owner's brief first, and the scan's guess only as a fallback", () => {
    expect(buyerProblems(arqr)[0]).toContain("sofa will fit");
    const scanOnly = { painPoints: "High return rates; customers cannot judge scale" };
    expect(buyerProblems(scanOnly)).toHaveLength(2);
  });

  it("ignores a one-word problem, which would search for nothing useful", () => {
    expect(buyerProblems({ painPoints: "returns; cost; trust" })).toEqual([]);
  });

  it("hunts the pain, and names the people who have it", () => {
    const qs = painQueries(arqr).map((q) => q.query);
    // The problem itself — someone describing it is someone who has it.
    expect(qs).toContain("tell if a sofa will fit their room");
    // And the same problem attached to who Genie is looking for.
    expect(qs.some((q) => q.includes("furniture retailers"))).toBe(true);
    expect(painQueries(arqr).every((q) => q.group === "pain")).toBe(true);
  });

  it("finds nothing to hunt when the owner has not said what problem they solve", () => {
    expect(painQueries({ targetCustomer: "everyone" })).toEqual([]);
  });
});

describe("how much the buyer already knows", () => {
  it("is problem-only for a product nobody is shopping for by name", () => {
    // ARQR names no competitors: nobody is typing "alternative to" anything.
    expect(awarenessOf(arqr)).toBe("problem");
  });

  it("is product-level once there are real names to compare", () => {
    expect(awarenessOf({ ...arqr, competitors: [{ name: "Threekit" }, { name: "VNTANA" }] })).toBe("product");
  });

  it("does not claim problem-awareness with no problem to point at", () => {
    expect(awarenessOf({ competitors: [] })).toBe("solution");
  });
});
