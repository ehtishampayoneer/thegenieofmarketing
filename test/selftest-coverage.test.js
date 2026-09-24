import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHECKS, CHECK_INDEX } from "@/lib/selftest";

const src = readFileSync(join(process.cwd(), "lib/selftest.js"), "utf8");

// ── WHY THIS EXISTS ──
// Every engine in the rebuild got a unit test, and eight of them got no row in the
// live self-test. A unit test proves a function is right against a fake database.
// Only the self-test proves the engine is REACHED, with the real plan and the real
// data — which is the failure this project keeps having: a module that works and is
// wired to nothing. So the rebuild's engines are pinned here by name.
//
// Adding an engine? Add its check to lib/selftest.js and its module here. If a
// check genuinely cannot run live, say why in a comment rather than deleting the
// line, the way test/one-brain.test.js handles its exemptions.
const ENGINES = {
  "lib/brain.js": "brain",
  "lib/strategy-store.js": "plan",
  "lib/platform-detect.js": "platform",
  "lib/contact-source.js": "contacts-safe",
  "lib/role-fit.js": "contacts-safe",
  "lib/audience.js": "contacts-safe",
  "lib/sending-ramp.js": "ramp",
  "lib/followup.js": "followups",
  "lib/lookalike.js": "lookalike",
  "lib/owner-signal.js": "owner-signal",
};

describe("every engine in the rebuild is checked against live data", () => {
  for (const [module, id] of Object.entries(ENGINES)) {
    it(`${module} is exercised by the "${id}" check`, () => {
      expect(CHECK_INDEX[id], `no check with id "${id}"`).toBeTruthy();
      const spec = module.replace(/^lib\//, "@/lib/").replace(/\.js$/, "");
      expect(src.includes(`import("${spec}")`), `lib/selftest.js never imports ${spec}`).toBe(true);
    });
  }

  it("keeps every check the shape the runner expects", () => {
    for (const c of CHECKS) {
      expect(typeof c.id, JSON.stringify(c.label)).toBe("string");
      expect(typeof c.group).toBe("string");
      expect(typeof c.label).toBe("string");
      expect(typeof c.run).toBe("function");
    }
  });

  it("never lists the same check twice", () => {
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts the plan before the engines that read it, because a reader works down the page", () => {
    const groups = [];
    for (const c of CHECKS) if (!groups.includes(c.group)) groups.push(c.group);
    expect(groups.indexOf("The plan")).toBeLessThan(groups.indexOf("Finding customers"));
    expect(groups.indexOf("The plan")).toBeLessThan(groups.indexOf("Outreach and website"));
  });

  it("tells the owner what to do about a failure, not just that there was one", () => {
    // A fail() with no second argument is a dead end for someone who is not a
    // developer: the row goes red and says nothing they can act on.
    for (const c of CHECKS) {
      for (const args of callsTo(String(c.run), "fail(")) {
        expect(topLevelComma(args), `${c.id} calls fail() with no fix: fail(${args.slice(0, 60)}…)`).toBe(true);
      }
    }
  });
});


// ── THE HALF OF "RUN THE SELF-TEST" THAT CAN RUN HERE ──
// The real thing needs the live keys and a signed-in session. What can be proved
// locally is that no check throws — because a check that throws is the one outcome
// the page cannot explain to an owner, and an empty account is the state every
// new owner is in on day one.
describe("no check crashes on a brand-new, empty account", () => {
  // Every query chains and resolves to nothing found, the way a fresh account reads.
  function stubDb() {
    const res = { data: [], count: 0, error: null };
    const q = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") return (resolve) => resolve(res);
        if (prop === "maybeSingle" || prop === "single") return async () => ({ data: null, error: null });
        return () => q;
      },
    });
    return { from: () => q };
  }

  const NEW = ["plan", "brain", "platform", "contacts-safe", "ramp", "followups", "lookalike", "owner-signal"];

  for (const id of NEW) {
    it(`${id} answers instead of throwing`, async () => {
      const fetch0 = globalThis.fetch;
      globalThis.fetch = async () => { throw new Error("offline in tests"); };
      try {
        const r = await CHECK_INDEX[id].run(
          { supabase: stubDb(), userId: "u1", host: "example.com", ai: {}, profile: {} },
          { origin: "https://example.test" }
        );
        expect(["pass", "warn", "fail", "skip"], `${id} returned ${JSON.stringify(r)}`).toContain(r?.status);
        expect(typeof r.summary).toBe("string");
        expect(r.summary.length).toBeGreaterThan(0);
        // A red or amber row an owner cannot act on is a dead end.
        if (r.status !== "pass") expect(typeof r.fix === "string" || r.fix === undefined).toBe(true);
      } finally {
        globalThis.fetch = fetch0;
      }
    });
  }
});

// The argument text of each call to `name`, found by counting brackets so a `)`
// inside a template literal does not end the call early.
function callsTo(src, name) {
  const out = [];
  let i = src.indexOf(name);
  while (i !== -1) {
    let depth = 0, j = i + name.length - 1;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") { depth--; if (depth === 0) break; }
    }
    out.push(src.slice(i + name.length, j));
    i = src.indexOf(name, j);
  }
  return out;
}

// Is there a comma in `args` that belongs to the call itself rather than to
// something nested inside one of its arguments?
function topLevelComma(args) {
  let depth = 0;
  for (const ch of args) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) return true;
  }
  return false;
}
