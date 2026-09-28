// test/approvals-sections.test.js
// Reported by the owner, 27 Sep: "we don't want the user to go into every section
// and check things there — everything should be on the approval page every day."
//
// Buyer Hunt, Reddit, Quora and forum finds DID reach the queue — and ranked
// behind articles, emails and pitches, so they sat in "72 lined up behind them"
// and were never seen. The owner concluded those sections produced nothing.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const api = read("app/api/approvals/route.js");
const page = read("app/approvals/page.js");

// The real function, lifted out of the route (a route file may only export verbs).
const src = api.slice(api.indexOf("function sectionOf(i) {"));
const sectionOf = new Function(src.slice(0, src.indexOf("\n}\n") + 2) + "; return sectionOf;")();

describe("every item says which section made it", () => {
  const cases = [
    [{ kind: "outreach_email" }, "emails"],
    [{ kind: "article" }, "articles"],
    [{ kind: "article", fromAiSearch: true }, "ai_search"],
    [{ kind: "media_pitch" }, "featured"],
    [{ kind: "directory_submission" }, "listings"],
    [{ source: "placement", kind: "reply", platform: "reddit", buyerIntent: true }, "buyers"],
    [{ source: "placement", kind: "reply", platform: "reddit" }, "communities"],
    [{ source: "placement", kind: "answer", platform: "quora" }, "communities"],
    [{ kind: "social_post", platform: "linkedin" }, "social"],
    [{ kind: "social_post", platform: "pinterest" }, "social"],
  ];
  for (const [item, want] of cases) {
    it(`${JSON.stringify(item)} -> ${want}`, () => expect(sectionOf(item)).toBe(want));
  }
});

describe("the queue returns everything, and marks the best few", () => {
  it("returns every waiting item, not only today's three", () => {
    expect(api).toMatch(/const shown = \[\.\.\.batched\]\.sort\(/);
    // The old return that sliced the list to three is gone.
    expect(api).not.toMatch(/\.slice\(0, DAILY_CARDS\), \.\.\.emailCards\]\.sort\(order\)/);
  });

  it("today's focus is marked, not the only thing sent", () => {
    expect(api).toMatch(/i\.focus = focusIds\.has\(i\.id\)/);
    expect(api).toMatch(/i\.section = sectionOf\(i\)/);
    expect(api).toMatch(/focusCount: focusCards\.length, sections,/);
  });

  it("every radar find says whether Buyer Hunt made it", () => {
    expect(api).toMatch(/buyerIntent: !!meta\.buyer_intent,/);
  });
});

describe("the page shows every section, one click away", () => {
  it("opens on today's focus, so a morning still takes minutes", () => {
    expect(page).toMatch(/const \[sectionFilter, setSectionFilter\] = useState\("focus"\)/);
  });

  it("has a tab for each section the menu has", () => {
    for (const label of ["Buyer Hunt", "Get featured", "AI Search", "Emails", "Articles", "Everything"]) {
      expect(page).toContain(`label: "${label}"`);
    }
  });

  it("filters the view by section, before every other filter", () => {
    expect(page).toMatch(/items\.filter\(\(it\) => matchesSection\(it, sectionFilter\) && matchesType/);
  });

  it("says what is waiting beyond today's focus, and where", () => {
    expect(page).toMatch(/more across the sections below/);
  });

  it("'view everything' shows everything, instead of linking to a redirect back here", () => {
    expect(page).not.toMatch(/href="\/tasks"/);
    expect(page).toMatch(/onViewAll=\{\(\) => \{ setSectionFilter\("all"\)/);
  });

  it("clearing the filters clears the section too, so nobody filters into an empty screen", () => {
    expect(page).toMatch(/setTierFilter\("all"\); setSectionFilter\("focus"\); \}\}/);
  });
});

describe("AI Search work is labelled as AI Search, and says what it has really done", () => {
  it("an answer page written for an AI-search gap is marked as one", () => {
    expect(read("app/api/content/route.js")).toMatch(/if \(pick\?\.aeo\) data\.article\.fromAiSearch = true;/);
  });

  it("no longer claims to have drafted plans it has not written yet", () => {
    const ai = read("app/api/ai-search/route.js");
    expect(ai).not.toMatch(/Genie drafted content plans to win them/);
    expect(ai).toMatch(/writes the answer page for the first one on the next run/);
  });
});
