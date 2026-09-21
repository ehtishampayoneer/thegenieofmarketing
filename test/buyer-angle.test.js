import { describe, it, expect } from "vitest";
import { sellerWords, sellerGoals, growthQueries, mechanism, awarenessOf } from "@/lib/buyer-angle";

// ARQR360 as the owner describes it. The buyer is a furniture retailer who has
// never heard of AR, and spends their week looking for ways to sell more.
const arqr = {
  whatTheySell: "Augmented reality product views — shoppers see the sofa in their own room before buying",
  targetCustomer: "furniture stores and rug retailers",
  competitors: [],
  brief: {
    offer: "AR previews and 3D models on your product pages, from a QR code, with no app to install",
    segments: ["furniture retailers", "rug and carpet shops"],
    problems: [
      "Customers can't tell if a sofa will fit their room, so a third of orders come back",
      "Shoppers hesitate at checkout because they can't picture the piece at home",
    ],
  },
};

describe("talking to a seller about growing sales", () => {
  it("names the seller the way they describe themselves", () => {
    expect(sellerWords(arqr)).toEqual(["furniture retailer", "rug and carpet shop"]);
  });

  it("reads the outcomes off the owner's own problem list", () => {
    const goals = sellerGoals(arqr);
    expect(goals[0]).toBe("increase sales");          // what every seller searches
    expect(goals).toContain("reduce returns");        // from "a third of orders come back"
    expect(goals).toContain("help shoppers decide");  // from "can't tell if it will fit"
  });

  it("searches where a seller looks for ways to grow, not for this product", () => {
    const qs = growthQueries(arqr).map((q) => q.query);
    expect(qs).toContain("how to increase furniture retailer sales");
    expect(qs).toContain("best apps for furniture retailer");
    expect(qs.some((q) => /reduce returns/.test(q))).toBe(true);
    // Nothing here names the product or a rival: nobody is searching for those.
    expect(qs.every((q) => !/\bar\b|augmented|vntana|threekit/i.test(q))).toBe(true);
    expect(growthQueries(arqr).every((q) => q.group === "growth")).toBe(true);
  });

  it("carries the reason it makes them money, not what it is", () => {
    const m = mechanism(arqr);
    expect(m).toContain("AR previews");                 // what they bought
    expect(m).toContain("a third of orders come back"); // what it removes
    expect(m).toContain("increase sales");              // what that moves
  });

  it("says nobody is comparing when no rival has been named", () => {
    expect(awarenessOf(arqr)).toBe("growth");
    expect(awarenessOf({ ...arqr, competitors: [{ name: "Threekit" }, { name: "VNTANA" }] })).toBe("product");
  });

  it("has nothing to search for a business that never said who it sells to", () => {
    expect(growthQueries({ whatTheySell: "software" })).toEqual([]);
  });
});
