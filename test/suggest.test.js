import { describe, it, expect } from "vitest";
import { cleanNiche, nicheSuggestions, targetSuggestions, rivalSuggestions } from "@/lib/suggest";

describe("cleanNiche", () => {
  it("strips the search modifiers that would break a wrapped query", () => {
    // The plays build "best {niche}" — leaving "best" in gives "best best rugs".
    expect(cleanNiche("best area rugs online")).toBe("area rugs");
    expect(cleanNiche("buy handmade wool rugs near me")).toBe("handmade wool rugs");
    expect(cleanNiche("cheap plumbers uk")).toBe("plumbers");
  });
  it("does not leave a dangling joining word behind", () => {
    expect(cleanNiche("rugs and")).toBe("rugs");
  });
  it("leaves a clean phrase alone", () => {
    expect(cleanNiche("AR shopping technology")).toBe("ar shopping technology");
  });
});

describe("niche suggestions (Get Featured)", () => {
  const ai = {
    businessName: "ARQR",
    subCategory: "AR shopping technology",
    industry: "retail technology",
    whatTheySell: "AR catalogues for furniture and rug shops",
    keywordsToOwn: ["augmented reality shopping"],
  };

  it("is built from the business, never from a hardcoded example", () => {
    const out = nicheSuggestions({ ai });
    expect(out.length).toBeGreaterThan(1);
    expect(out.map((s) => s.text)).toContain("ar shopping technology");
    for (const s of out) expect(s.why).toBeTruthy();
  });

  it("never suggests the owner's own brand — no one writes a roundup of you", () => {
    const out = nicheSuggestions({
      ai: { businessName: "Rugsy", subCategory: "Rugsy handmade rugs", industry: "home decor" },
    });
    expect(out.some((s) => /rugsy/i.test(s.text))).toBe(false);
  });

  it("orders real keywords by measured demand and only labels a real number", () => {
    const out = nicheSuggestions({
      ai: { businessName: "Acme" },
      keywords: [
        { keyword: "small rugs", priority: 1 },
        { keyword: "best area rugs online", volume: 12000, priority: 3 },
      ],
    });
    expect(out[0].text).toBe("area rugs");     // cleaned, and highest volume first
    expect(out[0].volume).toBe(12000);
    const guess = out.find((s) => s.text === "small rugs");
    expect(guess.volume).toBeUndefined();      // no invented number
  });

  it("drops a phrase that only restates one already on the list", () => {
    const out = nicheSuggestions({
      ai: { businessName: "Acme", subCategory: "rugs", whatTheySell: "handmade rugs" },
    });
    const texts = out.map((s) => s.text);
    expect(texts).toContain("rugs");
    expect(texts).not.toContain("handmade rugs");
  });

  it("returns nothing rather than junk when the scan knows nothing", () => {
    expect(nicheSuggestions({ ai: {} })).toEqual([]);
  });
});

describe("target suggestions (Find clients)", () => {
  it("splits who they sell to into separate groups", () => {
    const out = targetSuggestions({
      ai: { businessName: "ARQR", targetCustomer: "furniture retailers and rug shops" },
    });
    const texts = out.map((s) => s.text);
    expect(texts).toContain("furniture retailers");
    expect(texts).toContain("rug shops");
  });

  it("only says 'independent' when the phrase names a business type", () => {
    const biz = targetSuggestions({ ai: { targetCustomer: "furniture retailers" } });
    expect(biz.map((s) => s.text)).toContain("independent furniture retailers");
    // "independent homeowners" is not a thing.
    const people = targetSuggestions({ ai: { targetCustomer: "homeowners" } });
    expect(people.some((s) => /^independent/.test(s.text))).toBe(false);
  });

  it("adds the market when the site names one", () => {
    const out = targetSuggestions({ ai: { targetCustomer: "rug shops", primaryMarket: "Pakistan" } });
    expect(out.map((s) => s.text)).toContain("rug shops in Pakistan");
  });

  it("falls back to the category when the site never says who it sells to", () => {
    const out = targetSuggestions({ ai: { businessName: "Acme", subCategory: "office furniture" } });
    expect(out.map((s) => s.text)).toContain("office furniture brands");
  });
});

describe("rival suggestions (Buyer Hunt)", () => {
  it("takes the names the scan inferred, in either shape, minus itself", () => {
    const out = rivalSuggestions({
      ai: { businessName: "ARQR", competitors: [{ name: "Zappar" }, "8th Wall", { name: "ARQR" }] },
    });
    expect(out.map((s) => s.text)).toEqual(["Zappar", "8th Wall"]);
  });
  it("is empty when the scan named none, rather than inventing one", () => {
    expect(rivalSuggestions({ ai: {} })).toEqual([]);
  });
});
