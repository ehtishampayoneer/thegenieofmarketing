import { describe, it, expect } from "vitest";
import { deDash } from "@/lib/markdown";

// deDash runs over every article and social post Genie PUBLISHES for a client, so a
// bad substitution ships broken grammar under their brand. These cover the cases the
// old blanket "every dash becomes a comma" rule got wrong.
describe("deDash — dashes become the right punctuation", () => {
  it("ends a thought with a full stop, not a comma, before a capital", () => {
    expect(deDash("It worked — Then we scaled.")).toBe("It worked. Then we scaled.");
  });

  it("keeps a mid-sentence aside as a comma", () => {
    expect(deDash("The sofa — a three seater — fits.")).toBe("The sofa, a three seater, fits.");
  });

  it("keeps number ranges as a hyphen", () => {
    expect(deDash("Open 2019—2024 and 10 – 15 units.")).toBe("Open 2019-2024 and 10-15 units.");
  });

  it("leaves clean prose untouched", () => {
    const clean = "Buy a sofa online, see it in your room, then decide.";
    expect(deDash(clean)).toBe(clean);
  });

  it("never leaves doubled or floating punctuation", () => {
    expect(deDash("Wait — , really")).not.toMatch(/,\s*,|\s,/);
  });

  it("passes non-strings through untouched", () => {
    expect(deDash(null)).toBe(null);
    expect(deDash(42)).toBe(42);
  });

  it("removes every em-dash — the actual point of the function", () => {
    const out = deDash("One — two — Three — four 5—6");
    expect(out).not.toContain("—");
  });
});
