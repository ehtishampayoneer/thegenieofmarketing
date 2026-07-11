import { describe, it, expect } from "vitest";
import { scoreIntent, buildIntentQueries } from "@/lib/intent";
import { classifyEntity } from "@/lib/entity";
import { taggedLink, attributionFromParams } from "@/lib/attribution";
import { cacheGet, cacheSet } from "@/lib/cache";

describe("buyer-intent scoring", () => {
  it("scores a comparison + competitor query high", () => {
    const s = scoreIntent("best crm alternative to salesforce, is it worth it", { competitors: ["salesforce"] });
    expect(s.stage === "comparing" || s.stage === "ready_to_buy").toBe(true);
    expect(s.competitorMention).toBe(true);
    expect(s.score).toBeGreaterThan(60);
  });
  it("scores idle chatter low", () => {
    expect(scoreIntent("just saying hello everyone", {}).score).toBeLessThan(45);
  });
});

describe("buyer-question universe", () => {
  it("builds competitor-alternative queries from the entity", () => {
    const entity = classifyEntity({ businessType: "SaaS" });
    const qs = buildIntentQueries(entity, { businessName: "Acme", industry: "crm", competitors: [{ name: "Salesforce" }] }, []);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.some((q) => /alternative/i.test(q.query))).toBe(true);
  });
});

describe("attribution", () => {
  it("UTM-tags a link with the decision ref", () => {
    const l = taggedLink("https://acme.com/pricing", { channel: "email", campaign: "Acme Co", ref: "decision-1" });
    expect(l).toContain("utm_source=marketing-genie");
    expect(l).toContain("utm_medium=email");
    expect(l).toContain("utm_campaign=acme-co");
    expect(l).toContain("utm_content=decision-1");
  });
  it("reads Genie attribution back from params", () => {
    const a = attributionFromParams({ utm_source: "marketing-genie", utm_content: "decision-1" });
    expect(a.fromGenie).toBe(true);
    expect(a.ref).toBe("decision-1");
  });
});

describe("cache TTL", () => {
  it("returns fresh values and expires stale ones", () => {
    cacheSet("k-fresh", 42, 5000);
    expect(cacheGet("k-fresh")).toBe(42);
    cacheSet("k-stale", 7, -1);
    expect(cacheGet("k-stale")).toBeUndefined();
  });
});
