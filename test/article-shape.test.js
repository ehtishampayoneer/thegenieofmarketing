import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { articleShape, shapeReason, writeBudgetMs, clampReason, DEFAULT_FUNCTION_SECONDS } from "@/lib/article-shape";

// What each job WANTS is a separate question from what the host allows, and these
// first blocks are about what it wants. Asserting them on Hobby's 60 seconds would
// be asserting the workaround and losing the intent — so the budget is opened up
// here, and the clamping has its own block below.
beforeAll(() => { process.env.FUNCTION_MAX_SECONDS = "300"; });
afterAll(() => { delete process.env.FUNCTION_MAX_SECONDS; });

describe("how long an article should be depends on the job it is doing", () => {
  it("keeps a question page short, because assistants quote the clearest answer", () => {
    const s = articleShape({ stage: "problem", competition: 30 });
    expect(s.shape).toBe("answer");
    expect(s.max).toBe(1000);
    expect(s.brief).toMatch(/Short deliberately/);
    // The failure mode for an answer page is burying the quotable sentence.
    expect(s.brief).toMatch(/padding buries the sentence/);
  });

  it("treats an AI-search gap as an answer whatever its stage says", () => {
    expect(articleShape({ source: "aeo", stage: "learn" }).shape).toBe("answer");
  });

  it("gives a comparison room to cover both sides", () => {
    const s = articleShape({ stage: "compare", competition: 40 });
    expect(s.shape).toBe("comparison");
    expect(s.min).toBe(1200);
    // A comparison that flatters one side convinces nobody.
    expect(s.brief).toMatch(/where a competitor is genuinely the better choice/);
  });

  it("writes long for a competitive search, because page one already is", () => {
    const s = articleShape({ stage: "buy", competition: 75 });
    expect(s.shape).toBe("deep");
    expect(s.min).toBe(1500);
    expect(s.max).toBe(2200);
  });

  it("does not write long just because the search is commercial", () => {
    // An easy commercial keyword does not need 2,000 words to win.
    expect(articleShape({ stage: "buy", competition: 20 }).shape).toBe("guide");
  });

  it("defaults sensibly for anything unexpected", () => {
    for (const p of [undefined, null, {}, { stage: "nonsense" }, { competition: "abc" }]) {
      const s = articleShape(p);
      expect(s.shape, JSON.stringify(p)).toBe("guide");
      expect(s.min).toBe(1000);
    }
  });

  it("gives every shape a real token budget and time to finish", () => {
    for (const p of [{ stage: "problem" }, { stage: "compare" }, { stage: "buy", competition: 80 }, {}]) {
      const s = articleShape(p);
      // Roughly 1.4 tokens a word, plus the title, meta and FAQ around it.
      expect(s.maxTokens).toBeGreaterThan(s.max * 1.4);
      expect(s.timeoutMs).toBeGreaterThanOrEqual(45000);
      // The route's budget is 120s and the social pass after this takes up to 40,
      // so no single shape may ask for more than 70 or there is no room to start.
      expect(s.timeoutMs, s.shape).toBeLessThanOrEqual(70000);
    }
  });
});

describe("length is a ceiling, never a quota", () => {
  // The one instruction that has to survive every future edit. A word count with
  // no ceiling rule makes a model pad, and padding makes an article worse in
  // every direction at once.
  it("every shape tells the writer it may stop early", () => {
    for (const p of [{ stage: "problem" }, { stage: "compare" }, { stage: "buy", competition: 80 }, {}]) {
      const s = articleShape(p);
      expect(s.brief, s.shape).toMatch(/shorter|stop|finish|Stop/);
    }
  });

  it("the prompt says it out loud, for every article and not only keyword ones", () => {
    const route = readFileSync(join(process.cwd(), "app/api/content/route.js"), "utf8");
    expect(route).toMatch(/A LENGTH IS A CEILING, NOT A QUOTA/);
    // It has to sit with the JSON spec, which every article goes through — not
    // inside the branch that only runs when a keyword was picked.
    const ceiling = route.indexOf("A LENGTH IS A CEILING");
    const jsonSpec = route.indexOf("Write a complete, ready-to-publish blog article");
    expect(ceiling).toBeLessThan(jsonSpec);
    expect(jsonSpec - ceiling).toBeLessThan(600);
  });

  it("no single hardcoded length survives in the content engine", () => {
    const route = readFileSync(join(process.cwd(), "app/api/content/route.js"), "utf8");
    expect(route).not.toMatch(/600-900 words/);
  });
});

