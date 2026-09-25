import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// ── THE INVARIANT ──
// Every engine that writes for a business reads the SAME understanding of that
// business. Not the scan, not the interview prose, not its own private prompt:
// the brain (lib/brain.js), which resolves the stored plan and falls back to the
// owner's brief when there is no plan yet.
//
// This test exists because the product drifted into fifteen separate programs
// once already. The strategy layer was wired into eight engines; three radars
// kept pasting raw prose and re-deciding what the business was, and nine more —
// the pillar builder, the page refresher, the spreader, the reply drafter, the
// listing writer, the sharpener, the suggester, the community planner and Market
// Testing — wrote customer-facing text with no business context at all. Nothing
// failed. The articles simply argued one thing and the replies another.
//
// So a new engine that calls a model now has two honest options: read the brain,
// or be named below with the reason it does not need to. There is no third
// option where it quietly invents its own read of the business.

const ROOT = process.cwd();

// Reads the brain directly, or is handed the plan by whoever calls it.
const READS_BRAIN = /genieBrain|brainPromptBlock|brainBlock|strategyPromptBlock|strategyBlock|getStrategy/;

// An engine is exempt only for a reason that stays true. The reason is the point:
// it is what a future reader checks against before adding a line here.
const EXEMPT = {
  "lib/ai-router.js": "is the router itself — it carries other engines' prompts, it never writes one",
  "lib/selftest.js": "exercises the providers with fixed probes; a business plan would tell it nothing",
  "lib/verdict.js": "the public, signed-out visibility check — there is no account, so there is no plan",
  "lib/factcheck.js": "checks claims that are already in a draft against the draft; it adds nothing",
  "lib/self-repair.js": "rewrites sentences the brain already wrote, and is forbidden from adding a fact — its whole job is to say LESS than the draft claimed. Handing it the plan would invite it to write toward the strategy instead of minimally correcting four sentences, and every replacement is verified against the same rules that flagged the original",
  "lib/interview.js": "conducts the interview the plan is DRAWN FROM, so it cannot require one",
  "lib/video.js": "transcribes and times what was said out loud; it writes no marketing",
  "lib/local-services.js": "returns service-area facts, not copy",
  "lib/followup.js": "writes the second and third email from the plan its caller already resolved, which it takes as `plan` — the route reads the brain once and hands the same block to the first email and the follow-ups, so both argue the same thing",
  "lib/brain-learn.js": "is the one engine that writes TO the plan, so it reads the stored plan's raw fields and shows them to the model as the thing being corrected; the brain's block is formatted for engines that write, and feeding it back here would have the model rewrite its own instructions",
  // Handed the plan by their caller, which does read the brain. Asserted below.
  "lib/prospects.js": "receives the plan as userBusiness.brief from /api/prospects/discover",
  "lib/earned-media.js": "receives the plan as business.brief from /api/featured/discover",
  "lib/email-engine.js": "receives the plan as business.brief from /api/outreach/campaign",
  "lib/ai-search.js": "measures whether real models name the business, which must stay independent of our own plan; its questions are passed in from /api/ai-search",
  "app/api/audit/route.js": "reads a website and reports what is on it; it is what the plan is built from",
  "app/api/understand/route.js": "captures the owner's corrections to the understanding the plan is drawn from",
  "app/api/engagement/route.js": "classifies how a posted item performed; it writes nothing",
  // Dead V1 routes. Nothing in the app calls them; asserted below so that if one
  // is ever revived, this test makes it justify itself.
  "app/api/cadence/route.js": "retired V1 route, unreferenced",
  "app/api/chat/route.js": "retired V1 route, unreferenced (the live one is /api/genie/chat)",
  "app/api/distribute/route.js": "retired V1 route, unreferenced",
  "app/api/growth/route.js": "retired V1 route, unreferenced",
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, "app", "api")), ...walk(join(ROOT, "lib"))]
  .map((p) => ({ rel: relative(ROOT, p).split(sep).join("/"), src: readFileSync(p, "utf8") }))
  .filter((f) => /callAI\s*\(/.test(f.src));

describe("one brain, not fifteen programs", () => {
  it("found the engines that call a model", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("every engine that calls a model reads the brain, or is exempt with a reason", () => {
    const offenders = files
      .filter((f) => !READS_BRAIN.test(f.src) && !EXEMPT[f.rel])
      .map((f) => f.rel);

    expect(offenders, [
      "",
      "These engines call a model without reading the shared understanding of the",
      "business, so each one decides for itself what the business is:",
      ...offenders.map((o) => `  - ${o}`),
      "",
      "Fix: import { genieBrain } from \"@/lib/brain\", await it once, and put its",
      "`block` in the prompt. If the engine genuinely does not need a business plan,",
      "add it to EXEMPT in this file with the reason.",
      "",
    ].join("\n")).toEqual([]);
  });

  it("no engine is exempt for a reason nobody wrote down", () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${file} needs a real reason`).toBeGreaterThan(20);
    }
  });

  it("the exempt list has no stale entries", () => {
    const seen = new Set(files.map((f) => f.rel));
    const stale = Object.keys(EXEMPT).filter((f) => !seen.has(f));
    expect(stale, `no longer call a model, so they do not need exempting: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("the libs that are handed the plan really are handed it", () => {
  const cases = [
    ["app/api/prospects/discover/route.js", "lib/prospects.js"],
    ["app/api/featured/discover/route.js", "lib/earned-media.js"],
    ["app/api/outreach/campaign/route.js", "lib/email-engine.js"],
    ["app/api/ai-search/route.js", "lib/ai-search.js"],
    ["app/api/outreach/campaign/route.js", "lib/followup.js"],
  ];
  for (const [caller, lib] of cases) {
    it(`${caller} reads the brain on behalf of ${lib}`, () => {
      const src = readFileSync(join(ROOT, caller), "utf8");
      expect(READS_BRAIN.test(src), `${caller} must read the plan, because ${lib} cannot`).toBe(true);
    });
  }
});

describe("the retired routes really are retired", () => {
  const dead = ["cadence", "chat", "distribute", "growth"];
  const app = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))]
    .filter((p) => !relative(ROOT, p).split(sep).join("/").startsWith("app/api/"))
    .map((p) => readFileSync(p, "utf8"))
    .join("\n");
  for (const name of dead) {
    it(`nothing calls /api/${name}`, () => {
      // Exempted as unreferenced V1 leftovers. If a screen starts calling one, it
      // is live again and has to read the brain like everything else.
      expect(new RegExp(`["'\`]/api/${name}["'\`?]`).test(app)).toBe(false);
    });
  }
});
