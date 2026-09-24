import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const route = readFileSync(join(ROOT, "app/api/worklog/route.js"), "utf8");
// The "never promise what a stranger does" rule is about the text this route
// SENDS, not about the comment explaining the rule — which names the forbidden
// phrasing in order to forbid it, and would otherwise fail its own check.
const routeCode = route.replace(/^\s*\/\/.*$/gm, "");
const page = readFileSync(join(ROOT, "app/worklog/page.js"), "utf8");
const shell = readFileSync(join(ROOT, "components/shell/v2/OperatorShell.js"), "utf8");
const today = readFileSync(join(ROOT, "app/today/page.js"), "utf8");

// This screen exists for three reasons, and each one is a decision this product
// already made elsewhere. They are pinned here because all three are the kind of
// thing a later edit removes without noticing.
describe("everything Genie did", () => {
  it("shows the article's real address — the bug it was built to fix", () => {
    // The URL was written to the database and surfaced in exactly one place: a
    // temporary list on Approvals that emptied on refresh.
    expect(route).toMatch(/published_pages/);
    expect(route).toMatch(/pageUrl\(/);
    // And when the owner's own domain serves it, THAT is the address reported.
    expect(route).toMatch(/publish\.own_url/);
    expect(route).toMatch(/ownUrlByPage/);
  });

  it("gathers the work from every engine, not just one", () => {
    for (const source of ["published_pages", "outreach_log", "placements", "keyword_history", "lead.captured", "conversion.recorded"]) {
      expect(route, source).toMatch(new RegExp(source.replace(".", "\\.")));
    }
  });

  it("gives every number a sentence of plain English", () => {
    // "12 visits" reads as failure to someone who does not know that a new
    // article takes months.
    expect(route).toMatch(/three to six months/);
    expect(route).toMatch(/No reply yet is normal/);
    expect(page).toMatch(/it\.note/);
  });

  it("promises only what Genie does, never what a stranger does", () => {
    // The rule this product adopted on purpose after deleting its forecasts.
    expect(route).toMatch(/Follow-ups:/);
    expect(route).toMatch(/Writing: one article a night/);
    expect(page).toMatch(/can’t promise when someone replies/);
    // The forbidden shape: a promise about other people's behaviour.
    expect(routeCode).not.toMatch(/you.?ll (start )?get(ting)? replies/i);
    expect(routeCode).not.toMatch(/expect .* replies/i);
  });

  it("points at the owner's own accounts, which is the strongest thing it can say", () => {
    expect(route).toMatch(/in your own Gmail Sent folder/);
    expect(route).toMatch(/live on your site/);
    expect(route).toMatch(/your own Google Search Console/);
    expect(route).toMatch(/Everything here happened in your own accounts/);
    expect(page).toMatch(/it\.where/);
  });

  it("marks the first of each kind, because the first of anything is the moment it feels real", () => {
    expect(route).toMatch(/first = true/);
    expect(page).toMatch(/your first/);
  });

  it("keeps running totals, so progress is visible while results are still zero", () => {
    expect(route).toMatch(/totals = \{/);
    expect(page).toMatch(/Since you started/);
  });

  it("is reachable — from the rail and from Today", () => {
    expect(shell).toMatch(/id: "worklog"/);
    expect(today).toMatch(/href="\/worklog"/);
  });

  it("never throws a page away because one query failed", () => {
    // Every read goes through safe(); one dead table must not blank the screen.
    expect(route).toMatch(/async function safe\(/);
    expect(route).toMatch(/catch \{ return \[\]; \}/);
  });
});
