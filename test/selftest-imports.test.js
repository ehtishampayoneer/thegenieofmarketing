import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── WHY THIS EXISTS ──
// lib/selftest.js imports what each check needs INSIDE the check, on purpose: one
// broken module then fails one row instead of the whole page. The cost of that
// design is that a misspelled module path or a renamed export is invisible until
// the owner runs the self-test on the live site and sees a row fail for a reason
// that has nothing to do with their business.
//
// The self-test cannot run here — it needs the real keys and a signed-in session.
// This runs the half that can: every module a check imports resolves, and every
// name it destructures off that module actually exists.
const src = readFileSync(join(process.cwd(), "lib/selftest.js"), "utf8");

// `const { a, b } = await import("@/lib/x")` and bare `await import("@/lib/x")`.
const named = [...src.matchAll(/const \{([^}]+)\} = await import\("([^"]+)"\)/g)]
  .map((m) => ({ spec: m[2], names: m[1].split(",").map((n) => n.trim().split(":")[0].trim()).filter(Boolean) }));
const bare = [...src.matchAll(/await import\("([^"]+)"\)/g)].map((m) => m[1]);

const wanted = new Map();
for (const s of bare) if (!wanted.has(s)) wanted.set(s, new Set());
for (const { spec, names } of named) for (const n of names) wanted.get(spec)?.add(n);

describe("every module the self-test reaches for is really there", () => {
  it("finds imports to check at all, so a rewrite cannot quietly empty this test", () => {
    expect(wanted.size).toBeGreaterThan(25);
  });

  for (const [spec, names] of wanted) {
    it(`${spec} resolves${names.size ? ` and exports ${[...names].join(", ")}` : ""}`, async () => {
      const mod = await import(spec);
      for (const n of names) expect(typeof mod[n], `${spec} has no export "${n}"`).not.toBe("undefined");
    });
  }
});
