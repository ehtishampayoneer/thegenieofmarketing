// test/buyer-hunt.test.js
// Reported by the owner, 27 Sep: Buyer Hunt offered nine-year-old Reddit threads
// and "buyers" who were developers selling their own thing; Reddit and Quora links
// opened the page rather than the question; Reddit replies were being removed
// because the account was new.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sellerPost, ageFromText, redditIdAge, gateOpportunity, REDDIT_ARCHIVE_DAYS, BUYER_MAX_AGE_DAYS } from "@/lib/opportunity-gate";
import { pinpoint } from "@/lib/pinpoint";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const NOW = Date.parse("2026-09-27T12:00:00Z");

describe("a seller is not a buyer", () => {
  const cases = [
    [false, "Any recommendations for AR apps to show furniture in customers' homes?"],
    [false, "Our store needs a way to show rugs in 3D — what do you use?"],
    [false, "Looking for an AR catalogue solution for our furniture shop"],
    [true, "I built an AR catalogue tool for furniture stores"],
    [true, "Launching our AR platform for home decor retailers"],
    [true, "[For Hire] 3D modeller for furniture and AR"],
    [true, "Roast my furniture AR startup landing page"],
    [true, "We are building an AR visualizer for rug sellers"],
    // Selling words AND a real question is left for the judge to read.
    [false, "We built our own AR viewer and it flopped. What do you use instead?"],
  ];
  for (const [seller, title] of cases) {
    it(`${seller ? "drops" : "keeps"}: ${title.slice(0, 55)}`, () => {
      expect(sellerPost(title).seller).toBe(seller);
    });
  }
});

describe("how old a post is", () => {
  it("reads the dates search results show", () => {
    expect(ageFromText("posted 3 days ago", NOW)).toBe(3);
    expect(ageFromText("2 yr. ago · r/furniture", NOW)).toBe(730);
    expect(ageFromText("Answered 5y", NOW)).toBe(1825);
    expect(Math.round(ageFromText("Updated Mar 12, 2019", NOW))).toBeGreaterThan(2700);
    expect(ageFromText("no date here", NOW)).toBe(null);
  });

  // These were read from Reddit's own feeds on 27 Sep 2026 and were NOT among the
  // anchors the model is built from, so they test it rather than restate it.
  it("dates a Reddit post from its id to within days", () => {
    const held = [["1rx58jw", "2026-03-18"], ["1t8ubx8", "2026-05-10"], ["p5fphi", "2021-08-16"]];
    for (const [id, real] of held) {
      const actual = (NOW - Date.parse(`${real}T12:00:00Z`)) / 864e5;
      expect(Math.abs(redditIdAge(id, NOW) - actual), id).toBeLessThan(6);
    }
  });

  it("knows a nine-year-old thread is far past Reddit's archive line", () => {
    expect(redditIdAge("6xk2a1", NOW)).toBeGreaterThan(REDDIT_ARCHIVE_DAYS * 5);
  });
});

describe("the gate every radar asks", () => {
  it("refuses a thread Reddit has already archived", () => {
    const g = gateOpportunity({ platform: "reddit", title: "Best AR furniture app?", url: "https://reddit.com/r/furniture/comments/6xk2a1/x" }, { maxAgeDays: REDDIT_ARCHIVE_DAYS, now: NOW });
    expect(g.ok).toBe(false);
  });

  it("keeps a fresh question", () => {
    expect(gateOpportunity({ platform: "reddit", title: "Best AR furniture app?", ageDays: 12 }, { now: NOW }).ok).toBe(true);
  });

  it("a buyer from months ago has bought or given up", () => {
    expect(gateOpportunity({ title: "Which AR app?", ageDays: BUYER_MAX_AGE_DAYS + 1 }, { now: NOW }).ok).toBe(false);
  });

  it("a Quora question with no date is dropped from Buyer Hunt but kept for answers", () => {
    const q = { platform: "quora", title: "What is the best AR app for furniture?" };
    expect(gateOpportunity(q, { unknownAge: "drop", now: NOW }).ok).toBe(false);
    expect(gateOpportunity(q, { unknownAge: "keep", now: NOW }).ok).toBe(true);
  });
});

