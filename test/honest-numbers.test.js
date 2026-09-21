import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");

// Every number on Today claims to be counted from real work — the page says so
// in as many words. Each of these was read off the activity log instead, by
// verb or by a regex over the message text, and that log is written by every
// engine for every kind of work. None was invented; none counted what its
// label said. From the owner's side those are the same thing.
describe("Today counts the thing it names", () => {
  const src = read("app/api/today/route.js");

  it("counts articles from the blog, not from log lines saying 'published'", () => {
    expect(src).toMatch(/published_pages".*?status", "published"/s);
    expect(src).not.toMatch(/const published = a\.filter/);
  });

  it("counts buyers from the rows Buyer Hunt lists", () => {
    expect(src).toMatch(/buyer_intent: true/);
  });

  it("counts email that was sent, and replies that came back", () => {
    expect(src).toMatch(/outreach_log".*?"sent"/s);
    expect(src).toMatch(/replied_at/);
    // /repl/i used to match a reply Genie DRAFTED.
    expect(src).not.toMatch(/has\(\/repl\/i\)/);
  });

  it("counts a ranking improvement as a position that actually improved", () => {
    expect(src).toMatch(/keyword_history/);
    expect(src).not.toMatch(/has\(\/rank\|position\|climb\|traction\/i\)/);
  });

  it("no longer reads any stat off the activity log", () => {
    expect(src).not.toMatch(/const has = \(re\)/);
  });
});

describe("nothing forecasts work that has not started", () => {
  it("Growth shows no timeline until a keyword has a real target", () => {
    const src = read("app/growth/page.js");
    expect(src).not.toMatch(/target\?\.days \|\| 30/);
    expect(src).not.toMatch(/\.sort\(\(a, b\) => a - b\)\[0\] \|\| 12/);
  });

  it("the launch test calls its crowd simulated, like every other surface", () => {
    expect(read("components/team/LaunchTest.js")).toMatch(/1,000 simulated customers reading it/);
  });
});

describe("the live ticker shows real work only", () => {
  const src = read("components/shell/v2/OperatorShell.js");
  // Comments explaining what was removed still quote it, so read the code.
  const code = src.replace(/^\s*\/\/.*$/gm, "");

  it("no longer invents activity for a business Genie has not started on", () => {
    // These sat in the LIVE bar at the top of every page, in the same type as
    // real activity, for accounts where none of it had happened.
    expect(code).not.toMatch(/Built your keyword strategy, 5 targets/);
    expect(code).not.toMatch(/6 AI-search gaps found, plans drafted/);
    expect(code).not.toMatch(/name you in 0 of 6 buyer answers/);
    expect(code).not.toMatch(/Publishing content to Reddit in 2 min/);
    expect(code).not.toMatch(/FALLBACK_TICKER/);
  });

  it("says nothing has happened yet instead", () => {
    expect(code).toMatch(/Nothing yet — Genie's first run fills this/);
  });
});
