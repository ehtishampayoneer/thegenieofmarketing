import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prospects = readFileSync(join(process.cwd(), "lib/prospects.js"), "utf8");
const lib = readFileSync(join(process.cwd(), "lib/wikidata.js"), "utf8");

// ── WHY THIS EXISTS ──
// Web search and a model both return whoever wrote the best page about themselves.
// Neither has any idea who is LARGE. So the prospect list skewed small every night
// and nothing about it looked wrong — the companies were real, they were simply
// never the ones worth the most. Public company records know the difference, for
// free and with no key: a verified query returned IKEA, Jysk, Habitat, Ashley and
// DFS in about two seconds.
function stub(handler) {
  const orig = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url) => handler(String(url)));
  return () => { globalThis.fetch = orig; };
}
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

describe("turning the owner's words into what the records call it", () => {
  it("undoes the plural, which was the whole difference", async () => {
    // "furniture retailers" found nothing; "furniture retailer" found six global
    // chains. One letter.
    const asked = [];
    const done = stub((url) => {
      asked.push(decodeURIComponent(new URL(url).searchParams.get("search") || ""));
      return ok({ search: url.includes("furniture%20retailer&") || asked.at(-1) === "furniture retailer"
        ? [{ id: "Q104817981", label: "furniture retailer", description: "company selling furniture" }] : [] });
    });
    const { resolveIndustry } = await import("@/lib/wikidata");
    const r = await resolveIndustry("furniture retailers");
    done();
    expect(r?.id).toBe("Q104817981");
    expect(asked[0]).toBe("furniture retailers");
    expect(asked).toContain("furniture retailer");
  });

  it("refuses a classification code, which has no companies in it", async () => {
    // "Furniture Retailers (NAICS industry classification)" resolves and then
    // returns an empty list forever.
    const done = stub(() => ok({ search: [{ id: "Q123131568", label: "Furniture Retailers", description: "NAICS industry classification" }] }));
    const { resolveIndustry } = await import("@/lib/wikidata");
    const r = await resolveIndustry("widget makers");
    done();
    expect(r).toBe(null);
  });

  it("gives up quietly when the records do not cover the niche", async () => {
    // Retail is well covered; service niches are thin. "rug shops" genuinely
    // returns nothing, and that is the right answer — web search carries the night.
    const done = stub(() => ok({ search: [] }));
    const { resolveIndustry } = await import("@/lib/wikidata");
    expect(await resolveIndustry("bespoke rug ateliers")).toBe(null);
    done();
  });

  it("stops asking when the API throttles, instead of walking into the same wall", () => {
    // Its refusal is plain text, not JSON, and it arrives after a few quick calls.
    expect(lib).toMatch(/break;/);
    expect(lib).toMatch(/throttles quickly, and its refusal is plain text/);
  });
});

describe("the companies it returns", () => {
  const rows = (arr) => ({ results: { bindings: arr } });
  const co = (name, site, emp, country) => ({
    cLabel: { value: name }, site: { value: site },
    ...(emp ? { emp: { value: String(emp) } } : {}),
    ...(country ? { countryLabel: { value: country } } : {}),
  });

  // A fresh industry id per case: the module caches by industry, correctly, and
  // reusing one here would hand every test the first one's answer.
  let n = 0;
  async function run(bindings) {
    const id = `Q90${++n}`;
    const done = stub((url) => url.includes("query.wikidata.org")
      ? ok(rows(bindings))
      : ok({ search: [{ id, label: "furniture retailer", description: "company selling furniture" }] }));
    const { bigCompanies } = await import("@/lib/wikidata");
    const out = await bigCompanies(`niche-${id}`, { limit: 10 });
    done();
    return out;
  }

  it("puts the largest first, because that is the entire point", async () => {
    const out = await run([co("Small", "https://small.com", 40), co("IKEA", "https://ikea.com", 14447), co("Mid", "https://mid.com", 650)]);
    expect(out.map((c) => c.name)).toEqual(["IKEA", "Mid", "Small"]);
  });

  it("keeps a company with no headcount recorded", async () => {
    // A missing number is a gap in the records, not a small company.
    const out = await run([co("Known", "https://a.com", 100), co("Unrecorded", "https://b.com")]);
    expect(out).toHaveLength(2);
    expect(out.at(-1).employees).toBe(null);
  });

  it("returns one row per company, however many countries it trades in", async () => {
    // DFS came back twice, Leen Bakker twice. A duplicate is a second email to
    // the same inbox.
    const out = await run([co("DFS", "https://dfs.co.uk", 100, "United Kingdom"), co("DFS", "https://www.dfs.co.uk", 100, "Ireland")]);
    expect(out).toHaveLength(1);
    expect(out[0].domain).toBe("dfs.co.uk");
  });

  it("never lets an unresolved id through as a company name", async () => {
    const out = await run([co("Q7891011", "https://x.com", 900), co("Real", "https://real.com", 10)]);
    expect(out.map((c) => c.name)).toEqual(["Real"]);
  });

  it("drops a row with no usable website, since the address is read off it", async () => {
    const out = await run([{ cLabel: { value: "NoSite" } }, co("Real", "https://real.com", 10)]);
    expect(out.map((c) => c.name)).toEqual(["Real"]);
  });

  it("returns an empty list rather than throwing when the endpoint is down", async () => {
    const done = stub(() => { throw new Error("network"); });
    const { bigCompanies } = await import("@/lib/wikidata");
    expect(await bigCompanies("anything at all")).toEqual([]);
    done();
  });
});

describe("it changes who gets written to, and nothing else", () => {
  it("adds names before the model's, so the chain is profiled first", () => {
    expect(prospects).toMatch(/const \{ bigCompanies \} = await import\("@\/lib\/wikidata"\)/);
    expect(prospects.indexOf("bigCompanies(niche")).toBeLessThan(prospects.indexOf("llmCandidateCompanies(niche"));
  });

  it("never becomes a source of contact addresses", () => {
    // The load-bearing rule of the whole product: every address Genie writes to was
    // published by that company on its own site. This lane supplies a name and a
    // website, and the address is still read off that website exactly as before.
    expect(prospects).toMatch(/supplies a NAME and a WEBSITE only/);
    expect(lib).toMatch(/It never supplies a contact address, and it must not/);
    expect(lib).not.toMatch(/\bemail\b\s*:/);
  });

  it("cannot break discovery when it fails", () => {
    expect(prospects).toMatch(/await import\("@\/lib\/wikidata"\)[\s\S]{0,400}\} catch \{\}/);
  });

  it("says where a big fish came from, rather than appearing by magic", async () => {
    const { bigFishNote } = await import("@/lib/wikidata");
    expect(bigFishNote({ source: "wikidata", employees: 14447, country: "Germany" })).toMatch(/14,447 employees, Germany/);
    expect(bigFishNote({ source: "wikidata" })).toMatch(/a chain/);
    expect(bigFishNote({ source: "web" })).toBe("");
    expect(bigFishNote(null)).toBe("");
  });
});
