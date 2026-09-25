import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const example = readFileSync(join(ROOT, ".env.example"), "utf8");
const lines = example.split(/\r?\n/).map((l) => l.trim());

// ── WHY THIS EXISTS ──
// .env.example is the only place an owner can find out what Genie needs. It had
// drifted: ten variables the code reads were not in it, including HEARTBEAT_SECRET
// (without which the crowd only runs once a night) and FUNCTION_MAX_SECONDS (which
// decides how long every article is allowed to be). A setup file that is missing
// the switch you need is worse than no setup file, because you stop looking.
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next" || n.startsWith(".git")) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(js|jsx|ts|tsx)$/.test(n)) acc.push(p);
  }
  return acc;
}

const read = new Set();
for (const f of [...walk(join(ROOT, "lib")), ...walk(join(ROOT, "app"))]) {
  for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z0-9_]{3,})/g)) read.add(m[1]);
}

// Set by the platform, not by the owner — there is nothing for them to do.
const PLATFORM = new Set([
  "NODE_ENV", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_REGION",
  "VERCEL_GIT_COMMIT_SHA", "VERCEL_PROJECT_PRODUCTION_URL", "CI", "PORT", "NEXT_RUNTIME",
]);

describe("everything Genie reads from the environment is written down", () => {
  const missing = [...read].filter((v) => !PLATFORM.has(v) && !example.includes(v)).sort();

  it("leaves nothing for the owner to discover by reading the source", () => {
    expect(missing, `add these to .env.example: ${missing.join(", ")}`).toEqual([]);
  });

  it("found enough variables to be a real check", () => {
    // If a refactor ever breaks the scan, this fails rather than passing vacuously.
    expect(read.size).toBeGreaterThan(30);
  });

  it("names the paid key exactly as the code reads it", () => {
    const assigned = (name) => lines.some((l) => l.replace(/^#\s*/, "").startsWith(`${name}=`));
    expect(assigned("PAID_LLM_API_KEY")).toBe(true);
    // No LINE may assign the shorter name — nothing reads it, so a setup that used
    // it would look done and change nothing. Prose warning against it is welcome.
    expect(assigned("PAID_LLM_KEY")).toBe(false);
  });

  it("says what happens when an optional one is left unset", () => {
    // "UNSET:" is this file's convention for the honest consequence of skipping it.
    for (const v of ["CRON_SECRET", "WRITER_PROVIDERS", "HEARTBEAT_SECRET", "FUNCTION_MAX_SECONDS"]) {
      // The ASSIGNMENT's line, not the first mention of the name in prose above it.
      const at = lines.findIndex((l) => l.replace(/^#\s*/, "").startsWith(`${v}=`));
      expect(at, `${v} is never assigned in .env.example`).toBeGreaterThan(-1);
      const above = lines.slice(Math.max(0, at - 14), at).join(" ");
      expect(above, `${v} has no UNSET note above it`).toMatch(/UNSET:/);
    }
  });
});
