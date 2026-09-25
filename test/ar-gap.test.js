import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectRivalTech, rivalAngle, byRivalOpportunity, rivalCategory, categoryThing } from "@/lib/platform-detect";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");
const prospects = read("lib/prospects.js");

// ── WHY THIS EXISTS ──
// "Furniture retailer on Shopify" is a list of thousands. "Furniture retailer on
// Shopify whose customers still cannot see the sofa in their own room" is a list
// where the pitch has no rival. The difference is one fact, and it is already in
// HTML that has been fetched anyway to find a published contact address.
//
// It also stops the worst email this product could send: explaining why AR matters
// to a company that has been paying a vendor for it since 2023.
describe("what a shop already has", () => {
  it("names the vendor when there is one", () => {
    for (const [html, id] of [
      ['<script src="https://cdn.threekit.com/player.js">', "threekit"],
      ['<div class="cylindo-viewer">', "cylindo"],
      ['<script src="https://levar.io/embed.js">', "levar"],
      ['<iframe src="https://my.matterport.com/show/?m=x">', "matterport"],
      ['<div data-shopify-xr data-shopify-model3d-id="1">', "shopify-ar"],
    ]) {
      const got = detectRivalTech(html, "ar3d");
      expect(got?.id, html).toBe(id);
      expect(got.vendor, `${id} is a product they bought`).toBe(true);
    }
  });

  it("tells a bought product apart from one they built", () => {
    // These are different emails. A team that dropped in the web standard has a
    // champion inside and no vendor invoice; that is a different conversation.
    for (const html of ['<model-viewer src="a.glb" ar>', '<a rel="ar" href="/s.usdz">']) {
      expect(detectRivalTech(html, "ar3d").vendor, html).toBe(false);
    }
  });

  it("keeps 'could not read it' apart from 'they have none'", () => {
    // A redirect stub or a cookie wall is not a shop without AR, and the two must
    // never produce the same email.
    const thin = rivalAngle(null, null, { readable: false, category: "ar3d" });
    expect(thin.state).toBe("unknown");
    expect(thin.note).toMatch(/could not read enough/);
    expect(thin.note).toMatch(/never claim they are missing something/);
    // And it is not buried: an unread page is still a live prospect.
    expect(thin.priority).toBe(rivalAngle(null, null, { category: "ar3d" }).priority);
  });

  it("says nothing rather than guessing", () => {
    expect(detectRivalTech("<p>Handmade sofas delivered in four days.</p>", "ar3d")).toBe(null);
    expect(detectRivalTech("", "ar3d")).toBe(null);
    expect(detectRivalTech(null, "ar3d")).toBe(null);
  });
});

describe("three findings, three different emails", () => {
  it("an open gap leads with the problem, not the technology", () => {
    const a = rivalAngle(null, { label: "Shopify" }, { category: "ar3d" });
    expect(a.state).toBe("open");
    expect(a.priority).toBe(2);
    expect(a.note).toMatch(/lead with the problem/);
    expect(a.note).toMatch(/not with your technology/);
  });

  it("a rival's product forbids the category pitch outright", () => {
    // The single worst email this product could send.
    const a = rivalAngle(detectRivalTech('<script src="https://cdn.threekit.com/p.js">', "ar3d"), { label: "Shopify" }, { category: "ar3d" });
    expect(a.state).toBe("taken");
    expect(a.priority).toBe(0);
    expect(a.note).toMatch(/Do NOT explain why this matters/);
    expect(a.note).toMatch(/if nothing is, do not send one/);
  });

  it("a home build is treated as a champion, not a competitor", () => {
    const a = rivalAngle(detectRivalTech('<model-viewer src="a.glb">', "ar3d"), null, { category: "ar3d" });
    expect(a.state).toBe("built");
    expect(a.priority).toBe(1);
    expect(a.note).toMatch(/championed this/);
  });

  it("names the platform only when one was found", () => {
    expect(rivalAngle(null, { label: "Shopify" }, { category: "ar3d" }).note).toMatch(/on Shopify/);
    expect(rivalAngle(null, null).note).not.toMatch(/ on null/);
  });
});

