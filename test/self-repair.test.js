import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repairable, repairNote, MAX_ATTEMPTS } from "@/lib/self-repair";
import { CLAIM_RULES, scanClaims } from "@/lib/claim-rules";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");

vi.mock("@/lib/ai-router", () => ({ callAI: vi.fn() }));
const { callAI } = await import("@/lib/ai-router");
const { repairClaims } = await import("@/lib/self-repair");

// ── WHY THIS EXISTS ──
// The guard refused an article for seven claims and handed the owner the list: the
// sentences, and a paragraph of reasoning for each. Genie wrote those sentences and
// Genie flagged them, and a furniture retailer was asked to settle the argument on
// 780 words they had not written. The owner's job is yes or no.
describe("the writer is told the rules the checker enforces", () => {
  it("both halves read one list, so they cannot drift apart", () => {
    // This is the actual defect: the writer's brief said "expert SEO content
    // writer, no generic filler" and nothing about superlatives or absolutes.
    expect(read("lib/factcheck.js")).toMatch(/export \{ scanClaims \} from "@\/lib\/claim-rules"/);
    expect(read("app/api/content/route.js")).toMatch(/\$\{CLAIM_RULES\}/);
  });

  it("the rules name the things that actually got flagged", () => {
    for (const w of ["superlative", "absolute", "frequency", "statistic"]) {
      expect(CLAIM_RULES.toLowerCase(), w).toContain(w);
    }
    // And they teach the replacement, not just the ban — a model given only a
    // blocklist writes around it and means the same thing.
    expect(CLAIM_RULES).toMatch(/specific true thing/i);
  });

  it("catches the exact wording that got through", () => {
    for (const s of [
      "The best online retailers offer tools",
      "ensuring your high-ticket purchase feels right at home",
      "perfectly complements your living space",
      "It happens more often than we'd like to admit",
    ]) expect(scanClaims(s).length, s).toBeGreaterThan(0);
  });

  it("leaves an honest specific sentence alone", () => {
    for (const s of [
      "A 3ft doorway will not take a 2.1m sofa.",
      "Measure the doorway, the stairwell and the turn at the top.",
    ]) expect(scanClaims(s), s).toEqual([]);
  });
});

describe("Genie rewrites its own sentences", () => {
  const body = 'Intro here. The best online retailers offer tools. Then more text that stays exactly as it was, at some length so the drift check has something to measure against properly.';
  const claims = [{ claim: "The best online retailers offer tools.", why: "unverifiable superlative" }];

  it("replaces only what was flagged", async () => {
    callAI.mockResolvedValueOnce({ json: { fixed: [{ n: 1, to: "Some retailers publish room dimensions." }] } });
    const r = await repairClaims(body, claims);
    expect(r.ok).toBe(true);
    expect(r.text).toContain("Some retailers publish room dimensions.");
    expect(r.text).not.toContain("The best online retailers");
    expect(r.text).toContain("Then more text that stays exactly as it was");
    expect(r.fixed).toEqual([{ from: claims[0].claim, to: "Some retailers publish room dimensions." }]);
  });

  it("refuses a replacement that breaks the same rule", async () => {
    callAI.mockResolvedValueOnce({ json: { fixed: [{ n: 1, to: "The best retailers guarantee a perfect fit." }] } });
    const r = await repairClaims(body, claims);
    expect(r.ok).toBe(false);
    expect(r.text).toBe(body);
  });

  it("throws the whole thing away if it rewrote the article instead of the sentence", async () => {
    // A "replacement" half as long again as the whole article is a rewrite wearing
    // the word replacement, and none of it can be trusted.
    const essay = "Some retailers publish room dimensions. ".repeat(12);
    callAI.mockResolvedValueOnce({ json: { fixed: [{ n: 1, to: essay }] } });
    const r = await repairClaims(body, claims);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("rewrote_too_much");
    expect(r.text).toBe(body);
  });

  it("does nothing when the claim cannot be found word for word", async () => {
    const r = await repairClaims(body, [{ claim: "a sentence that is not in the text" }]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("claims_not_found_verbatim");
    expect(callAI).not.toHaveBeenCalled;
  });

  it("returns the original, never nothing, when the AI is down", async () => {
    callAI.mockRejectedValueOnce(new Error("all providers failed"));
    const r = await repairClaims(body, claims);
    expect(r.ok).toBe(false);
    expect(r.text).toBe(body);
    expect(r.reason).toBe("ai_unavailable");
  });

  it("tries once, because a second failure is worth the owner's attention", () => {
    expect(MAX_ATTEMPTS).toBe(1);
  });
});

describe("what Genie will not try to reword", () => {
  it("repairs claims", () => {
    expect(repairable({ claims: [{ claim: "x" }], flags: [], scaled: {} })).toBe(true);
  });

  it("never rewords its way out of a near-duplicate", () => {
    // Rewording would be Genie hiding its own mistake on the owner's site.
    expect(repairable({ claims: [{ claim: "x" }], flags: [], scaled: { duplicateOf: "An earlier piece" } })).toBe(false);
  });

  it("never rewords toxic or thin content", () => {
    expect(repairable({ claims: [{ claim: "x" }], flags: ["toxic_language"], scaled: {} })).toBe(false);
    expect(repairable({ claims: [{ claim: "x" }], flags: ["thin_content"], scaled: {} })).toBe(false);
  });

  it("does nothing when there is nothing flagged", () => {
    expect(repairable({ claims: [], flags: [], scaled: {} })).toBe(false);
    expect(repairable(null)).toBe(false);
  });

  it("tells the owner plainly what it changed", () => {
    expect(repairNote([{ from: "a", to: "b" }])).toMatch(/rewrote 1 sentence/);
    expect(repairNote([{}, {}])).toMatch(/rewrote 2 sentences/);
    expect(repairNote([])).toBe("");
  });
});

describe("a near-duplicate never becomes the owner's problem", () => {
  const route = read("app/api/actions/[id]/execute/route.js");
  const page = read("app/approvals/page.js");
  const worklog = read("app/api/worklog/route.js");

  it("repairs before it blocks", () => {
    expect(route.indexOf("repairClaims(guardText")).toBeLessThan(route.indexOf('if (guard.decision === "block") {\n    // Still refused'));
    expect(route).toMatch(/const after = await guardContent\(/);
  });

  it("drops the duplicate instead of queueing a rewriting job", () => {
    expect(route).toMatch(/status: "dismissed"/);
    expect(route).toMatch(/discarded: "near_duplicate"/);
    expect(route).toMatch(/Nothing for you to do/);
  });

  it("keeps the original words so the owner can see what changed under their name", () => {
    expect(route).toMatch(/repairedClaims: fix\.fixed, originalBody: repaired\.before/);
  });

  it("takes the card out of the queue rather than leaving it to be re-approved", () => {
    expect(page).toMatch(/r\?\.discarded/);
    expect(page).toMatch(/removeById\(item\.id\)/);
  });

  it("shows the discard, because deleting work quietly is the one thing forbidden here", () => {
    expect(worklog).toMatch(/"content\.discarded"/);
    expect(worklog).toMatch(/kind: "discarded"/);
  });
});
