import { describe, it, expect } from "vitest";
import { buildIntentQueries } from "@/lib/intent";

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
