import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Every nav entry must lead to a page that exists. hrefFor used to fall back to
// "/today" for any id missing from its map, so adding "The plan" to the nav and
// forgetting the map entry sent the owner silently to Today — a dead link that
// looked like a working one.
const src = readFileSync(join(process.cwd(), "components/shell/v2/OperatorShell.js"), "utf8");

function routeFor(id) {
  const map = src.match(/function hrefFor\(id\) \{[\s\S]*?\n\}/)[0];
  const pairs = Object.fromEntries([...map.matchAll(/"?([a-zA-Z-]+)"?:\s*"(\/[^"]*)"/g)].map((m) => [m[1], m[2]]));
  return pairs[id] || `/${id}`;
}

describe("the left navigation", () => {
  const ids = [...src.matchAll(/\{ id: "([a-z-]+)"/g)].map((m) => m[1]);

  it("has entries", () => expect(ids.length).toBeGreaterThan(20));

  for (const id of ids) {
    it(`"${id}" leads to a real page`, () => {
      const route = routeFor(id);
      expect(existsSync(join(process.cwd(), "app", route.slice(1), "page.js"))).toBe(true);
    });
  }

  it("does not send unknown ids to Today, which hides the mistake", () => {
    expect(src).not.toMatch(/return map\[id\] \|\| "\/today"/);
  });
});
