import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const router = readFileSync(join(process.cwd(), "lib/ai-router.js"), "utf8");
const content = readFileSync(join(process.cwd(), "app/api/content/route.js"), "utf8");

// ── WHY THIS EXISTS ──
// `timeoutMs` is PER PROVIDER, and the router tries several in order. That is right
// for reliability and it silently breaks the caller's arithmetic: a route that has
// 48 seconds for writing and passes timeoutMs: 48000 can spend 48 on a provider
// that hung, start the next one anyway, and be killed by the host at 60 having
// produced nothing. "Fits in 60 seconds" was true of one attempt and false of the
// call. A deadline is what makes it true of the call.
describe("the router stops when the time is gone, instead of starting an attempt it cannot finish", () => {
  it("takes a wall clock for the whole call, not just each provider", () => {
    expect(router).toMatch(/deadlineMs = null,/);
    expect(router).toMatch(/const hardDeadline =/);
  });

  it("gives each attempt only the time that is actually left", () => {
    expect(router).toMatch(/attemptMs = Math\.min\(timeoutMs, left\)/);
    expect(router).toMatch(/timeoutMs: attemptMs/);
  });

  it("stops rather than burning the remainder on an attempt that must fail", () => {
    expect(router).toMatch(/skipped: "out_of_time"/);
    expect(router).toMatch(/if \(left < MIN_ATTEMPT_MS\)/);
    // break, not continue: every later provider has even less time.
    const block = router.slice(router.indexOf("out_of_time"), router.indexOf("out_of_time") + 400);
    expect(block).toMatch(/\bbreak;/);
  });

  it("says so in the log, because a skipped provider is not a failed one", () => {
    expect(router).toMatch(/ai\.skip\.deadline/);
  });

  it("changes nothing for the callers that pass no deadline", () => {
    // Every existing caller must behave exactly as before.
    expect(router).toMatch(/deadlineMs\) > 0\s*\?[\s\S]{0,80}: null/);
  });
});

describe("the content route spends a clock it actually has", () => {
  it("measures from its own start instead of trusting maxDuration", () => {
    expect(content).toMatch(/const routeStarted = Date\.now\(\)/);
    expect(content).toMatch(/const msLeft = \(\) => functionLimitMs\(\)/);
  });

  it("caps the writing stage at whichever is smaller — the shape or the time left", () => {
    expect(content).toMatch(/deadlineMs: Math\.min\(shape\.timeoutMs, Math\.max\(0, msLeft\(\)\)\)/);
  });

  it("skips the social pass rather than dying in it, now the article is already saved", () => {
    expect(content).toMatch(/const socialBudget = Math\.min\(40000, Math\.max\(0, msLeft\(\) - 8000\)\)/);
    expect(content).toMatch(/socialBudget >= 8000/);
  });

  it("reports a skip as a skip, not as a failure", () => {
    // "the posts failed" and "there was no time for the posts" need different fixes.
    expect(content).toMatch(/socialSkippedForTime/);
    expect(content).toMatch(/content\.social_skipped_no_time/);
    expect(content).toMatch(/socialFailed, socialSkippedForTime,/);
  });

  it("says in the response whether the article was shortened to fit the plan", () => {
    expect(content).toMatch(/shortened: !!shapeUsed\?\.clamped/);
  });
});
