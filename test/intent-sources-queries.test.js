import { describe, it, expect } from "vitest";
import { buildIntentQueries, emptyRunMessage } from "@/lib/intent";

const entity = { label: "SaaS", dims: { audience: "b2b", conversionGoal: "lead" }, playbook: { primaryGoal: "leads" } };

describe("the queries Genie searches with", () => {
  it("keeps a two-word rival name together and pins it to the category", () => {
    // "Shopify AR alternative" was read by search engines as "Shopify
    // alternative", and came back full of people leaving Shopify over payments,
    // email and hosting — none of whom want what the owner sells.
    const ai = { businessName: "ARQR360", industry: "3d product viewer", competitors: [{ name: "Shopify AR" }] };
    const qs = buildIntentQueries(entity, ai, []).map((q) => q.query);
    const rival = qs.find((q) => q.includes("Shopify AR"));
    expect(rival).toContain('"Shopify AR"');
    expect(rival).toContain("3d product viewer");
  });

  it("leaves a one-word rival name unquoted", () => {
    const ai = { businessName: "ARQR360", industry: "3d product viewer", competitors: [{ name: "Threekit" }] };
    const qs = buildIntentQueries(entity, ai, []).map((q) => q.query);
    expect(qs.some((q) => q.startsWith("Threekit alternative"))).toBe(true);
  });
});

describe("what a hunt says when it finds nobody", () => {
  // Each of these needs the owner to do something different, so a single "0
  // buyers found" was the one answer that helped with none of them.
  it("says the searches themselves came back empty", () => {
    expect(emptyRunMessage({ pages: 0, lowIntent: 0, alreadyOnList: 0, notBuyers: 0 })).toMatch(/searches came back empty/i);
  });

  it("names the trap: everything found is already on the list", () => {
    // The one that would otherwise report zero forever — the same queries
    // return the same pages, and every one is filtered as already seen.
    const m = emptyRunMessage({ pages: 9, lowIntent: 0, alreadyOnList: 9, notBuyers: 0 });
    expect(m).toMatch(/already on your list/i);
    expect(m).toMatch(/rivals|keywords/i);
  });

  it("says so when pages were read and none were buyers", () => {
    expect(emptyRunMessage({ pages: 9, lowIntent: 0, alreadyOnList: 0, notBuyers: 9 })).toMatch(/none were real buyers/i);
  });

  it("says so when nobody was close to buying", () => {
    expect(emptyRunMessage({ pages: 9, lowIntent: 9, alreadyOnList: 0, notBuyers: 0 })).toMatch(/close to buying/i);
  });
});
