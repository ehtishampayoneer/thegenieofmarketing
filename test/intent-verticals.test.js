import { describe, it, expect } from "vitest";
import { verticalsFor } from "@/lib/intent-verticals";

const entity = (type, group) => ({ type, group, label: type });

// ARQR360: software sold TO furniture retailers. The business is in the
// furniture world; its buyers are the people who run the shops.
const arqr = {
  whatTheySell: "Augmented reality product views for online stores — customers see furniture in their own room before buying",
  businessType: "SaaS",
  summary: "AR previews and 3D models for furniture and rug retailers, reducing returns.",
  targetCustomer: "furniture stores, rug retailers and home decor e-commerce shops",
  keywords: ["ar for furniture", "3d product viewer", "reduce furniture returns"],
};

// The same vertical, but the shop itself. Its buyers are homeowners.
const shop = {
  whatTheySell: "Sofas, armchairs and rugs",
  businessType: "furniture shop",
  summary: "An independent furniture and rug retailer selling sofas online and in store.",
  targetCustomer: "homeowners furnishing a living room",
  keywords: ["buy sofa online", "rugs"],
};

describe("where a business's buyers actually ask", () => {
  it("sends a B2B seller to where shop owners ask, not where hobbyists build furniture", () => {
    const v = verticalsFor(entity("saas", "Tech & Product"), arqr);
    expect(v.sellsToBusinesses).toBe(true);
    expect(v.seSites).toEqual(["webmasters", "softwarerecs", "ux"]);
    // It still knows which world it is selling into, for the UI.
    expect(v.labels).toContain("Furniture, decor & interiors");
  });

  it("does not burn Hacker News and GitHub on buyers who have never opened them", () => {
    // Built with software, sold to furniture shops: the buyers are not technical.
    expect(verticalsFor(entity("saas", "Tech & Product"), arqr).tech).toBe(false);
  });

  it("still runs them when the buyers really are technical", () => {
    const devTool = { ...arqr, targetCustomer: "backend developers and devops engineers", summary: "A logging tool." };
    expect(verticalsFor(entity("saas", "Tech & Product"), devTool).tech).toBe(true);
  });

  it("falls back to the entity group only when the scan never said who the buyer is", () => {
    const thin = { whatTheySell: "A developer tool", businessType: "SaaS" };
    expect(verticalsFor(entity("saas", "Tech & Product"), thin).tech).toBe(true);
  });

  it("leaves a shop selling to consumers in its own vertical", () => {
    const v = verticalsFor(entity("ecommerce", "Retail"), shop);
    expect(v.sellsToBusinesses).toBe(false);
    expect(v.seSites).toContain("diy");
  });

  it("reads 'homeowners' as a person, not a business owner", () => {
    // The word "owner" is inside "homeowners"; a loose pattern would call this B2B
    // and send a sofa shop to Webmasters.
    expect(verticalsFor(entity("ecommerce", "Retail"), shop).sellsToBusinesses).toBe(false);
  });

  it("keeps the honest empty for a vertical Stack Exchange has no home for", () => {
    const planner = {
      whatTheySell: "Wedding planning", businessType: "wedding planner",
      summary: "A wedding planner.", targetCustomer: "engaged couples",
    };
    expect(verticalsFor(entity("service", "Services"), planner).seSites).toEqual([]);
  });

  it("does not change a plain local business with no B2B buyer", () => {
    const bakery = {
      whatTheySell: "Bread and pastries", businessType: "bakery",
      summary: "A neighbourhood bakery.", targetCustomer: "local families",
    };
    const v = verticalsFor(entity("restaurant", "Food"), bakery);
    expect(v.sellsToBusinesses).toBe(false);
    expect(v.seSites).toContain("cooking");
    expect(v.tech).toBe(false);
  });
});

describe("how many verticals is a real answer", () => {
  it("does not claim six markets because six words appeared once each", () => {
    // ARQR360's real scan: furniture everywhere, plus passing mentions of rooms,
    // photos and a studio. Six verticals matched, which told the owner nothing.
    const noisy = {
      whatTheySell: "AR product views for furniture retailers",
      summary: "Shoppers photograph their room and see the sofa, rug or cabinet in place before buying. Used by furniture and decor stores.",
      targetCustomer: "furniture stores and rug retailers",
      keywords: ["ar for furniture", "see sofa in my room", "rug visualiser"],
    };
    const v = verticalsFor(entity("saas", "Tech & Product"), noisy);
    expect(v.labels.length).toBeLessThanOrEqual(2);
    expect(v.labels[0]).toBe("Furniture, decor & interiors");
  });
});
