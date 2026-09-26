// test/geo-targets.test.js
// The volumes an owner ranks their keywords by were measured in the United States
// no matter which country they sell to. These are the checks that stop that coming
// back: the geo has to follow the market, the language has to follow the words, and
// a number has to carry the name of the country it is about.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { iso2Of, resolveMarket, adsTargetFor, volumeLabel, writeForBlock, DEFAULT_GEO } from "@/lib/geo-targets";
import { COUNTRIES } from "@/lib/markets";

describe("naming a country", () => {
  it("reads the plan's own names", () => {
    expect(iso2Of("United Arab Emirates")).toBe("AE");
    expect(iso2Of("Pakistan")).toBe("PK");
    expect(iso2Of("Malaysia")).toBe("MY");
  });

  it("reads what an owner actually types", () => {
    expect(iso2Of("UAE")).toBe("AE");
    expect(iso2Of("uk")).toBe("GB");
    expect(iso2Of("USA")).toBe("US");
    expect(iso2Of("Turkey")).toBe("TR");
  });

  it("does not care about the accent in Türkiye", () => {
    expect(iso2Of("Türkiye")).toBe("TR");
    expect(iso2Of("Turkiye")).toBe("TR");
  });

  it("takes a market row from the plan, not just a string", () => {
    expect(iso2Of({ name: "India", score: 71 })).toBe("IN");
    expect(iso2Of({ iso2: "SA" })).toBe("SA");
  });

  it("says nothing rather than guessing", () => {
    expect(iso2Of("")).toBe(null);
    expect(iso2Of(null)).toBe(null);
    expect(iso2Of("Everywhere")).toBe(null);
    expect(iso2Of("our best customers")).toBe(null);
  });
});

describe("what Google is asked", () => {
  it("asks about the market, not the United States", () => {
    expect(adsTargetFor("United Arab Emirates").geoTargetConstants).toEqual(["geoTargetConstants/2784"]);
    expect(adsTargetFor("Pakistan").geoTargetConstants).toEqual(["geoTargetConstants/2586"]);
    expect(adsTargetFor("India").geoTargetConstants).toEqual(["geoTargetConstants/2356"]);
    expect(adsTargetFor("Malaysia").geoTargetConstants).toEqual(["geoTargetConstants/2458"]);
  });

  it("still answers for the United States when that is the market", () => {
    expect(adsTargetFor("United States").geoTargetConstants).toEqual([DEFAULT_GEO]);
  });

  it("falls back to the old behaviour when the country is unknown, and admits it", () => {
    const t = adsTargetFor("Narnia");
    expect(t.geoTargetConstants).toEqual([DEFAULT_GEO]);
    expect(t.known).toBe(false);
    expect(adsTargetFor(null).known).toBe(false);
  });

  // The keyword strings are English. Asking Google for Arabic-language volume of an
  // English phrase returns nothing, which would read as "no demand in your best
  // market" and quietly bury it.
  it("keeps the language of the words, not of the country", () => {
    expect(adsTargetFor("United Arab Emirates").language).toBe("languageConstants/1000");
    expect(adsTargetFor("Germany").language).toBe("languageConstants/1000");
    expect(adsTargetFor("Germany", { language: "de" }).language).toBe("languageConstants/1001");
    expect(adsTargetFor("Germany", { language: "klingon" }).language).toBe("languageConstants/1000");
  });

  it("every country Market Testing can recommend has a real geo", () => {
    for (const c of COUNTRIES) {
      const m = resolveMarket(c.name);
      expect(m.known, `${c.name} has no Google geo id`).toBe(true);
      expect(m.iso2).toBe(c.iso2);
      expect(m.geo).toMatch(/^geoTargetConstants\/2\d{2,3}$/);
    }
  });

  it("no two countries share a geo id", () => {
    const ids = COUNTRIES.map((c) => resolveMarket(c.name).geo);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the number says where it is from", () => {
  it("names the country", () => {
    expect(volumeLabel("Pakistan")).toBe("Monthly searches in Pakistan");
  });
  it("names the United States when that is what it measured", () => {
    expect(volumeLabel(null)).toBe("Monthly searches in the United States");
    expect(volumeLabel("Narnia")).toBe("Monthly searches in the United States");
  });
});

describe("writing for one country", () => {
  it("tells the writer the country, the money and the spelling", () => {
    const b = writeForBlock("United Arab Emirates");
    expect(b).toContain("UNITED ARAB EMIRATES");
    expect(b).toContain("AED");
    expect(b).toContain("British");
  });

  it("forbids inventing local facts", () => {
    expect(writeForBlock("India")).toMatch(/never invent/i);
    expect(writeForBlock("India")).toContain("INR");
  });

  it("says nothing when there is no market, rather than writing for nowhere", () => {
    expect(writeForBlock(null)).toBe("");
    expect(writeForBlock("")).toBe("");
  });
});

describe("the hardcoded United States is gone", () => {
  const code = (f) => fs.readFileSync(f, "utf8");

  it("no request builder pins the geo any more", () => {
    const ads = code("lib/google-ads.js");
    const hardcoded = ads.split("\n").filter((l) => !l.trim().startsWith("//") && /geoTargetConstants\/2840/.test(l));
    expect(hardcoded).toEqual([]);
    expect(ads).toContain("adsTargetFor");
  });

  it("the volume lookup is given the owner's market", () => {
    const kw = code("app/api/keywords/route.js");
    expect(kw).toMatch(/enrichWithVolumes\(supabase, user\.id, host, kwStrings, volumeMarket\)/);
    expect(kw).toContain("volumeLabel");
  });
});
