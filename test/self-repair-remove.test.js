// test/self-repair-remove.test.js
// From a live screenshot, 28 Sep: an article held with "4 claim(s) need
// verification — edit this and try again", for four sentences Genie had written,
// one of them a customer case study it invented outright. The owner: "genie needs
// to solve such things automatically, not tell the user to do that".
//
// Two faults. The repair only acted on a claim found in the article character for
// character, and the checker quotes with curly apostrophes, other dashes, no bold,
// and several sentences as one claim — so it silently did nothing. And the loop
// re-read the article with the AI after every rewrite, which nearly always finds
// something new, so it never settled and the owner was handed it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { locateClaim, removeClaims, sentenceSpans, normalizeForMatch } from "@/lib/self-repair";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

// The article's own characters: straight apostrophes, bold, a list, a nested item.
const BODY = `## Why retailers switch

This happens every day. A shopper loves a sofa and leaves because they cannot picture it at home.

**ARQR360 takes a different approach.** It's built for growing U.S. retailers who want AR without hiring 3D artists, developers, or project managers.

- No coding. No app downloads. Just real-time, true-scale visualization embedded directly on your product pages.
- It works on any phone with a browser.
  - Nested detail stays nested.

## Setup

No coding. That line belongs to a different section and must stay.

One national carpet retailer tested both platforms. With Threekit, setup took six weeks and required three internal staff members. With ARQR360, they launched their first 50 AR products in 10 days, no internal lift.

A 3.5 metre sofa needs a 90 cm doorway, e.g. a standard one.`;

// The checker's quotes, exactly as it writes them: curly quotes and apostrophes.
const FLAGGED = [
  { claim: "This happens every day." },
  { claim: "ARQR360 takes a different approach. It’s built for growing U.S. retailers who want AR without hiring 3D artists, developers, or project managers." },
  { claim: "“No coding. No app downloads. Just real-time, true-scale visualization embedded directly on your product pages.”" },
  { claim: "One national carpet retailer tested both platforms. With Threekit, setup took six weeks and required three internal staff members. With ARQR360, they launched their first 50 AR products in 10 days, no internal lift." },
];

describe("finding a flagged sentence however the checker quoted it", () => {
  it("ignores quote style, dash style and bold", () => {
    expect(normalizeForMatch("**It’s** “fine” — really")).toBe(normalizeForMatch(`It's "fine" - really`));
  });

  it("finds every one of the four real flagged claims", () => {
    for (const c of FLAGGED) expect(locateClaim(BODY, c.claim).found, c.claim.slice(0, 40)).toBe(true);
  });

  it("finds a three-sentence case study as three sentences", () => {
    expect(locateClaim(BODY, FLAGGED[3].claim).spans).toHaveLength(3);
  });

  it("does not split on a decimal point or an abbreviation", () => {
    const s = sentenceSpans(BODY).find((x) => x.text.includes("3.5"));
    expect(s.text).toBe("A 3.5 metre sofa needs a 90 cm doorway, e.g. a standard one.");
  });

  it("does not claim to find what is not there", () => {
    expect(locateClaim(BODY, "Our sofas are the best in the world, guaranteed forever.").found).toBe(false);
  });
});

describe("taking them out", () => {
  const out = removeClaims(BODY, FLAGGED);

  it("removes all of them, and misses none", () => {
    expect(out.missing).toEqual([]);
    for (const gone of ["This happens every day", "takes a different approach", "No app downloads", "carpet retailer", "Threekit"]) {
      expect(out.text).not.toContain(gone);
    }
  });

  it("leaves everything else as it was", () => {
    expect(out.text).toContain("A shopper loves a sofa and leaves because they cannot picture it at home.");
    expect(out.text).toContain("- It works on any phone with a browser.");
    expect(out.text).toContain("A 3.5 metre sofa needs a 90 cm doorway, e.g. a standard one.");
  });

  it("keeps an identical short line that belongs to a different section", () => {
    expect(out.text).toContain("No coding. That line belongs to a different section and must stay.");
  });

  it("drops the list item it emptied, and keeps a nested item nested", () => {
    expect(out.text).not.toMatch(/^- *$/m);
    expect(out.text).toContain("\n  - Nested detail stays nested.");
  });

  it("leaves no stray space where a sentence opened a paragraph", () => {
    expect(out.text).toContain("\n\nA shopper loves a sofa");
    expect(out.text).not.toMatch(/\n [A-Za-z]/);
  });

  it("reports a claim it could not find, so the caller knows the article is not known to be clean", () => {
    const r = removeClaims(BODY, [{ claim: "Nothing like this sentence appears anywhere in the article text." }]);
    expect(r.missing).toHaveLength(1);
    expect(r.text).toBe(BODY);
  });
});

describe("the writer may not invent customers", () => {
  it("the rules every writer is given forbid invented case studies", () => {
    expect(read("lib/claim-rules.js")).toMatch(/No customer stories, case studies, testimonials or results unless the brief gives them to you/);
  });
});

describe("a held article that Genie wrote is handed back to Genie", () => {
  const page = read("app/approvals/page.js");

  it("the first button is Genie fixing it, not the owner editing it", () => {
    expect(page).toMatch(/Let Genie fix it and publish/);
    expect(page).toMatch(/item\.ownerEdited \? \(/);
  });

  it("the queue says whose words they are", () => {
    expect(read("app/api/approvals/route.js")).toMatch(/ownerEdited: !!p\.ownerEdited,/);
  });
});

describe("a cut inside bold text keeps the bold balanced", () => {
  const t = "**First claim here now. Second sentence stays here fine.** And a third one follows.";
  it("cutting the sentence that opened the bold hands the opening to the next one", () => {
    expect(removeClaims(t, [{ claim: "First claim here now." }]).text).toBe("**Second sentence stays here fine.** And a third one follows.");
  });
  it("cutting the sentence that closed the bold hands the closing to the one before", () => {
    expect(removeClaims(t, [{ claim: "Second sentence stays here fine." }]).text).toBe("**First claim here now.** And a third one follows.");
  });
  it("cutting a whole bold sentence leaves no asterisks behind", () => {
    expect(removeClaims("Intro sentence stays put. **The whole bold claim goes.** Outro stays here.", [{ claim: "The whole bold claim goes." }]).text)
      .toBe("Intro sentence stays put. Outro stays here.");
  });
});
