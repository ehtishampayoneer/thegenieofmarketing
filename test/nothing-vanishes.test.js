import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const api = readFileSync(join(process.cwd(), "app/api/worklog/route.js"), "utf8");
const page = readFileSync(join(process.cwd(), "app/worklog/page.js"), "utf8");

// ── WHY THIS EXISTS ──
// "I published and cannot find it anywhere." There are four ways an approved
// article ends up nowhere: it published (fine), it failed, it was held for review,
// or Genie threw it away as a near-copy. Three of those four said so in a toast and
// then the toast went away — so the only record of the most alarming thing that can
// happen to an owner's work was a sentence they had four seconds to read.
//
// This page is the one place work is not allowed to vanish from. That has to
// include the work that never left.
describe("every way a piece of work can end has a home", () => {
  it("reads the ones that stopped, not only the ones that landed", () => {
    expect(api).toMatch(/in\("status", \["failed", "needs_review"\]\)/);
    expect(api).toMatch(/"content\.discarded", "content\.expired"\]/);
  });

  it("says what stopped it, in the words the route recorded", () => {
    expect(api).toMatch(/It stopped with: \$\{String\(a\.result\.error\)/);
    expect(api).toMatch(/Genie rewrote what it could and this is what is left/);
  });

  it("says plainly that nothing went out, because that is the real question", () => {
    expect(api).toMatch(/Nothing was sent or posted/);
  });

  it("tells them where it is and what to do, never just that it broke", () => {
    for (const w of ["approve it again to retry", "It is in Approvals", "Nothing for you to do"]) {
      expect(api.includes(w), w).toBe(true);
    }
  });

  it("renders all three, rather than falling through to a generic row", () => {
    for (const k of ["discarded", "failed", "held"]) {
      expect(page.includes(`  ${k}: { icon:`), k).toBe(true);
    }
  });

  it("never claims a publish that did not happen", () => {
    // The published row comes from published_pages, which only holds real rows.
    expect(api).toMatch(/from\("published_pages"\)/);
    expect(api).not.toMatch(/kind: "published"[\s\S]{0,200}status === "approved"/);
  });
});

// ── WHY, NOT JUST WHAT ──
// "I am confused how a user sees what he did, where it landed, and why." The card
// in Approvals explains the choice and then the card goes away, so a week later
// this page was a list of things that had happened with no clue what any of them
// was for. An owner who cannot see the reasoning has no way to tell work from
// activity, and activity is what every other tool already sells them.
describe("every line says why Genie did it, not only that it happened", () => {
  it("carries a reason for each kind of thing that can land here", () => {
    expect((api.match(/^\s*why:/gm) || []).length).toBeGreaterThanOrEqual(5);
  });

  it("names the actual keyword, because that is the checkable part", () => {
    expect(api).toMatch(/Written to win the Google search "\$\{p\.target_keyword\}"/);
  });

  it("explains a follow-up differently from a first email", () => {
    expect(api).toMatch(/Two follow-ups roughly double the replies/);
    expect(api).toMatch(/published this address on their own website/);
  });

  it("explains a thrown-away article as Genie protecting the site, not as a failure", () => {
    expect(api).toMatch(/threw its own work away rather than risk your site/);
  });

  it("shows it, labelled, rather than burying it in the note", () => {
    expect(page).toMatch(/\{it\.why &&/);
    expect(page).toMatch(/Why:<\/b>/);
  });

  it("says nothing when there is no honest reason to give", () => {
    // A row with no why must render nothing rather than an invented sentence.
    expect(page).toMatch(/\{it\.why && \(/);
  });
});

// ── WHAT WENT OUT UNDER THEIR NAME ──
// "How can I see what Genie sent? What if it sent something wrong?" The body was
// written to outreach_log on every single send and shown on no screen anywhere. An
// owner could see that forty emails had gone out and could not read one of them.
describe("the words that were actually sent are readable", () => {
  it("carries the body out of the send log", () => {
    expect(api).toMatch(/select\("contact_email, contact_name, subject, body,/);
    expect(api).toMatch(/body: e\.body \|\| null,/);
    expect(api).toMatch(/to: e\.contact_email \|\| null,/);
  });

  it("shows it on demand rather than in the way", () => {
    expect(page).toMatch(/\{it\.body && \(/);
    expect(page).toMatch(/Read the email that was sent/);
    expect(page).toMatch(/<details/);
  });

  it("keeps the line breaks the recipient saw", () => {
    expect(page).toMatch(/whitespace-pre-wrap/);
  });

  it("says who it went to, which is half the question", () => {
    expect(page).toMatch(/To: \{it\.to\}/);
  });
});
