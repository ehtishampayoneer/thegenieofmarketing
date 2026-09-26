import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const route = readFileSync(join(ROOT, "app/api/approvals/route.js"), "utf8");
const page = readFileSync(join(ROOT, "app/approvals/page.js"), "utf8");

// The cap is the smallest change in the rebuild and the one that decides whether
// a beginner opens the app a second time. It is also the easiest to undo by
// accident, so it is pinned here rather than trusted to a comment.
describe("the queue asks for three, not forty", () => {
  it("serves three by default", () => {
    // The number now lives in lib/queue-count.js, so the queue and the badge
    // beside it read the same constant instead of each keeping their own.
    expect(readFileSync(join(process.cwd(), "lib/queue-count.js"), "utf8")).toMatch(/DAILY_CARDS = 3/);
    expect(route).toMatch(/countWaiting, DAILY_CARDS \} from "@\/lib\/queue-count"/);
    expect(route).toMatch(/\.slice\(0,\s*DAILY_CARDS\)/);
  });

  it("still sorts by impact before it cuts, so the three are the best three", () => {
    const sortAt = route.indexOf("items.sort(order)");
    const sliceAt = route.indexOf(".slice(0, DAILY_CARDS)");
    expect(sortAt).toBeGreaterThan(-1);
    expect(sliceAt).toBeGreaterThan(sortAt);
    expect(route).toMatch(/b\.impact\s*-\s*a\.impact/);
  });

  // ── THE CAP MUST NOT DROP TWO COUNTRIES OUT OF THREE ──
  // Counting a country's whole day of emails as one card is what keeps a morning to
  // three minutes. Slicing the list at three then threw away two of the three
  // countries the plan had chosen to work: those emails were written, allowed to
  // send, and shown to nobody.
  it("caps everything except the countries' email cards", () => {
    expect(route).toMatch(/const emailCards = batched\.filter\(\(i\) => i\.kind === "outreach_email"\)/);
    expect(route).toMatch(/batched\.filter\(\(i\) => i\.kind !== "outreach_email"\)\.slice\(0, DAILY_CARDS\), \.\.\.emailCards\]/);
  });

  // ── THREE DECISIONS, NOT THREE EMAILS ──
  // The cap was the right number of decisions and the wrong number of emails: an
  // article sorts above everything, so a normal morning showed about two emails
  // against an allowance built for five rising to thirty-five. Eight times fewer
  // than the product was designed to send, and cold email arithmetic is unforgiving
  // about that — sixty a month is under three replies where five hundred is five to
  // twenty-five. The emails now travel as one card.
  it("puts the day's emails in one card instead of spending the whole queue on two", () => {
    expect(route).toMatch(/const emails = items\.filter\(\(i\) => i\.kind === "outreach_email"\)/);
    // One card PER COUNTRY, not one card for the world: Malaysia's five, India's
    // three and America's four are three decisions about three different places,
    // and "twelve emails to twelve companies" throws away the only fact that says
    // which of the three is working.
    expect(route).toMatch(/batch: group\.map\(/);
    expect(route).toMatch(/title: `\$\{group\.length\} emails to \$\{group\.length\} companies\$\{where\}`/);
    expect(route).toMatch(/const key = e\.market \|\| ""/);
    expect(route).toMatch(/lead\.marketName \? ` in \$\{lead\.marketName\}` : ""/);
  });

  it("gives each country's batch the best impact in it, so a strong lead is not averaged away", () => {
    expect(route).toMatch(/impact: Math\.max\(\.\.\.group\.map\(\(e\) => e\.impact \|\| 0\)\)/);
  });

  it("counts the backlog in emails, not in cards", () => {
    // Otherwise batching five emails into one card would silently claim four fewer
    // things were waiting.
    expect(route).toMatch(/shown\.reduce\(\(n, i\) => n \+ \(i\.batch\?\.length \|\| 1\), 0\)/);
  });

  it("never batches when the owner asked to see everything", () => {
    expect(route).toMatch(/if \(!showAll && emails\.length > 1\)/);
  });

  it("hides nothing — the rest is one request away", () => {
    expect(route).toMatch(/searchParams\.get\("all"\)/);
    expect(page).toMatch(/\?all=1/);
  });

  // ── ONE NUMBER, COUNTED ONCE ──
  // The menu said 36 while this page said "3 for you today, 74 lined up behind
  // them". Both were measuring the length of a list a `.limit()` had already cut,
  // and the menu's could never exceed forty however much work was waiting. They now
  // share one counter.
  it("counts the queue rather than measuring a trimmed list", () => {
    expect(route).toMatch(/const waiting = await countWaiting\(supabase, user\.id\)/);
    expect(route).toMatch(/const total = Math\.max\(waiting, items\.length\)/);
    const today = readFileSync(join(process.cwd(), "app/api/today/route.js"), "utf8");
    // The badge counts TODAY'S cards, not the pile: 78 beside a screen showing
    // three reads as seventy-eight things you are behind on.
    expect(today).toMatch(/out\.approvalsCount = Math\.min\(waiting, DAILY_CARDS\)/);
    expect(today).toMatch(/out\.approvalsWaiting = waiting/);
    // And the old cap-then-add is gone, not merely bypassed.
    expect(today).not.toMatch(/approvalsCount \+= Math\.min\(20/);
  });

  it("reports how many are waiting, and counts the whole queue in `count`", () => {
    // The bug this codebase keeps having is a number that quietly means something
    // other than its label. `count` is the queue; `backlog` is what is held back.
    expect(route).toMatch(/backlog/);
    expect(route).toMatch(/count: total,/);
  });

  it("tells the owner before they start, not only when they finish", () => {
    expect(page).toMatch(/for you today/);
    expect(page).toMatch(/lined up behind them/);
  });

  it("offers a way to carry on, so the cap is a pace and not a wall", () => {
    expect(page).toMatch(/Keep going/);
    expect(page).toMatch(/That is today's three/);
  });
});
