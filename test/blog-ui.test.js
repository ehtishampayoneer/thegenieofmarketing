// test/blog-ui.test.js
// The owner's blog is the page they send buyers to, and it was a column of blue
// links: no pictures, no sense of how much was there, nothing to read next. These
// are the checks on what replaced it — and on the two ways a prettier page could
// have made things worse: a rail that pads itself out with something that is not
// there, and a title that arrives as markup.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { thumb, leadCard, cardGrid, rail, related, indexBody, esc, attr } from "@/lib/blog-ui";
import { READING_CSS } from "@/app/p/reading";

const day = (n) => new Date(Date.UTC(2026, 8, n)).toISOString();
const P = (over = {}) => ({ slug: "a", title: "A title", meta_description: "A description.", published_at: day(20), hero_image: null, ...over });
const href = (p) => `/blog/${p.slug}`;

const PAGES = [
  P({ slug: "sofa-uae", title: "Buying a sofa online in the UAE", target_keyword: "buy sofa online uae", hero_image: "https://img/1.jpg", published_at: day(24) }),
  P({ slug: "rug-sizes", title: "Rug sizes without the guesswork", published_at: day(20) }),
  P({ slug: "sofa-returns", title: "What a sofa return costs you", target_keyword: "sofa returns", published_at: day(16) }),
  P({ slug: "paint-scale", title: "How big should a painting be", published_at: day(9) }),
];

describe("a card has a picture", () => {
  it("uses the hero image when there is one", () => {
    const h = thumb(P({ hero_image: "https://img/x.jpg", hero_alt: "A sofa" }));
    expect(h).toContain('src="https://img/x.jpg"');
    expect(h).toContain('alt="A sofa"');
    // Below the fold, and never blocking the page it is on.
    expect(h).toContain('loading="lazy"');
  });

  it("falls back to the title's initial, not to a broken image", () => {
    const h = thumb(P({ title: "rug sizes", hero_image: null }));
    expect(h).toContain("gp-thumb--none");
    expect(h).toContain(">R<");
    expect(h).not.toContain("<img");
  });

  it("never renders an empty img tag for a page with no title either", () => {
    expect(thumb({})).toContain(">?<");
    expect(thumb({})).not.toContain("<img");
  });
});

describe("the index", () => {
  const body = indexBody({ pages: PAGES, name: "ARQR360", topBar: "<p>bar</p>", hrefOf: href });

  it("leads with the newest article, big", () => {
    expect(body).toContain("gp-lead");
    expect(body.indexOf("Buying a sofa online in the UAE")).toBeLessThan(body.indexOf("Rug sizes without the guesswork"));
    expect(body).toContain('href="/blog/sofa-uae"');
  });

  it("shows the rest as cards with their own thumbnails", () => {
    expect(body).toContain("gp-cards");
    // Four articles: one lead, three cards.
    expect((body.match(/class="gp-card"/g) || []).length).toBe(3);
  });

  it("says how many there are, and counts every one of them", () => {
    expect(body).toContain("4 articles and counting");
    expect(indexBody({ pages: [PAGES[0]], name: "X", topBar: "", hrefOf: href })).toContain("1 article and counting");
  });

  it("has a rail on each side", () => {
    expect((body.match(/class="gp-rail"/g) || []).length).toBe(2);
    expect(body).toContain("Latest");
    expect(body).toContain("Start here");
  });

  // A rail that repeats the biggest thing on the page beside itself is the kind of
  // padding that makes a thin blog look thinner.
  it("does not repeat the lead story in a rail", () => {
    const startHere = body.slice(body.lastIndexOf("Start here"));
    expect(startHere).not.toContain("/blog/sofa-uae");
  });

  it("says so plainly when there is nothing yet, instead of an empty page", () => {
    const empty = indexBody({ pages: [], name: "ARQR360", topBar: "", hrefOf: href });
    expect(empty).toContain("New articles are on their way");
    expect(empty).not.toContain("gp-card");
  });

  it("survives a null in the list rather than rendering a blank card", () => {
    const b = indexBody({ pages: [PAGES[0], null, PAGES[1]], name: "X", topBar: "", hrefOf: href });
    expect(b).toContain("2 articles and counting");
  });
});

