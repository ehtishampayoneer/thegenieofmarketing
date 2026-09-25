import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const welcome = readFileSync(join(process.cwd(), "app/welcome/page.js"), "utf8");

// ── WHY THIS EXISTS ──
// "What will make me feel wow, I will get clients now?"
//
// Onboarding started the article engine and the buyer hunt, and left out the one
// channel that can produce a reply this week. So a new owner finished setup, opened
// Approvals, and found a blog post — from a product whose entire promise is "paste
// your link and Genie finds you clients". The emails did not exist until the 1am run,
// and by then the person who had just been excited about it had gone.
describe("a new account has real work waiting before they leave setup", () => {
  it("starts every engine that produces something to approve", () => {
    for (const route of ["/api/keywords", "/api/content", "/api/radar/intent", "/api/outreach/campaign"]) {
      expect(welcome.includes(route), `onboarding never starts ${route}`).toBe(true);
    }
  });

  it("starts outreach after the keywords it depends on", () => {
    // Emails to companies chosen from a keyword set that does not exist yet would
    // be worse than no emails.
    expect(welcome.indexOf("/api/outreach/campaign")).toBeGreaterThan(welcome.indexOf("/api/keywords"));
  });

  it("does not wait for outreach before letting them finish", () => {
    // Finding companies and crawling their sites takes a minute. Blocking the last
    // step of setup on it would trade the wow for a spinner.
    expect(welcome).toMatch(/fetch\("\/api\/outreach\/campaign"[\s\S]{0,140}\.catch\(\(\) => \{\}\)/);
  });

  it("sends nothing — the drafts wait like everything else", () => {
    // The campaign route stages for approval unless the owner has granted autonomy,
    // which a brand-new account has not. Said here so a future change to that
    // default has to argue with this test.
    expect(welcome).toMatch(/Nothing is sent: the drafts wait in Approvals/);
  });
});

describe("the closing promise matches what actually happens", () => {
  it("promises three decisions, which is what the queue gives", () => {
    expect(welcome).toMatch(/three decisions\. Not a queue/);
  });

  it("promises the emails in one card, which is how they now arrive", () => {
    expect(welcome).toMatch(/emails in one card/);
  });

  it("no longer promises a short list of ready-to-publish work", () => {
    // Vague enough to cover anything, which is how it survived being wrong.
    expect(welcome).not.toMatch(/short list of ready-to-publish work/);
  });
});
