import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isFirstImpression, weakNote, FIRST_ITEMS, WEAK_SCORE } from "@/lib/swarm/first-impression";

// A counting query: .select(..., {count}).eq().eq() then awaited.
function db(count) {
  const q = { select: () => q, eq: () => q, then: (resolve) => resolve({ count }) };
  return { from: () => q };
}

describe("is this account still inside its first impression", () => {
  it("says yes until the fourth item has been tested", async () => {
    expect(FIRST_ITEMS).toBe(4);
    for (const n of [0, 1, 3]) expect(await isFirstImpression(db(n), "u1"), String(n)).toBe(true);
    for (const n of [4, 5, 90]) expect(await isFirstImpression(db(n), "u1"), String(n)).toBe(false);
  });

  it("guesses yes when it cannot tell, because the wrong guess is cheap one way", async () => {
    // One extra AI call against one ruined account is not a close call.
    const dead = { from() { throw new Error("db down"); } };
    expect(await isFirstImpression(dead, "u1")).toBe(true);
    expect(await isFirstImpression(null, "u1")).toBe(true);
    expect(await isFirstImpression(db(0), null)).toBe(true);
    expect(await isFirstImpression(db(null), "u1")).toBe(true);
  });
});

describe("what the card says about a weak draft", () => {
  it("says nothing when the draft is fine, so a warning is never unearned", () => {
    expect(weakNote({ score: 72 })).toBe("");
    expect(weakNote({ score: WEAK_SCORE })).toBe("");
    expect(weakNote(null)).toBe("");
    expect(weakNote({ score: "not a number" })).toBe("");
    expect(weakNote({})).toBe("");
  });

  it("tells the owner to read it, and what the objection was", () => {
    const n = weakNote({ score: 41, objections: [{ text: "Sounds like every other agency email" }] });
    expect(n).toMatch(/Read it properly/);
    expect(n).toMatch(/every other agency email/);
  });

  it("admits it already tried, when it already tried", () => {
    expect(weakNote({ score: 41 }, { first: true })).toMatch(/Genie rewrote this/);
    expect(weakNote({ score: 41 }, { first: false })).not.toMatch(/rewrote/);
  });

  it("stays a sentence, not a wall", () => {
    const n = weakNote({ score: 10, objections: [{ text: "x".repeat(500) }] });
    expect(n.length).toBeLessThan(260);
  });
});

describe("it forces the rewrite, and it hides nothing", () => {
  const engine = readFileSync(join(process.cwd(), "lib/swarm/engine.js"), "utf8");
  const card = readFileSync(join(process.cwd(), "app/approvals/page.js"), "utf8");

  it("asks the improvers to run on the first few instead of waiting to be asked", () => {
    expect(engine).toMatch(/const first = await isFirstImpression\(admin, userId\)/);
    expect(engine).toMatch(/improve: first \|\| rewritten \? true : "auto"/);
  });

  it("never skips, holds, or deletes an item because it scored low", () => {
    // The rule this codebase already paid for: a new terminal state needs a
    // screen in the same change. So there is no new state — only a label.
    const body = engine.slice(engine.indexOf("export async function testItem"), engine.indexOf("async function save("));
    expect(body).not.toMatch(/weakNote[\s\S]{0,200}(continue|return null|skip)/);
    expect(body).toMatch(/if \(note\) crowd\.weakNote = note;/);
  });

  it("puts the note where the owner is already looking", () => {
    expect(card).toMatch(/crowd\.weakNote/);
  });
});