describe("the open gap goes first, and nobody is thrown away", () => {
  const rows = [
    { n: "has-threekit", ar: rivalAngle({ id: "threekit", label: "Threekit", vendor: true }) },
    { n: "open", ar: rivalAngle(null) },
    { n: "built-own", ar: rivalAngle({ id: "model-viewer", label: "a viewer", vendor: false }) },
  ];

  it("ranks open, then home-built, then a rival's customer", () => {
    expect(byRivalOpportunity(rows).map((r) => r.n)).toEqual(["open", "built-own", "has-threekit"]);
  });

  it("keeps everyone, because a rival's customer has a proven budget", () => {
    // Dropping them would bin the whole displacement list, which is where the
    // biggest budgets already are.
    expect(byRivalOpportunity(rows)).toHaveLength(rows.length);
    expect(prospects).toMatch(/Nobody is dropped for already having a rival/);
  });

  it("does not throw on a prospect that was never checked", () => {
    expect(byRivalOpportunity([{ n: "x" }])).toHaveLength(1);
    expect(byRivalOpportunity([])).toEqual([]);
  });
});

describe("the finding reaches the email, not just the ordering", () => {
  it("is read from the page already being fetched, with no extra request", () => {
    expect(prospects).toMatch(/const ar = detectRivalTech\(home, rivalCat\)/);
    expect(prospects).toMatch(/no extra request/);
  });

  it("travels into the pitch prompt", () => {
    expect(prospects).toMatch(/angle: it\.ar\?\.note \|\| null/);
    expect(prospects).toMatch(/"angle" is what was found on their site/);
  });

  it("forbids the model from inventing what they do or do not have", () => {
    expect(prospects).toMatch(/never claim they lack something it does not say they lack/);
  });

  it("re-ranks before the list is cut, or the ordering would do nothing", () => {
    expect(prospects.indexOf("byRivalOpportunity(usable)")).toBeLessThan(prospects.indexOf(".slice(0, limit)"));
  });
});

// ── GENIE IS NOT ONE CUSTOMER'S TOOL ──
// The first version of this hard-coded one industry's rivals and called it a Genie
// feature. It was not: "does this shop have AR" means nothing to somebody selling
// booking software. What generalises is the QUESTION — does this prospect already
// pay someone for the thing I do? — so the category is read from the owner's own
// plan, exactly as the platform requirement already is.
describe("it works for whatever the owner sells, not one industry", () => {
  it("covers more than one category", () => {
    const lib = read("lib/platform-detect.js");
    for (const c of ["ar3d", "livechat", "reviews", "booking", "email", "analytics"]) {
      expect(lib.includes(`  ${c}: [`), c).toBe(true);
    }
  });

  it("picks the category from what the owner sells", () => {
    expect(rivalCategory({ ai: { whatTheySell: "AR product views for furniture shops" } })).toBe("ar3d");
    expect(rivalCategory({ ai: { whatTheySell: "live chat for online stores" } })).toBe("livechat");
    expect(rivalCategory({ ai: { whatTheySell: "appointment booking for clinics" } })).toBe("booking");
    expect(rivalCategory({ ai: {}, strategy: { offer: "We collect customer reviews, $29/mo" } })).toBe("reviews");
  });

  it("detects nothing for a business that matches no category", () => {
    // Most businesses. Nothing detected means nothing filtered and nothing claimed,
    // the same way an unknown platform behaves.
    expect(rivalCategory({ ai: { whatTheySell: "handmade leather bags" } })).toBe(null);
    expect(rivalCategory({})).toBe(null);
    expect(rivalCategory()).toBe(null);
    expect(detectRivalTech('<script src="https://cdn.threekit.com/p.js">', null)).toBe(null);
  });

  it("finds each category's own rivals, not another category's", () => {
    expect(detectRivalTech('<script src="https://widget.intercom.io/x.js">', "livechat")?.id).toBe("intercom");
    expect(detectRivalTech('<script src="https://static.klaviyo.com/x.js">', "email")?.id).toBe("klaviyo");
    expect(detectRivalTech('<script src="https://assets.calendly.com/x.js">', "booking")?.id).toBe("calendly");
    // And does not cross the streams.
    expect(detectRivalTech('<script src="https://widget.intercom.io/x.js">', "ar3d")).toBe(null);
  });

  it("writes the note in the owner's own terms, never in one industry's", () => {
    const chat = rivalAngle(null, null, { category: "livechat" });
    expect(chat.note).toMatch(/talk to a person on the site/);
    expect(chat.note).not.toMatch(/\bAR\b|3D|room/);
    expect(categoryThing("booking")).toMatch(/book an appointment/);
    expect(categoryThing(null)).toBe("the thing you sell");
  });

  it("is read from the plan at the point of discovery", () => {
    const route = read("app/api/prospects/discover/route.js");
    expect(route).toMatch(/rivalCat = rivalCategory\(\{ ai: scanAi, strategy \}\)/);
    expect(route).toMatch(/discoverProspects\(\{[^}]*rivalCat \}\)/);
  });
});
