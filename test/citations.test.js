import { describe, it, expect } from "vitest";
import { classifySource, detectMention, findCompetitors, looksPayToPlay, domainOf } from "@/lib/citations";

// This decides which third-party pages Genie treats as an opportunity and, later,
// which ones it pitches a real journalist about. A false "you're missing from this"
// wastes a pitch; a false "you're already in it" loses a placement.

describe("classifySource", () => {
  it("spots a buying guide from the title", () => {
    const c = classifySource("https://blog.example.com/best-ar-apps", "12 Best AR Shopping Apps in 2026");
    expect(c.kind).toBe("listicle");
    expect(c.actionable).toBe(true);
  });

  it("recognises review platforms", () => {
    expect(classifySource("https://www.g2.com/categories/ar", "AR Software").kind).toBe("review");
    expect(classifySource("https://trustpilot.com/review/x", "Reviews").kind).toBe("review");
  });

  it("recognises community sources", () => {
    expect(classifySource("https://www.reddit.com/r/x/comments/1", "Any good AR apps?").kind).toBe("community");
  });

  it("never treats the client's own site as a placement", () => {
    const c = classifySource("https://www.holos.com/products", "Our Products", "holos.com");
    expect(c.kind).toBe("own");
    expect(c.actionable).toBe(false);
  });

  it("marks press as not pitchable via the list play", () => {
    expect(classifySource("https://techcrunch.com/2026/01/x", "Startup raises").actionable).toBe(false);
  });

  it("handles junk urls without throwing", () => {
    expect(classifySource("not a url", "").kind).toBe("unknown");
    expect(domainOf("not a url")).toBe("");
  });
});

describe("detectMention", () => {
  it("finds the business by bare domain", () => {
    expect(detectMention("Check out holos.com for AR previews", { name: "HOLOS", host: "www.holos.com" })).toBe(true);
  });

  it("finds the business by name", () => {
    expect(detectMention("Our favourite is Holos, which shows furniture in AR.", { name: "HOLOS", host: "other.com" })).toBe(true);
  });

  it("reports absence honestly", () => {
    expect(detectMention("We recommend Threekit and Cylindo.", { name: "HOLOS", host: "holos.com" })).toBe(false);
  });

  it("ignores very short names to avoid false positives", () => {
    // A 2-letter brand would match almost any page; don't claim a mention from that.
    expect(detectMention("the best apps of the year", { name: "AR", host: "" })).toBe(false);
  });

  it("returns false for empty pages", () => {
    expect(detectMention("", { name: "HOLOS", host: "holos.com" })).toBe(false);
  });
});

describe("findCompetitors + pay-to-play", () => {
  it("names the rivals that took the slot", () => {
    const found = findCompetitors("We rate Threekit first, then Cylindo.", ["Threekit", "Cylindo", "Nobody"]);
    expect(found).toContain("Threekit");
    expect(found).toContain("Cylindo");
    expect(found).not.toContain("Nobody");
  });

  it("flags sponsored lists so they are never pitched blindly", () => {
    expect(looksPayToPlay("This is a sponsored post and contains affiliate links.")).toBe(true);
    expect(looksPayToPlay("An independent review of AR tools.")).toBe(false);
  });
});
