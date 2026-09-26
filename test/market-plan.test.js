import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeMarkets, tierOf, marketOf, marketNote, MAX_ACTIVE, TIERS } from "@/lib/market-plan";

const campaign = readFileSync(join(process.cwd(), "app/api/outreach/campaign/route.js"), "utf8");
const M = [
  { name: "United Arab Emirates", code: "ae", score: 78 },
  { name: "Pakistan", code: "pk", score: 71, verified: true },
  { name: "United Kingdom", code: "uk", score: 52 },
  { name: "United States", code: "us", score: 31 },
];

// ── THE RANKING THAT WAS READ BY ONE LINE ──
// Market Testing works out which countries are winnable, from real Search Console
// numbers where they exist. That ranking reached exactly one place: a sentence
// pasted into a prompt. Keyword volumes were pulled for the United States whoever
// the owner sold to, and the nightly send took whoever surfaced from the pool with
// no idea it had a view on which country was easiest to win.
describe("which countries are live, and how hard each is", () => {
  it("sorts into the three an owner can act on", () => {
    expect(TIERS.map((t) => t.id)).toEqual(["green", "amber", "red"]);
    expect(tierOf(78).id).toBe("green");
    expect(tierOf(52).id).toBe("amber");
    expect(tierOf(31).id).toBe("red");
    // Unknown is not a no — the same rule the platform and rival checks keep.
    expect(tierOf(undefined).id).toBe("amber");
    expect(tierOf(null).id).toBe("amber");
  });

  it("works a few at once, not all of them", () => {
    // More than three and none gets enough volume to tell whether it is working.
    expect(MAX_ACTIVE).toBe(3);
    expect(activeMarkets(M, 10)).toHaveLength(3);
    expect(activeMarkets(M, 10).map((m) => m.name)).not.toContain("United States");
  });
});

describe("the allowance belongs to the mailbox, not the market", () => {
  it("never sends more because there are more countries", () => {
    // Five a day in week one is what protects the owner's own Gmail. Fifteen
    // because there are three countries would damage delivery to all three.
    for (const cap of [5, 10, 20, 35]) {
      const total = activeMarkets(M, cap).reduce((n, m) => n + m.emailsToday, 0);
      expect(total, `cap ${cap}`).toBe(cap);
    }
  });

  it("gives the easiest market the biggest share, not the whole day", () => {
    // A green market that turns out to be wrong would otherwise eat every send
    // before anyone noticed.
    const a = activeMarkets(M, 20);
    expect(a[0].emailsToday).toBeGreaterThan(a[2].emailsToday);
    expect(a[0].emailsToday).toBeLessThan(20);
    expect(a[2].emailsToday).toBeGreaterThan(0);
  });

  it("loses nothing to rounding on a small allowance", () => {
    expect(activeMarkets(M, 5).reduce((n, m) => n + m.emailsToday, 0)).toBe(5);
    expect(activeMarkets(M, 1).reduce((n, m) => n + m.emailsToday, 0)).toBe(1);
  });

  it("says nothing rather than inventing a market", () => {
    expect(activeMarkets([], 10)).toEqual([]);
    expect(activeMarkets(null, 10)).toEqual([]);
    expect(activeMarkets(["United Kingdom"], 5)[0].name).toBe("United Kingdom");
  });
});

describe("which market a company belongs to", () => {
  const live = activeMarkets(M, 10);
  it("reads it from the address when the address says", () => {
    expect(marketOf({ domain: "moebel.ae" }, live)).toBe("United Arab Emirates");
    expect(marketOf({ country: "Pakistan" }, live)).toBe("Pakistan");
  });

  it("says nothing for a .com, rather than guessing", () => {
    // Guessing would put an American company in the UAE's share and quietly spend
    // the easiest market's allowance on the hardest one.
    expect(marketOf({ domain: "sofas.com" }, live)).toBe(null);
    expect(marketOf({}, live)).toBe(null);
    expect(marketOf(null, live)).toBe(null);
  });

  it("tells the owner how sure it is", () => {
    expect(marketNote(live.find((m) => m.verified))).toMatch(/from your own Search Console/);
    expect(marketNote(live.find((m) => !m.verified))).toMatch(/estimated, until Search Console/);
    expect(marketNote(null)).toBe("");
  });
});

describe("it changes who gets written to tonight", () => {
  it("the send reads the plan's markets rather than one line in a prompt", () => {
    expect(campaign).toMatch(/strategyMarkets = raw \? \(normalizeStrategy\(raw\)\.markets \|\| \[\]\) : \[\]/);
    expect(campaign).toMatch(/markets = activeMarkets\(strategyMarkets, roomLeft\)/);
  });

  it("fills each market's share in turn, best first", () => {
    expect(campaign).toMatch(/if \(m && \(left\.get\(m\) \|\| 0\) > 0\)/);
    expect(campaign).toMatch(/ordered = \[\.\.\.picked, \.\.\.spare\]\.slice\(0, roomLeft\)/);
  });

  it("never drops a contact whose country cannot be told", () => {
    // They fill whatever the named markets did not use, exactly as before.
    expect(campaign).toMatch(/else spare\.push\(c\)/);
  });

  it("carries the market onto the draft, so the queue can group by it", () => {
    expect(campaign).toMatch(/market: c\.market \|\| null,/);
    expect(campaign).toMatch(/market: market \|\| null,/);
  });

  it("cannot break the send when the plan has no markets", () => {
    expect(campaign).toMatch(/if \(markets\.length > 1\)/);
  });
});
