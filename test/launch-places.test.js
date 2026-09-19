import { describe, it, expect } from "vitest";
import { PLACES, businessFits, placesFor, normalizeKit, copyFor, PLACE_INDEX, KIND_LABEL } from "@/lib/launch-places";

describe("the launch list", () => {
  it("has unique ids, https links, and known kinds, tiers and copy types", () => {
    const ids = PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PLACES) {
      expect(p.url).toMatch(/^https:\/\//);
      expect(KIND_LABEL[p.kind]).toBeTruthy();
      expect([1, 2, 3]).toContain(p.tier);
      expect(["launch", "showhn", "reddit", "story", "long", "short"]).toContain(p.copy);
      expect(p.fits.length).toBeGreaterThan(0);
    }
  });

  it("reads an AR furniture software business as software, b2b and home", () => {
    const fits = businessFits({ whatTheySell: "AR software that lets furniture stores show sofas in the buyer's room", targetCustomer: "furniture retailers and brands" });
    expect(fits).toEqual(expect.arrayContaining(["software", "b2b", "home", "startup"]));
    expect(fits).not.toContain("ai");
  });

  it("reads a local plumber as local, not software", () => {
    const fits = businessFits({ whatTheySell: "Emergency plumber serving homes across our city", targetCustomer: "homeowners near me" });
    expect(fits).toEqual(expect.arrayContaining(["local", "consumer"]));
    expect(fits).not.toContain("software");
  });

  it("puts the best places first and leaves out ones that don't fit", () => {
    const list = placesFor(["software", "b2b", "home", "startup"]);
    expect(list[0].tier).toBe(1);
    expect(list.map((p) => p.id)).toEqual(expect.arrayContaining(["g2", "capterra", "houzz", "producthunt"]));
    expect(list.map((p) => p.id)).not.toContain("taaft"); // AI-only directory
    expect(placesFor(["software"], { all: true }).length).toBe(PLACES.length);
  });

  it("builds the right text to paste for each kind of place", () => {
    const kit = normalizeKit({
      tagline: "See furniture in your room", short: "AR for furniture stores.", long: "Long text.",
      categories: ["AR"], tags: ["furniture"], launch_comment: "I built this because...",
      showhn_title: "Show HN: ARQR – AR for furniture stores", reddit_title: "I built AR for furniture", reddit_body: "Body", story: "Story",
    });
    expect(copyFor(PLACE_INDEX.showhn, kit, "arqr360.com")).toMatch(/^Show HN: ARQR[\s\S]*https:\/\/arqr360\.com/);
    expect(copyFor(PLACE_INDEX["r-sideproject"], kit)).toBe("I built AR for furniture\n\nBody");
    expect(copyFor(PLACE_INDEX.g2, kit)).toContain("Categories: AR");
    expect(copyFor(PLACE_INDEX.producthunt, kit)).toContain("I built this because");
    expect(copyFor(PLACE_INDEX.g2, null)).toBe("");
  });
});