describe("every radar asks it", () => {
  it("Buyer Hunt drops old posts and sellers, and says so", () => {
    const r = read("app/api/radar/intent/route.js");
    expect(r).toMatch(/gateOpportunity\(c, \{ maxAgeDays: BUYER_MAX_AGE_DAYS/);
    expect(r).toMatch(/funnel\.lowIntent = funnel\.pages - funnel\.tooOld - funnel\.sellers - candidates\.length/);
    expect(read("lib/intent.js")).toMatch(/none were a live buyer/);
  });

  it("Reddit, Quora and web all apply it", () => {
    expect(read("app/api/radar/reddit/route.js")).toMatch(/gateOpportunity\(\{ \.\.\.c, platform: "reddit" \}, \{ maxAgeDays: REDDIT_ARCHIVE_DAYS \}\)/);
    expect(read("app/api/radar/quora/route.js")).toMatch(/gateOpportunity\(\{ \.\.\.c, platform: "quora" \}, \{ maxAgeDays: 365, unknownAge: "keep" \}\)/);
    expect(read("app/api/radar/web/route.js")).toMatch(/gateOpportunity\(c, \{ maxAgeDays: 365, unknownAge: "keep" \}\)/);
  });

  it("the Reddit feed's own dates are read, and whole communities are not posts", () => {
    const s = read("lib/search.js");
    expect(s).toMatch(/<published>/);
    expect(s).toMatch(/out\.push\(\{ title, url: link, snippet: content\.slice\(0, 220\), subreddit: sub, threadId: tid, comments: 0, score: 0, createdUtc \}\)/);
    expect(s).toMatch(/reddit\\\.com\\\/r\\\/\[A-Za-z0-9_\]\+\\\/comments\\\//);
  });
});

describe("links open on the words that matter", () => {
  it("lands on the buyer's own sentence", () => {
    const u = pinpoint("https://www.reddit.com/r/x/comments/1wrljb3/y/", "We sell sofas online and returns are killing us — anyone solved this?");
    expect(u).toMatch(/#:~:text=We%20sell%20sofas%20online/);
  });

  it("skips snippet metadata to the first real sentence", () => {
    expect(pinpoint("https://www.quora.com/q", "", "...Answered 3y. The best AR app for furniture retailers is one")).toMatch(/text=The%20best%20AR%20app/);
  });

  it("escapes the characters a text fragment treats as syntax", () => {
    expect(pinpoint("https://x.com/a", "A three-part plan, step by step here")).not.toMatch(/text=[^&]*-/);
  });

  it("changes nothing when there are no words to land on", () => {
    expect(pinpoint("https://example.com/thread", "", "")).toBe("https://example.com/thread");
  });

  it("the approvals queue uses it for every radar find", () => {
    expect(read("app/api/approvals/route.js")).toMatch(/target_url: pinpoint\(p\.target_url, meta\.evidence, meta\.snippet\)/);
  });
});

describe("Reddit replies are built to survive new-account filters", () => {
  const r = read("app/api/radar/reddit/route.js");
  const stripLinks = new Function(r.slice(r.indexOf("function stripLinks(text) {")) + "; return stripLinks;")();

  it("always a reply to an existing thread, never a new post", () => {
    expect(r).toMatch(/kind: "reply",/);
    expect(r).not.toMatch(/it\.kind === "new_post" \? "new_post"/);
  });

  it("takes links out and keeps the sentence readable", () => {
    expect(stripLinks("We tried a few, [ARQR](https://arqr360.com) worked for us.")).toBe("We tried a few, ARQR worked for us.");
    expect(stripLinks("Have a look at https://arqr360.com/demo for an example.")).toBe("Have a look at arqr360.com for an example.");
    expect(stripLinks("It is 3.5 metres wide, e.g. a big sofa.")).toBe("It is 3.5 metres wide, e.g. a big sofa.");
  });

  it("every Reddit card says how to become an account the filters trust", () => {
    const a = read("app/api/approvals/route.js");
    expect(a).toMatch(/const REDDIT_NOTE = "Reddit hides replies from new accounts automatically/);
    // How to be trusted, never how to get around it.
    expect(a).not.toMatch(/buy (an )?(aged )?account|multiple accounts to/i);
  });
});