describe("the choice is explainable", () => {
  it("says why in a sentence a non-technical owner can read", () => {
    expect(shapeReason("answer")).toMatch(/AI assistants/);
    expect(shapeReason("deep", { competition: 75 })).toMatch(/competitive \(75\/100\)/);
    expect(shapeReason("comparison")).toMatch(/one-sided comparison convinces nobody/);
    expect(shapeReason("guide")).toMatch(/no longer/);
  });
});

// ── WHAT THE HOST ALLOWS ──
// Vercel Hobby stops any function at 60 seconds whatever maxDuration declares. A
// deep article asked the model for 70, so on Hobby it was killed mid-sentence and
// the article was lost after the writer-grade model had already been paid for it.
// One AI call needing 70 seconds cannot run in a 60-second function, so the shapes
// are clamped to the host — deliberately, and reversibly.
describe("an article is shortened to fit the host, and lengthens again when it can", () => {
  const at = (secs, fn) => {
    const before = process.env.FUNCTION_MAX_SECONDS;
    process.env.FUNCTION_MAX_SECONDS = secs;
    try { return fn(); } finally {
      if (before === undefined) delete process.env.FUNCTION_MAX_SECONDS;
      else process.env.FUNCTION_MAX_SECONDS = before;
    }
  };

  it("assumes the free plan when nothing says otherwise", () => {
    expect(DEFAULT_FUNCTION_SECONDS).toBe(60);
    const before = process.env.FUNCTION_MAX_SECONDS;
    delete process.env.FUNCTION_MAX_SECONDS;
    try {
      expect(writeBudgetMs()).toBeLessThan(60000);
      expect(articleShape({ stage: "buy", competition: 80 }).clamped).toBe(true);
    } finally { if (before !== undefined) process.env.FUNCTION_MAX_SECONDS = before; }
  });

  it("never asks for more writing time than the function has", () => {
    at("60", () => {
      for (const p of [{ source: "aeo" }, { stage: "compare" }, { stage: "buy", competition: 80 }, { stage: "learn", competition: 10 }]) {
        const s = articleShape(p);
        expect(s.timeoutMs, s.shape).toBeLessThanOrEqual(writeBudgetMs());
        expect(s.timeoutMs + 12000, s.shape).toBeLessThanOrEqual(60000);
      }
    });
  });

  it("shortens the words with the clock, because a deadline alone just truncates", () => {
    at("60", () => {
      const deep = articleShape({ stage: "buy", competition: 80 });
      expect(deep.clamped).toBe(true);
      expect(deep.max).toBeLessThan(2200);
      expect(deep.min).toBeGreaterThanOrEqual(600);
      expect(deep.max).toBeGreaterThan(deep.min);
      // And the brief carries the new number, never both.
      expect(deep.brief).toMatch(new RegExp(`${deep.min.toLocaleString()} to ${deep.max.toLocaleString()} words`));
      expect(deep.brief).not.toMatch(/1,500 to 2,200/);
    });
  });

  it("leaves a short answer page alone, because it already fits", () => {
    at("60", () => {
      const a = articleShape({ source: "aeo" });
      expect(a.clamped).toBe(false);
      expect(a.max).toBe(1000);
    });
  });

  it("gives the full length back on a bigger plan, with no code change", () => {
    at("300", () => {
      const deep = articleShape({ stage: "buy", competition: 80 });
      expect(deep.clamped).toBe(false);
      expect(deep.min).toBe(1500);
      expect(deep.max).toBe(2200);
    });
  });

  it("still ranks the four kinds in the same order once shortened", () => {
    at("60", () => {
      const answer = articleShape({ source: "aeo" }).max;
      const guide = articleShape({ stage: "learn", competition: 10 }).max;
      const deep = articleShape({ stage: "buy", competition: 80 }).max;
      expect(guide).toBeGreaterThan(answer - 1);
      expect(deep).toBeGreaterThan(guide);
    });
  });

  it("explains a shortened article rather than leaving the owner to wonder", () => {
    at("60", () => {
      expect(clampReason(articleShape({ stage: "buy", competition: 80 }))).toMatch(/stopped at 60 seconds/);
    });
    at("300", () => {
      expect(clampReason(articleShape({ stage: "buy", competition: 80 }))).toBe("");
    });
    expect(clampReason(null)).toBe("");
  });

  it("ignores a nonsense limit rather than producing a nonsense article", () => {
    for (const bad of ["0", "-5", "abc", ""]) {
      at(bad, () => { expect(writeBudgetMs()).toBe(48000); });
    }
  });
});
