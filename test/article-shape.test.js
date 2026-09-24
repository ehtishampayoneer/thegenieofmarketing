import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { articleShape, shapeReason } from "@/lib/article-shape";

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
