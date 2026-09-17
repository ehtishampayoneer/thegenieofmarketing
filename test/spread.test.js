import { describe, it, expect } from "vitest";
import { normalizePack, spreadPrompt, CHANNELS } from "@/lib/spread";

describe("spreading one article", () => {
  it("keeps only channels that came back with real text", () => {
    const pack = normalizePack({
      medium: { title: "T", body: "x".repeat(200) },
      linkedin: { title: "L", body: "y".repeat(90) },
      devto: { title: "D", body: "too short" },     // not technical: skipped
      reddit: { body: "" },
      quora: { title: "Q", body: "z".repeat(150) },
    });
    expect(pack.map((c) => c.id)).toEqual(["medium", "linkedin", "quora"]);
    // Each carries the honest label for what it does.
    expect(pack.find((c) => c.id === "medium").kind).toBe("republish");
    expect(pack.find((c) => c.id === "quora").kind).toBe("community");
  });

  it("points every republish at the owner's own URL when they have one", () => {
    const p = spreadPrompt({ article: { title: "A", body: "b" }, ai: {}, canonical: "https://genie.app/p/x/y", ownUrl: "https://arqr360.com/blog/a" });
    expect(p).toContain("LINK TO THE ORIGINAL: https://arqr360.com/blog/a");
    expect(p).not.toContain("LINK TO THE ORIGINAL: https://genie.app");
  });

  it("falls back to the Genie page when the article is not on their site yet", () => {
    expect(spreadPrompt({ article: { title: "A" }, ai: {}, canonical: "https://genie.app/p/x/y" })).toContain("https://genie.app/p/x/y");
  });

  it("puts the owner's own site first, as the only ranking-building copy", () => {
    expect(CHANNELS[0].id).toBe("own_site");
    expect(CHANNELS[0].effect).toMatch(/only version that builds YOUR site/i);
  });
});
