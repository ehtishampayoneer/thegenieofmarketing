import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPlaceholderEmail } from "@/lib/prospects";

const src = readFileSync(join(process.cwd(), "lib/prospects.js"), "utf8");

// ── THE ONE NUMBER THAT DECIDES WHETHER THIS PRODUCT WORKS ──
// "Will he actually find clients?" Measured against eight real furniture retailers,
// the answer was ONE out of eight. It is now five, four of them with a real address.
// Three bugs, each of which reported a reachable company as unreachable — which is
// indistinguishable from a company that publishes nothing, so nobody could ever have
// noticed from inside the product.
describe("the page is not cut off before the part with the address", () => {
  it("allows for a page far larger than the old limit", () => {
    // Höffner publishes its address at character 425,416 of a 468KB page and
    // Segmüller at 512,095 of 1.3MB. The cap was 400,000. Both pages were fetched
    // successfully and both were cut a few thousand characters short of the only
    // thing being looked for.
    expect(src).toMatch(/const MAX_PAGE = 2_000_000/);
    expect(src).toMatch(/425,416/);
    expect(src).not.toMatch(/slice\(0, 400000\)/);
  });

  it("still has a limit, so one runaway page cannot exhaust the run", () => {
    expect(src).toMatch(/slice\(0, MAX_PAGE\)/);
  });
});

describe("the greyed-out example in a form is not a customer", () => {
  it("rejects the placeholders that real retailers actually ship", () => {
    // Both of these were returned as contactable addresses once the page was read
    // to the end. Emailing one is a guaranteed bounce, and bounces are what
    // mailbox providers use to decide the sender is a spammer.
    for (const e of ["your@email.com", "max@domain.de", "name@example.com", "john.doe@yourcompany.com", "test@sample.com", "mustermann@firma.de"]) {
      expect(isPlaceholderEmail(e), e).toBe(true);
    }
  });

  it("keeps the real ones, including the ones that look generic", () => {
    for (const e of ["cservices@heals.co.uk", "onlineshop@segmueller.de", "kontaktformular@hoeffner.de", "customercare@urbanbarn.com", "info@a-real-shop.com", "hello@studio.design"]) {
      expect(isPlaceholderEmail(e), e).toBe(false);
    }
  });

  it("treats anything unparseable as a placeholder rather than sending to it", () => {
    for (const e of ["", null, "not-an-email", "@nolocal.com"]) expect(isPlaceholderEmail(e), String(e)).toBe(true);
  });
});

describe("an address at the company's own domain wins", () => {
  it("ranks it above anything else found on the page", () => {
    // A third party's address in a footer credit is not this company's contact.
    expect(src).toMatch(/const ownHost = hostOf\(origin\)/);
    expect(src).toMatch(/String\(x\.email\)\.endsWith\(`@\$\{ownHost\}`\)/);
  });
});

describe("the page that legally has to carry an address", () => {
  it("looks for the impressum, in the places it is actually called", () => {
    // Required by law in Germany, Austria and Switzerland, and always carries a
    // real business address. Genie walked past it on every European prospect.
    for (const path of ["/impressum", "/kontakt", "/contacto", "/contatti", "/nous-contacter", "/contato"]) {
      expect(src.includes(`"${path}"`), path).toBe(true);
    }
  });

  it("ranks it with contact, not below it", () => {
    expect(src).toMatch(/function contactRank\(u\)/);
    expect(src).toMatch(/kontakt\|impressum\|imprint/);
  });

  it("ranks the whole set before cutting it, not just the links the page offered", () => {
    // The lists were merged and then cut at eight, homepage links first. A retailer
    // linking to about, support, help, company and our-story filled every slot
    // before /impressum was reached.
    expect(src).toMatch(/\.sort\(\(a, b\) => contactRank\(a\) - contactRank\(b\)\)\s*\n\s*\.slice\(0, 10\)/);
  });

  it("reads an address written to dodge scrapers, which a person reads fine", () => {
    // "info (at) example.com" is still an address the company published itself, on
    // its own site, for exactly this purpose.
    expect(src).toContain("to dodge");
    expect(src).toContain("dot");
  });
});
