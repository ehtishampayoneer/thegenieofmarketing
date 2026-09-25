import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectArTech, arAngle, byArOpportunity } from "@/lib/platform-detect";

const prospects = readFileSync(join(process.cwd(), "lib/prospects.js"), "utf8");

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
      const got = detectArTech(html);
      expect(got?.id, html).toBe(id);
      expect(got.vendor, `${id} is a product they bought`).toBe(true);
    }
  });

  it("tells a bought product apart from one they built", () => {
    // These are different emails. A team that dropped in the web standard has a
    // champion inside and no vendor invoice; that is a different conversation.
    for (const html of ['<model-viewer src="a.glb" ar>', '<a rel="ar" href="/s.usdz">']) {
      expect(detectArTech(html).vendor, html).toBe(false);
    }
  });

  it("keeps 'could not read it' apart from 'they have none'", () => {
    // A redirect stub or a cookie wall is not a shop without AR, and the two must
    // never produce the same email.
    const thin = arAngle(null, null, { readable: false });
    expect(thin.state).toBe("unknown");
    expect(thin.note).toMatch(/could not read enough/);
    expect(thin.note).toMatch(/never claim they are missing something/);
    // And it is not buried: an unread page is still a live prospect.
    expect(thin.priority).toBe(arAngle(null, null).priority);
  });

  it("says nothing rather than guessing", () => {
    expect(detectArTech("<p>Handmade sofas delivered in four days.</p>")).toBe(null);
    expect(detectArTech("")).toBe(null);
    expect(detectArTech(null)).toBe(null);
  });
});

describe("three findings, three different emails", () => {
  it("an open gap leads with the problem, not the technology", () => {
    const a = arAngle(null, { label: "Shopify" });
    expect(a.state).toBe("open");
    expect(a.priority).toBe(2);
    expect(a.note).toMatch(/lead with the problem/);
    expect(a.note).toMatch(/not with the technology/);
  });

  it("a rival's product forbids the category pitch outright", () => {
    // The single worst email this product could send.
    const a = arAngle(detectArTech('<script src="https://cdn.threekit.com/p.js">'), { label: "Shopify" });
    expect(a.state).toBe("taken");
    expect(a.priority).toBe(0);
    expect(a.note).toMatch(/Do not explain why AR helps/);
    expect(a.note).toMatch(/if nothing is, do not send one/);
  });

  it("a home build is treated as a champion, not a competitor", () => {
    const a = arAngle(detectArTech('<model-viewer src="a.glb">'), null);
    expect(a.state).toBe("built");
    expect(a.priority).toBe(1);
    expect(a.note).toMatch(/championed this/);
  });

  it("names the platform only when one was found", () => {
    expect(arAngle(null, { label: "Shopify" }).note).toMatch(/on Shopify/);
    expect(arAngle(null, null).note).not.toMatch(/ on null/);
  });
});

describe("the open gap goes first, and nobody is thrown away", () => {
  const rows = [
    { n: "has-threekit", ar: arAngle({ id: "threekit", label: "Threekit", vendor: true }) },
    { n: "open", ar: arAngle(null) },
    { n: "built-own", ar: arAngle({ id: "model-viewer", label: "a viewer", vendor: false }) },
  ];

  it("ranks open, then home-built, then a rival's customer", () => {
    expect(byArOpportunity(rows).map((r) => r.n)).toEqual(["open", "built-own", "has-threekit"]);
  });

  it("keeps everyone, because a rival's customer has a proven budget", () => {
    // Dropping them would bin the whole displacement list, which is where the
    // biggest budgets already are.
    expect(byArOpportunity(rows)).toHaveLength(rows.length);
    expect(prospects).toMatch(/Nobody is dropped for already having a rival/);
  });

  it("does not throw on a prospect that was never checked", () => {
    expect(byArOpportunity([{ n: "x" }])).toHaveLength(1);
    expect(byArOpportunity([])).toEqual([]);
  });
});

describe("the finding reaches the email, not just the ordering", () => {
  it("is read from the page already being fetched, with no extra request", () => {
    expect(prospects).toMatch(/const ar = detectArTech\(home\)/);
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
    expect(prospects.indexOf("byArOpportunity(usable)")).toBeLessThan(prospects.indexOf(".slice(0, limit)"));
  });
});
