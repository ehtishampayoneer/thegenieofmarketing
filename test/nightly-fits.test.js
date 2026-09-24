import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeClock, functionLimitMs, DEFAULT_FUNCTION_SECONDS } from "@/lib/function-limit";

const jobs = readFileSync(join(process.cwd(), "lib/genie-jobs.js"), "utf8");

// ── WHY THIS EXISTS ──
// `export const maxDuration = 300` is a request, not a guarantee: Vercel Hobby stops
// any function at 60 seconds whatever it declares, with no error and no log. The
// nightly orchestrator declared 300 and then awaited sixteen engine routes with
// waits of up to 100 seconds each. On Hobby it was killed part-way down that list,
// so the radars, Get featured, the listings, the learning run, the notifications and
// the search-health checks never ran at all — every night, silently.
//
// Each of those engines is its own route with its own invocation, so waiting bought
// nothing but the risk. They are started and let go. The work that has no route of
// its own is guarded by a clock and, when it will not fit, skipped BY NAME into the
// ledger — because a step that is skipped and named can be fixed.
describe("the nightly run fits the function it is given", () => {
  it("does not wait for engines that have their own invocation", () => {
    expect(jobs).toMatch(/async function fire\(url, body\)/);
    // Long enough that a cold platform accepts all dozen, short enough that the
    // cost of the whole hand-off is seconds rather than minutes.
    expect(jobs).toMatch(/const HANDOFF_MS = 4000;/);
    for (const route of ["/api/outreach/campaign", "/api/content", "/api/radar/intent", "/api/radar/reddit", "/api/radar/quora", "/api/radar/web", "/api/ai-search", "/api/engagement", "/api/notifications", "/api/learn", "/api/search-health", "/api/featured/discover", "/api/swarm/tick"]) {
      expect(jobs.includes("fire(`${appUrl}" + route + "`"), `${route} is still awaited`).toBe(true);
    }
  });

  it("no longer holds a hundred-second wait anywhere", () => {
    expect(jobs).not.toMatch(/const WAIT = /);
    expect(jobs).not.toMatch(/, 100000\)/);
  });

  it("still waits for the one call everything else depends on", () => {
    // Every engine works from keywords. Dispatching sixteen of them with nothing to
    // work from is worse than leaving the entity for tomorrow.
    expect(jobs).toMatch(/call\(`\$\{appUrl\}\/api\/keywords`[\s\S]{0,120}clock\.left\(\)/);
  });

  it("asks the clock before each in-process step, and names what it skipped", () => {
    expect(jobs).toMatch(/const clock = makeClock\(8000\)/);
    expect(jobs).toMatch(/if \(!clock\.room\(ms\)\) \{ skipped\.push\(name\); return; \}/);
    for (const name of ["spread", "listings", "escalate", "pillar", "gsc-setup", "site-check", "calibrate", "plan-revision"]) {
      expect(jobs.includes(`step("${name}"`), name).toBe(true);
    }
  });

  it("always records that the run happened, whatever else was skipped", () => {
    // A run nothing can see is worse than a short one, so time is reserved for it.
    expect(jobs).toMatch(/makeClock\(8000\)/);
    expect(jobs).toMatch(/type: "system\.run\.done"/);
    expect(jobs).toMatch(/data: metrics,/);
    expect(jobs).toMatch(/skipped,/);
  });

  it("recovers stuck work before anything that can be skipped", () => {
    expect(jobs.indexOf("recoverStuckActions")).toBeLessThan(jobs.indexOf('step("gsc-setup"'));
  });

  it("stops reporting a number that can no longer mean what it says", () => {
    // `staged` was a before/after count of Approvals. Nothing is awaited now, so the
    // engines are still running when it would be read — it would always say zero.
    expect(jobs).not.toMatch(/const staged = Math\.max/);
    expect(jobs).toMatch(/dispatched, retired, escalated, pillared, proposed,/);
  });
});

