import { describe, it, expect } from "vitest";
import { audienceOf, splitByAudience, CUSTOMER, PARTNER } from "@/lib/audience";
import { normalizeStrategy, strategyBlock } from "@/lib/strategy";

const plan = normalizeStrategy({
  who: ["furniture retailer", "Shopify agency"],
  theirGoal: ["increase sales"],
  angle: "One of the ways furniture retailers are increasing online sales",
  mechanism: "Shoppers who see it in their room order with less doubt",
  offer: "AR product views. Starter $29 a month plus a $249 setup.",
  partnerOffer: "20% of the monthly fee, for as long as the client stays.",
});

describe("telling a customer from a route to twenty customers", () => {
  it("reads the niche that found them, because that is the search Genie ran", () => {
    expect(audienceOf({ industry: "Shopify development agencies" })).toBe(PARTNER);
    expect(audienceOf({ industry: "independent furniture retailers" })).toBe(CUSTOMER);
  });

  it("lets the end business win when both words appear", () => {
    // "furniture retailer web design" is a shop, not an agency.
    expect(audienceOf({ industry: "furniture retailers web design" })).toBe(CUSTOMER);
  });

  it("falls back to the company's own name when the niche says nothing", () => {
    expect(audienceOf({ industry: "ecommerce", company: "Pixel Studio" })).toBe(PARTNER);
    expect(audienceOf({ industry: "ecommerce", company: "Ali's Rugs" })).toBe(CUSTOMER);
  });

  it("treats anything it is unsure about as an ordinary customer", () => {
    // Getting this wrong costs a slightly off email. Getting it wrong the other
    // way offers someone a revenue share on a thing they do not sell.
    expect(audienceOf({})).toBe(CUSTOMER);
    expect(audienceOf({ industry: "widgets" })).toBe(CUSTOMER);
    expect(audienceOf(null)).toBe(CUSTOMER);
  });

  it("matches whole words, so a stray substring cannot flip an audience", () => {
    expect(audienceOf({ industry: "agencies of change consultancy" })).toBe(PARTNER);
    expect(audienceOf({ company: "Managency Foods" })).toBe(CUSTOMER);
  });

  it("splits a batch without losing anyone", () => {
    const list = [
      { industry: "Shopify agencies", email: "a@x.com" },
      { industry: "rug retailers", email: "b@x.com" },
      { industry: "rug retailers", email: "c@x.com" },
    ];
    const out = splitByAudience(list);
    expect(out[PARTNER]).toHaveLength(1);
    expect(out[CUSTOMER]).toHaveLength(2);
  });
});

describe("the plan says a different thing to each of them", () => {
  it("tells a customer the price", () => {
    const b = strategyBlock(plan, { audience: CUSTOMER });
    expect(b).toMatch(/What we sell, and what it costs/);
    expect(b).toMatch(/\$29 a month/);
    // And does not clutter a customer email with partner terms.
    expect(b).not.toMatch(/20% of the monthly fee/);
  });

  it("tells a partner what they get, and forbids the retail pitch", () => {
    const b = strategyBlock(plan, { audience: PARTNER });
    expect(b).toMatch(/YOU ARE WRITING TO A PARTNER, NOT A CUSTOMER/);
    expect(b).toMatch(/What they get: 20% of the monthly fee/);
    expect(b).toMatch(/Do NOT pitch this price to them/);
  });

  it("refuses to quote a price to a partner when no terms are written down", () => {
    // The failure this split exists to prevent: with no partner terms, the old
    // behaviour was to fall back to the retail pitch and ask them to buy.
    const noTerms = normalizeStrategy({ ...plan, partnerOffer: "" });
    const b = strategyBlock(noTerms, { audience: PARTNER });
    expect(b).toMatch(/has not written down partner terms yet/);
    expect(b).toMatch(/do NOT quote a price or ask them to buy/);
    expect(b).not.toMatch(/\$29 a month/);
  });

  it("keeps the conditional wording when nobody said who is reading", () => {
    // Articles and posts have no single reader, so the general block still
    // carries both, as it did before.
    const b = strategyBlock(plan, {});
    expect(b).toMatch(/What we sell, and what it costs/);
    expect(b).toMatch(/If this piece is aimed at an AGENCY/);
  });
});
