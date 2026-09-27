// test/schema-manifest.test.js
// ── THE SELF-TEST'S DATABASE CHECK IS ONLY AS GOOD AS ITS LIST ──
//
// The "Database tables and columns" self-test row probes the owner's live
// database for every column the code reads. It reads that list from
// lib/schema-manifest.js, which a script generates — and which only stayed
// current when someone remembered to re-run the script after changing a query.
//
// On 27 Sep it was found stale: three real columns the code reads on
// directory_contacts were not being probed, so a database missing them would have
// passed its own health check while the contact finder quietly returned nothing.
// Regenerating it also exposed the generator reading `market:payload->>market` —
// an alias for a field inside a JSON column — as a column called "market", which
// would have turned the self-test red over a column that should not exist.
//
// This runs the generator in check mode, so the suite fails the moment the list
// falls behind the code.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { SCHEMA_MANIFEST } from "@/lib/schema-manifest";

describe("the database check probes what the code actually reads", () => {
  it("the committed list matches what the code reads today", () => {
    const r = spawnSync(process.execPath, ["scripts/gen-schema-manifest.mjs", "--check"], { encoding: "utf8" });
    expect(r.status, (r.stderr || r.stdout || "").trim()).toBe(0);
  });

  it("an alias is not mistaken for a column", () => {
    // `market:payload->>market` reads a field inside `payload`; there is no
    // actions.market, and probing for one would fail the owner's self-test.
    expect(SCHEMA_MANIFEST.actions).not.toContain("market");
    expect(SCHEMA_MANIFEST.actions).toContain("payload");
  });

  it("the contact finder's columns are probed", () => {
    for (const c of ["email_type", "source", "status"]) expect(SCHEMA_MANIFEST.directory_contacts).toContain(c);
  });
});