describe("the clock itself", () => {
  const env = process.env.FUNCTION_MAX_SECONDS;
  beforeEach(() => { delete process.env.FUNCTION_MAX_SECONDS; });
  afterEach(() => { if (env === undefined) delete process.env.FUNCTION_MAX_SECONDS; else process.env.FUNCTION_MAX_SECONDS = env; });

  it("assumes the free plan, which is the one that bites", () => {
    expect(DEFAULT_FUNCTION_SECONDS).toBe(60);
    expect(functionLimitMs()).toBe(60000);
  });

  it("reads a bigger plan when one is set, and ignores nonsense", () => {
    process.env.FUNCTION_MAX_SECONDS = "300";
    expect(functionLimitMs()).toBe(300000);
    for (const bad of ["", "abc", "0", "-1", "5"]) {
      process.env.FUNCTION_MAX_SECONDS = bad;
      expect(functionLimitMs(), bad).toBe(60000);
    }
  });

  it("holds back what the caller reserved", () => {
    const c = makeClock(8000);
    expect(c.left()).toBeLessThanOrEqual(52000);
    expect(c.left()).toBeGreaterThan(50000);
    expect(c.room(40000)).toBe(true);
    expect(c.room(60000)).toBe(false);
    expect(c.elapsed()).toBeGreaterThanOrEqual(0);
  });
});

describe("the crowd stops itself inside the real limit, not the declared one", () => {
  const engine = readFileSync(join(process.cwd(), "lib/swarm/engine.js"), "utf8");
  const route = readFileSync(join(process.cwd(), "app/api/swarm/tick/route.js"), "utf8");

  it("no longer hard-codes a budget that assumes a paid plan", () => {
    expect(engine).not.toMatch(/budgetMs = 230000/);
    expect(route).not.toMatch(/budgetMs: 230000/);
    expect(engine).toMatch(/functionLimitMs\(\) - 10000/);
    expect(route).toMatch(/functionLimitMs\(\) - 10000/);
  });

  it("still lets a caller pass its own budget", () => {
    expect(engine).toMatch(/Number\(budgetMs\) > 0 \? Number\(budgetMs\)/);
  });
});

// ── AND THE OWNER IS TOLD ──
// This codebase has a standing rule, paid for by an article that vanished for a
// fortnight into a status no screen displayed: a new terminal state needs a surface
// in the same change. "Skipped for time" is a new state, so it gets one.
describe("a skipped step is shown, not only recorded", () => {
  const api = readFileSync(join(process.cwd(), "app/api/today/route.js"), "utf8");
  const page = readFileSync(join(process.cwd(), "app/today/page.js"), "utf8");

  it("comes out of the ledger and into the response", () => {
    expect(api).toMatch(/out\.lastRunSkipped = Array\.isArray\(sk\) \? sk\.slice\(0, 8\) : \[\]/);
  });

  it("reaches the screen", () => {
    expect(page).toMatch(/d\?\.lastRunSkipped\?\.length > 0/);
  });

  it("says it in words an owner uses, not the step name in the code", () => {
    for (const name of ["spread", "listings", "escalate", "pillar", "gsc-setup", "site-check", "calibrate", "plan-revision"]) {
      expect(page.includes(`${/^[a-z]+$/.test(name) ? name : `"${name}"`}:`), name).toBe(true);
    }
    expect(page).toMatch(/function skipLabel\(name\)/);
    expect(page).not.toMatch(/ran out of time for[\s\S]{0,40}plan-revision/);
  });

  it("does not call it a fault, because it is not one", () => {
    expect(page).toMatch(/hosting plan&apos;s time limit, not a fault/);
    expect(page).toMatch(/Everything else ran/);
  });

  it("says nothing at all on a night that fitted", () => {
    // An empty array must render nothing, or every owner gets a warning forever.
    expect(page).toMatch(/lastRunSkipped\?\.length > 0 && \(/);
  });
});
