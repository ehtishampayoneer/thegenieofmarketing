import { describe, it, expect } from "vitest";
import { classifyEntity, derivePlaybook, entityBriefing, ENTITY_TYPES } from "@/lib/entity";

describe("entity classification", () => {
  it("maps a SaaS from scan analysis", () => {
    const e = classifyEntity({ businessType: "SaaS", whatTheySell: "a platform" });
    expect(e.type).toBe("saas");
    expect(e.playbook.channels.length).toBeGreaterThan(0);
  });
  it("detects a restaurant", () => {
    expect(classifyEntity({ industry: "restaurant" }).type).toBe("restaurant");
  });
  it("falls back to business", () => {
    const e = classifyEntity({});
    expect(e.type).toBe("business");
    expect(e.confidence).toBeLessThan(0.6);
  });
  it("respects a manual override", () => {
    expect(classifyEntity({}, "musician").type).toBe("musician");
  });
});

describe("playbook derivation", () => {
  it("derives channels with a 'why' for every entity type", () => {
    for (const t of Object.values(ENTITY_TYPES)) {
      const pb = derivePlaybook(t.dims);
      expect(pb.channels.length).toBeGreaterThan(0);
      expect(pb.channels[0].why).toBeTruthy();
      expect(pb.aeoFocus).toBeGreaterThanOrEqual(0);
    }
  });
  it("briefing names the entity", () => {
    const brief = entityBriefing(classifyEntity({ businessType: "SaaS" }));
    expect(brief).toContain("SaaS");
  });
});
