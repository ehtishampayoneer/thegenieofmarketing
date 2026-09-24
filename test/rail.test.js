import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const shell = readFileSync(join(ROOT, "components/shell/v2/OperatorShell.js"), "utf8");

// Everything between `const NAV = [` and its closing bracket, and the same for MORE.
function idsIn(name) {
  const start = shell.indexOf(`const ${name} = [`);
  const end = shell.indexOf("\n];", start);
  return [...shell.slice(start, end).matchAll(/id: "([a-z-]+)"/g)].map((m) => m[1]);
}
const primary = idsIn("NAV");
const more = idsIn("MORE");

// Twenty-four destinations was the reason a beginner could not tell what their
// job was. This is the one thing in the rebuild that a later "just add it to the
// rail" undoes in a single line, so it is pinned.
describe("the rail asks for six decisions, not twenty-four", () => {
  it("shows six, and they are the daily loop in order", () => {
    expect(primary).toEqual(["today", "approvals", "inbox", "strategy", "worklog", "connections"]);
  });

  it("calls them what they are to an owner, not what the route is called", () => {
    expect(shell).toMatch(/id: "inbox", label: "Leads"/);
    expect(shell).toMatch(/id: "connections", label: "Setup"/);
  });

  it("keeps everything else reachable rather than deleting it", () => {
    // The screens were never the problem. Being asked to choose between
    // twenty-four of them before breakfast was.
    for (const id of ["growth", "hunt", "prospects", "featured", "markets", "write", "team", "trust", "settings"]) {
      expect(more, id).toContain(id);
    }
    expect(more.length).toBeGreaterThan(15);
  });

  it("never lists the same destination twice", () => {
    const all = [...primary, ...more];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("the disclosure cannot strand anyone", () => {
  it("starts closed, and opens itself when you are already inside it", () => {
    expect(shell).toMatch(/useState\(\(\) => MORE_IDS\.has\(active\)\)/);
  });

  it("is a real button a keyboard can reach", () => {
    expect(shell).toMatch(/aria-expanded=\{moreOpen\}/);
  });
});

describe("every rail destination is a page that exists", () => {
  // The fallback in hrefFor is `/${id}`, so a typo here sends an owner to a 404
  // and the rail itself gives no clue. This walks the ids against the filesystem.
  const map = (() => {
    const start = shell.indexOf("function hrefFor(");
    const body = shell.slice(start, shell.indexOf("\n}", start));
    const out = {};
    for (const m of body.matchAll(/([a-z-]+): "(\/[a-z0-9/-]+)"/g)) out[m[1]] = m[2];
    return out;
  })();

  const pages = new Set(
    (function walk(dir, acc = []) {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p, acc);
        else if (n === "page.js") acc.push("/" + relative(join(ROOT, "app"), dir).split(sep).join("/"));
      }
      return acc;
    })(join(ROOT, "app"))
  );

  for (const id of [...primary, ...more]) {
    it(`${id} goes somewhere real`, () => {
      const href = map[id] || `/${id}`;
      expect(pages.has(href), `${id} → ${href} has no page`).toBe(true);
    });
  }
});
