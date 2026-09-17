import { describe, it, expect, vi } from "vitest";
import { normalizeBrief, mergeBrief, coverage, nextTopic, flattenBrief, briefText, briefBlock } from "@/lib/business-brief";

vi.mock("@/lib/ai-router", () => {
  class AllProvidersFailedError extends Error {}
  return { callAI: vi.fn(), AllProvidersFailedError };
});
const router = await import("@/lib/ai-router");
const { interviewTurn, respond, InterviewUnavailable } = await import("@/lib/interview");

// The shape of what the ARQR owner actually told Genie, after extraction.
const ARQR = {
  offer: "Turns a retailer's products into a branded AR catalogue customers open from a QR code or link, no app.",
  pricing: "Starter 10 products $249 setup + $29/month; Studio 25 products $549 + $59/month; Showroom 50 products $999 + $99/month",
  segments: ["Furniture retailers", "Home decor retailers", "Rug and carpet retailers", "Restaurants and cafes"],
  idealSignals: ["Medium-to-high-ticket products", "Online catalogue on Shopify or WooCommerce", "No existing AR"],
  disqualifiers: ["Very low-cost products", "No meaningful digital presence"],
  decisionMakers: ["Owner", "Founder", "Head of Ecommerce"],
  problems: ["Buyers cannot picture size and fit before buying"],
  objections: [{ objection: "Will customers actually use it?", answer: "Start with a 10-product pilot and measure it." }],
  proof: "No verified client numbers yet. Never claim percentages.",
  neverSay: ["Invented ROI or conversion percentages", "Technical AR jargon"],
  cta: "Book a call, demo or small pilot",
};

describe("business brief", () => {
  it("keeps the owner's exact prices", () => {
    expect(normalizeBrief(ARQR).pricing).toContain("$249 setup + $29/month");
  });

  it("adds to lists across messages instead of wiping them", () => {
    const first = normalizeBrief({ segments: ["Furniture retailers"] });
    const { brief, changed } = mergeBrief(first, { segments: ["Restaurants and cafes", "furniture retailers"] });
    expect(brief.segments).toEqual(["Furniture retailers", "Restaurants and cafes"]);
    expect(changed).toEqual(["segments"]);
  });

  it("replaces a list only when the owner replaces it", () => {
    const { brief } = mergeBrief({ segments: ["Furniture retailers"] }, { segments: ["Restaurants"] }, ["segments"]);
    expect(brief.segments).toEqual(["Restaurants"]);
  });

  it("reports no change when a message repeats what is known", () => {
    const { changed } = mergeBrief(ARQR, { segments: ["Furniture retailers"], pricing: ARQR.pricing });
    expect(changed).toEqual([]);
  });

  it("never asks about decision-makers once they are known", () => {
    const t = nextTopic(ARQR, {});
    expect(t?.key).not.toBe("decisionMakers");
    expect(coverage(ARQR, {}).ready).toBe(true);
  });

  it("asks for the essentials first", () => {
    expect(nextTopic({ pricing: "x" }, {}).key).toBe("offer");
  });

  it("does not ask for what the scan already found", () => {
    const t = nextTopic({}, { whatTheySell: "AR catalogues" });
    expect(t.key).not.toBe("offer");
  });

  it("feeds older readers the owner's answer, not the homepage guess", () => {
    const flat = flattenBrief({ targetCustomer: "online retailers", avoid: "" }, ARQR);
    expect(flat.targetCustomer).toContain("Restaurants and cafes");
    expect(flat.avoid).toContain("Invented ROI");
    expect(flat.brief.pricing).toBeTruthy();
  });

  it("gives every prompt the strategy, including objections and who not to target", () => {
    const t = briefText({ brief: ARQR });
    expect(t).toContain("Who not to target: Very low-cost products");
    expect(t).toContain("Will customers actually use it?");
    expect(briefBlock({})).toBe("");
  });
});

describe("interview turn", () => {
  it("absorbs a long pasted strategy in one go and asks about something still missing", async () => {
    router.callAI.mockResolvedValueOnce({ json: { patch: ARQR, learned: "You start people on a $249 Starter pilot.", asks: { channels: "Where do your best retailers hang out?" } } });
    const long = "ARQR360 is a B2B SaaS. ".repeat(900); // ~20k chars, longer than the old path survived
    const out = await interviewTurn({ ai: {}, message: long });
    expect(out.ok).toBe(true);
    expect(out.ai.brief.segments).toContain("Restaurants and cafes");
    expect(out.reply).toContain("$249");
    expect(out.reply).not.toMatch(/decision/i);
    const sent = router.callAI.mock.calls.at(-1)[0];
    expect(sent.maxTokens).toBeGreaterThanOrEqual(4000);
    expect(sent.prompt.length).toBeLessThan(26000); // capped, no history re-sent
  });

  it("treats 'skip' as moving on, with no model call", async () => {
    router.callAI.mockClear();
    const out = await interviewTurn({ ai: {}, message: "skip", lastTopic: "offer" });
    expect(router.callAI).not.toHaveBeenCalled();
    expect(out.skipped).toContain("offer");
    expect(out.topic).not.toBe("offer");
  });

  it("signals a retry, not a lost message, when every model is down", async () => {
    router.callAI.mockRejectedValueOnce(new router.AllProvidersFailedError("down"));
    await expect(interviewTurn({ ai: {}, message: "we sell rugs" })).rejects.toBeInstanceOf(InterviewUnavailable);
  });

  it("says it is ready once the essentials are covered", () => {
    const out = respond({ ai: { brief: ARQR }, done: true });
    expect(out.resolved).toBe(true);
    expect(out.reply).toMatch(/build your plan/i);
  });
});
