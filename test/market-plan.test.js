import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeMarkets, tierOf, tierFor, marketOf, marketNote, nextMarket, MAX_ACTIVE, TIERS } from "@/lib/market-plan";

const campaign = readFileSync(join(process.cwd(), "app/api/outreach/campaign/route.js"), "utf8");
const content = readFileSync(join(process.cwd(), "app/api/content/route.js"), "utf8");
const approvals = readFileSync(join(process.cwd(), "app/api/approvals/route.js"), "utf8");
const queue = readFileSync(join(process.cwd(), "app/approvals/page.js"), "utf8");
// The shape lib/strategy-store.js actually writes onto the plan. It used to say
// `code`, which no part of the app ever sends, so a passing test proved nothing
// about the only caller there is.
const M = [
  { name: "United Arab Emirates", iso2: "AE", score: 78, difficulty: "Easy" },
  { name: "Pakistan", iso2: "PK", score: 71, difficulty: "Easy", verified: true },
  { name: "United Kingdom", iso2: "GB", score: 52, difficulty: "Medium" },
  { name: "United States", iso2: "US", score: 31, difficulty: "Hard" },
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
    expect(marketOf({ domain: "sofas.pk" }, live)).toBe("Pakistan");
    expect(marketOf({ domain: "chairs.co.uk" }, live)).toBe("United Kingdom");
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
    expect(campaign).toMatch(/strategyMarkets = plan \? \(plan\.marketData\?\.length \? plan\.marketData : plan\.markets \|\| \[\]\) : \[\]/);
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

// ── WHICH COUNTRY TONIGHT'S ARTICLE IS FOR ──
// Every article was written for nowhere in particular, priced in dollars whoever
// the reader was, while the plan sat there knowing the owner sells into the UAE.
describe("which country gets written for", () => {
  const live = activeMarkets(M, 12);

  it("starts with the most winnable market", () => {
    expect(nextMarket(live, {}).name).toBe("United Arab Emirates");
  });

  it("moves on once a market has had its share", () => {
    const first = nextMarket(live, {});
    const second = nextMarket(live, { [first.name]: 1 });
    expect(second.name).not.toBe(first.name);
  });

  it("gives each market its share over a run, not one country everything", () => {
    const counts = {};
    for (let i = 0; i < 12; i++) {
      const m = nextMarket(live, counts);
      counts[m.name] = (counts[m.name] || 0) + 1;
    }
    // Three live markets, all three written for, and the easiest one leading.
    expect(Object.keys(counts).length).toBe(live.length);
    const top = live[0].name;
    expect(counts[top]).toBeGreaterThan(counts[live[live.length - 1].name]);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(12);
    // Nothing is starved: a market with a share gets written for at least once.
    for (const m of live) expect(counts[m.name]).toBeGreaterThan(0);
  });

  it("is a rotation, not a rewrite — no market when there are none", () => {
    expect(nextMarket([], {})).toBe(null);
    expect(nextMarket(null, {})).toBe(null);
    expect(nextMarket(live, null)).toBeTruthy();
  });

  it("survives a count column that came back as junk", () => {
    expect(nextMarket(live, { "United Arab Emirates": null, Pakistan: "x" }).name).toBeTruthy();
  });
});

describe("the writing engine acts on it", () => {
  it("picks tonight's market from the plan, weighted by how it already spent", () => {
    expect(content).toMatch(/articleMarket = nextMarket\(live, counts\)/);
    expect(content).toMatch(/select\("market:payload->>market"\)/);
  });

  it("tells the writer the country, the money and the spelling", () => {
    expect(content).toContain('import { writeForBlock } from "@/lib/geo-targets"');
    expect(content).toMatch(/\$\{targetBlock\}\$\{marketBlock\}/);
  });

  it("forbids the same article again with the currency swapped", () => {
    expect(content).toMatch(/not a copy of another country's with the currency swapped/);
  });

  it("stamps the market on the draft so the queue can group by it", () => {
    expect(content).toMatch(/data\.article\.market = articleMarket\.name/);
    expect(content).toMatch(/data\.article\.marketTier = articleMarket\.tier/);
  });
});

// ── THE THREE COLOURS HAVE TO MEAN THREE THINGS ──
// The plan stored six country NAMES and threw the scorer's verdict away, so every
// market came back as the middle tier and green, amber and red were one colour.
describe("how hard a country is", () => {
  it("takes Market Testing's own verdict when it has one", () => {
    expect(tierFor({ name: "Malaysia", difficulty: "Easy" }).id).toBe("green");
    expect(tierFor({ name: "India", difficulty: "Medium" }).id).toBe("amber");
    expect(tierFor({ name: "United States", difficulty: "Hard" }).id).toBe("red");
  });

  it("prefers the verdict over the opportunity score, which measures something else", () => {
    // A country can be a big opportunity AND hard to win. Saturation and reach are
    // what make it hard; the opportunity score is how much is in it.
    expect(tierFor({ score: 95, difficulty: "Hard" }).id).toBe("red");
  });

  it("falls back to the score when there is no verdict", () => {
    expect(tierFor({ score: 78 }).id).toBe("green");
    expect(tierFor({ score: 12 }).id).toBe("red");
  });

  it("a country the owner typed in by hand is unmeasured, not hard", () => {
    expect(tierFor({ name: "Spain" }).id).toBe("amber");
    expect(tierFor({}).id).toBe("amber");
    expect(tierFor(null).id).toBe("amber");
  });

  it("the plan carries the verdict, not only the name", () => {
    const store = readFileSync(join(process.cwd(), "lib/strategy-store.js"), "utf8");
    expect(store).toMatch(/difficulty: r\.difficulty \|\| null/);
    expect(store).toMatch(/marketData: markets/);
    const strategy = readFileSync(join(process.cwd(), "lib/strategy.js"), "utf8");
    expect(strategy).toMatch(/marketData: marketDetail\(s\)/);
    // Names stay authoritative so a country the owner typed in by hand wins, and
    // the detail is only ever the detail for a name that is in the list.
    expect(strategy).toMatch(/markets: marketNames\(s\)/);
  });
});

// ── THE DAY, GROUPED THE WAY THE PLAN WORKS ──
describe("the approvals queue groups by country", () => {
  it("tags every card with its country and how hard that country is", () => {
    expect(approvals).toMatch(/i\.marketTier = mk\.tier/);
    expect(approvals).toMatch(/const { tierFor } = await import\("@\/lib\/market-plan"\)/);
    expect(approvals).toMatch(/flag: g\.iso2 \? flagEmoji\(g\.iso2\)/);
  });

  it("keeps a live country on screen even with nothing waiting for it today", () => {
    expect(approvals).toMatch(/markets: planMarkets, tiers: TIERS\.map/);
    expect(queue).toMatch(/for \(const mk of feed\?\.markets \|\| \[\]\)/);
    expect(queue).toMatch(/muted=\{mk\.count === 0\}/);
  });

  it("matches a country however it was spelled, and keeps the flag the test put on it", () => {
    // A market test tags its tasks `market: "are"`; the plan says "United Arab
    // Emirates". Keyed on the string they are two countries, and the card lost the
    // flag and name the market test had already given it.
    expect(approvals).toMatch(/const byIso = new Map\(planMarkets\.filter\(\(m\) => m\.iso2\)/);
    expect(approvals).toMatch(/const iso = raw \? iso2Of\(raw\) : null/);
    expect(approvals).toMatch(/i\.marketName = i\.marketName \|\| g\?\.name/);
    expect(approvals).toMatch(/i\.marketTierLabel = "A country you are testing"/);
  });

  it("filters the day by colour, then by country", () => {
    expect(queue).toMatch(/matchesTier\(it, tierFilter\) && matchesMarket\(it, marketFilter\)/);
    expect(queue).toMatch(/setTierFilter\(id\); setMarketFilter\("all"\)/);
  });

  it("uses one colour per tier, from the app's own signal tokens", () => {
    expect(queue).toMatch(/green: \{ label: "Winnable now", dot: "var\(--signal-live\)"/);
    expect(queue).toMatch(/amber: \{ label: "Worth the work", dot: "var\(--signal-warn\)"/);
    expect(queue).toMatch(/red: \{ label: "Hard", dot: "var\(--signal-danger\)"/);
  });
});

// ── TWO DIFFERENT QUESTIONS, TWO DIFFERENT MEASURES ──
// Sending used to be split by SEO difficulty, which has nothing to do with
// whether a stranger in that country will reply. Once ability-to-pay was weighted
// in for B2B it produced the opposite of the intent: the United States ranked
// first on opportunity and got nine emails a day while India, ranked second, took
// eighteen for being easier to rank in.
describe("email where the buyers are, write where you can rank", () => {
  const P = [
    { name: "United States", iso2: "US", score: 71, difficulty: "Hard" },
    { name: "India", iso2: "IN", score: 68, difficulty: "Medium" },
    { name: "United Kingdom", iso2: "GB", score: 64, difficulty: "Hard" },
  ];

  it("sends most to the market worth most, whatever colour it is", () => {
    const live = activeMarkets(P, 35);
    const us = live.find((m) => m.iso2 === "US");
    const india = live.find((m) => m.iso2 === "IN");
    expect(us.tier).toBe("red");
    expect(india.tier).toBe("amber");
    expect(us.emailsToday).toBeGreaterThanOrEqual(india.emailsToday);
  });

  it("still never bets the whole day on one country", () => {
    const live = activeMarkets(P, 35);
    for (const m of live) expect(m.emailsToday).toBeLessThan(35 * 0.6);
    expect(live.reduce((n, m) => n + m.emailsToday, 0)).toBe(35);
  });

  it("writes mostly for the market it can actually rank in", () => {
    const live = activeMarkets(P, 35);
    const counts = {};
    for (let i = 0; i < 6; i++) { const m = nextMarket(live, counts); counts[m.name] = (counts[m.name] || 0) + 1; }
    expect(counts["India"]).toBeGreaterThan(counts["United States"] || 0);
  });

  it("shares evenly when nobody has measured a score", () => {
    const named = activeMarkets([{ name: "Spain" }, { name: "Italy" }], 10);
    expect(named.map((m) => m.emailsToday).sort()).toEqual([5, 5]);
  });
});

describe("a paid B2B seller is not sent to the markets least able to pay", () => {
  it("ranks by ability to pay, and leaves difficulty alone", async () => {
    const { scoreMarkets } = await import("@/lib/markets");
    const profile = { targetCustomer: "furniture retailers", whatTheySell: "AR catalogues" };
    const pick = (audience) => scoreMarkets({ entity: { dims: { audience, commerceModel: "saas" } }, profile })
      .rows.filter((r) => r.targetable).slice(0, 5).map((r) => r.iso2);

    const b2b = pick("b2b");
    const global = pick("global");
    // The countries that can pay a European price rise for a B2B seller...
    expect(b2b).toContain("US");
    expect(b2b).toContain("GB");
    // ...and the cheap-to-rank ones no longer take the top of the list.
    expect(b2b.slice(0, 3)).not.toContain("PH");
    expect(b2b.slice(0, 3)).not.toContain("KE");
    // A general-audience business is unchanged.
    expect(global).not.toEqual(b2b);

    // Difficulty is a fact about the country, not about who is selling.
    const d = (audience) => Object.fromEntries(
      scoreMarkets({ entity: { dims: { audience, commerceModel: "saas" } }, profile })
        .rows.map((r) => [r.iso2, r.difficulty]));
    expect(d("b2b")).toEqual(d("global"));
  });
});
