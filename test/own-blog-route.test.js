import { describe, it, expect, vi, beforeEach } from "vitest";

// A tiny stand-in for the Supabase query builder: every filter is recorded and
// the result is whatever the table holds after applying the eq() filters.
const tables = {};
function builder(rows) {
  let out = rows.slice();
  const q = {
    select: () => q, order: () => q, limit: () => q,
    eq: (col, val) => {
      out = out.filter((r) => (col.includes("->>") ? r[col.split("->>")[0]]?.[col.split("->>")[1]] : r[col]) === val);
      return q;
    },
    maybeSingle: async () => ({ data: out[0] || null }),
    then: (res) => res({ data: out }),
  };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t) => builder(tables[t] || []) }) }));

const { GET } = await import("@/app/b/[handle]/[[...path]]/route.js");
const { markerValue } = await import("@/lib/own-blog");

beforeEach(() => {
  process.env.APP_URL = "https://genie.app";
  tables.connections = [
    { user_id: "owner", provider: "ownblog", updated_at: "2026-09-01", meta: { handle: "arqr360.com", host: "arqr360.com", path: "/blog", base: "https://arqr360.com/blog", verifiedAt: "2026-09-01" } },
  ];
  tables.published_pages = [
    { user_id: "owner", handle: "arqr360.com", slug: "ar-sofa", status: "published", title: "See a sofa in your room", meta_description: "How AR helps", published_at: "2026-09-10", host: "arqr360.com", business_name: "ARQR",
      body_html: '<p>Read <a href="https://genie.app/p/arqr360.com/older">our older guide</a>.</p>', faq: [{ q: "Is it free?", a: "Yes." }] },
    // Someone else scanned the same site: their article must never appear.
    { user_id: "stranger", handle: "arqr360.com", slug: "spam", status: "published", title: "Not the owner's", published_at: "2026-09-11", host: "arqr360.com" },
  ];
});

const call = (path) => GET(new Request("https://genie.app/b/x"), { params: { handle: "arqr360.com", path } });

describe("the owner's blog served through their domain", () => {
  it("renders an article with the owner's canonical, marker and links", async () => {
    const res = await call(["ar-sofa"]);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<link rel="canonical" href="https://arqr360.com/blog/ar-sofa">');
    expect(html).toContain(`content="${markerValue("arqr360.com", "owner")}"`);
    expect(html).toContain('href="https://arqr360.com/blog/older"');
    expect(html).not.toContain("genie.app/p/");
    expect(html).toContain('"@type":"FAQPage"');
    // No framework scripts that would be requested from the owner's domain.
    expect(html).not.toContain("/_next/");
  });

  it("lists only the owner's articles", async () => {
    const html = await (await call([])).text();
    expect(html).toContain("See a sofa in your room");
    expect(html).not.toContain("Not the owner's");
    expect(html).toContain('<link rel="canonical" href="https://arqr360.com/blog">');
  });

  it("serves a sitemap and llms.txt on the owner's domain", async () => {
    const xml = await (await call(["sitemap.xml"])).text();
    expect(xml).toContain("<loc>https://arqr360.com/blog/ar-sofa</loc>");
    expect(xml).not.toContain("spam");
    const llms = await (await call(["llms.txt"])).text();
    expect(llms).toContain("https://arqr360.com/blog/ar-sofa");
  });

  it("404s for an unknown article or a site with no blog", async () => {
    expect((await call(["nope"])).status).toBe(404);
    tables.connections = [];
    expect((await call([])).status).toBe(404);
  });
});
