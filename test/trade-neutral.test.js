import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// ── GENIE IS NOT ONE CUSTOMER'S TOOL ──
// ARQR is the first business to run on Genie and must never be the business Genie
// is shaped around. The danger is not a comment or a test fixture — it is a real
// value that steers an engine: an example inside a prompt, a hardcoded niche, a
// category list with one trade in it.
//
// The one that was real: the prompt that writes EVERY owner's plan carried a
// worked example of the AR business Genie was built alongside. An example is the
// strongest instruction in a prompt, so every plan for every trade leaned that way.
const ROOT = process.cwd();
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next" || n.startsWith(".git")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (n.endsWith(".js")) acc.push(p);
  }
  return acc;
}

// Comments explain; they do not steer. Judge only the lines that are not one.
// (A regex strip was the obvious way and quietly missed every line with a trailing
// carriage return, which in this repo is all of them.)
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .filter((l) => { const t = l.trim(); return t && !t.startsWith("//") && !t.startsWith("*"); })
    .join("\n");
}

const TRADE = /\b(furniture|sofa|couch|rug|carpet|arqr)\b/i;

describe("no engine is shaped around the first customer's trade", () => {
  const files = [...walk(join(ROOT, "lib")), ...walk(join(ROOT, "app"))];

  // Where naming a trade is the job, not a bias.
  const ALLOWED = {
    "lib/intent-verticals.js": "a list of 22 trades, of which furniture is one — the list IS the feature",
    "lib/launch-places.js": "one of seven category matchers, same reason",
    "lib/selftest.js": "a fixed probe and a fallback niche for an account with no scan yet",
    "lib/wikidata.js": "the doc comment's worked query",
    "lib/claim-rules.js": "an example of a specific sentence versus a vague one",
    "lib/buyer-angle.js": "worked examples of the search-phrase shape",
    "lib/business-brief.js": "an example of what merging two segments must not lose",
  };

  for (const f of files) {
    const rel = relative(ROOT, f).split(sep).join("/");
    it(`${rel} does not steer on one trade`, () => {
      const hits = code(readFileSync(f, "utf8")).split("\n").filter((l) => TRADE.test(l));
      if (!hits.length) return;
      expect(ALLOWED[rel], `${rel} names a trade in live code:\n  ${hits.slice(0, 3).join("\n  ")}`).toBeTruthy();
    });
  }
});

describe("the prompt that writes every plan", () => {
  const strategy = readFileSync(join(ROOT, "lib/strategy.js"), "utf8");

  it("shows examples from trades this product has no customer in", () => {
    expect(strategy).toMatch(/payroll software to accountancy practices/);
    expect(strategy).toMatch(/fitting commercial kitchens for restaurants/);
  });

  it("shows more than one, so neither reads as the template", () => {
    expect(strategy).toMatch(/TWO worked examples/);
  });

  it("no longer carries the business Genie was built alongside", () => {
    expect(code(strategy)).not.toMatch(TRADE);
  });

  it("says why, so nobody helpfully puts a familiar example back", () => {
    expect(strategy).toMatch(/An example is the strongest instruction/);
  });
});