describe("the side rails", () => {
  it("only ever list articles that exist", () => {
    const r = rail("Latest", PAGES.slice(0, 2), href);
    expect((r.match(/<li>/g) || []).length).toBe(2);
  });

  it("say nothing rather than pad themselves out", () => {
    expect(rail("Latest", [], href)).toBe('<aside class="gp-rail"></aside>');
    expect(rail("Latest", [], href, "The newest articles will appear here.")).toContain("will appear here");
    expect(rail("Latest", null, href)).toBe('<aside class="gp-rail"></aside>');
  });

  it("put the closest articles beside the one being read", () => {
    const near = related(PAGES[0], PAGES);
    expect(near[0].slug).toBe("sofa-returns"); // shares "sofa"
    expect(near.map((p) => p.slug)).not.toContain("sofa-uae"); // never itself
  });

  it("fall back to the newest when nothing shares a word", () => {
    const lonely = P({ slug: "zzz", title: "Completely unrelated", published_at: day(1) });
    const near = related(lonely, PAGES);
    expect(near[0].slug).toBe("sofa-uae");
    expect(near).toHaveLength(4);
  });

  it("never return the article itself, whatever is passed in", () => {
    expect(related(PAGES[0], [PAGES[0]])).toEqual([]);
    expect(related(PAGES[0], [])).toEqual([]);
    expect(related({}, PAGES, 2)).toHaveLength(2);
  });
});

describe("nothing a business typed can break the page", () => {
  it("escapes a title", () => {
    const g = cardGrid([P({ title: '<script>alert(1)</script> & "quotes"' })], href);
    expect(g).not.toContain("<script>");
    expect(g).toContain("&lt;script&gt;");
    expect(g).toContain("&amp;");
  });

  it("escapes a quote inside an image url or an alt", () => {
    const h = thumb(P({ hero_image: 'x.jpg" onerror="alert(1)', hero_alt: 'a "sofa"' }));
    expect(h).not.toMatch(/onerror="alert/);
    expect(h).toContain("&quot;");
  });

  it("escapes a rail kicker, which carries the business name", () => {
    expect(rail('More from <b>X</b>', PAGES.slice(0, 1), href)).toContain("&lt;b&gt;");
  });

  it("has the escapers the rest of the file depends on", () => {
    expect(esc("<&>")).toBe("&lt;&amp;&gt;");
    expect(attr('a"b')).toBe("a&quot;b");
    expect(esc(null)).toBe("");
  });
});

describe("the look", () => {
  it("is the brand's paper and grid, not screen white", () => {
    expect(READING_CSS).toContain("--page:#FAF7F2");
    expect(READING_CSS).toContain("repeating-linear-gradient");
    expect(READING_CSS).toContain("--accent:#E0682A");
  });

  it("keeps the reading column at a readable width", () => {
    expect(READING_CSS).toContain(".gp-wrap{max-width:720px");
    expect(READING_CSS).toMatch(/\.gp-shell>\.gp-main\{[^}]*max-width:760px/);
  });

  it("puts the article before the rails, in the markup and not only in CSS", () => {
    // A phone reader, a screen reader and a crawler all take the markup's order.
    // Reordering rails-first markup with CSS would fix the look and leave all
    // three meeting a list of other articles before the title they asked for.
    const body = indexBody({ pages: PAGES, name: "X", topBar: "", hrefOf: href });
    expect(body.indexOf("gp-main")).toBeLessThan(body.indexOf("gp-rail"));
    expect(READING_CSS).not.toMatch(/\.gp-main\{[^}]*order:/);
    expect(READING_CSS).toMatch(/@media \(min-width:1180px\)/);
    expect(READING_CSS).toMatch(/\.gp-shell>\.gp-main\{grid-column:2;grid-row:1/);
    expect(READING_CSS).toMatch(/\.gp-rail:first-of-type\{grid-column:1/);
    expect(READING_CSS).toMatch(/\.gp-rail:last-of-type\{grid-column:3/);
  });

  it("is one stylesheet for the hosted blog and the Genie Pages", () => {
    const route = readFileSync(join(process.cwd(), "app/b/[handle]/[[...path]]/route.js"), "utf8");
    const index = readFileSync(join(process.cwd(), "app/p/[handle]/page.js"), "utf8");
    const article = readFileSync(join(process.cwd(), "app/p/[handle]/[slug]/page.js"), "utf8");
    for (const f of [route, index, article]) expect(f).toContain("@/app/p/reading");
    // And one set of builders, so the markup the tests render is the markup the
    // route renders. A route file may only export its HTTP verbs, which is why
    // these live in lib.
    expect(route).toContain('from "@/lib/blog-ui"');
    expect(route).toMatch(/indexBody\(\{ pages, name, topBar/);
    // The old flat list of links is gone from both, not merely bypassed.
    expect(route).not.toContain("gp-li-t");
    expect(index).not.toContain("gp-li-t");
    // Both article pages carry the rails.
    expect(route).toMatch(/rail\("Latest", latest, href\)/);
    expect(article).toMatch(/<Rail kicker="Latest"/);
  });
});
