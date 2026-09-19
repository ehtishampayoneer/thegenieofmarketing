import { describe, it, expect } from "vitest";
import { tickerFrom, tapeFrom } from "@/lib/swarm/ticker";

const tested = [{
  id: "e1", subject: "Launch test: Why AR cuts furniture returns", created_at: "2026-09-20T10:00:00Z",
  data: {
    kind: "article", score: 71, size: 1000, mode: "ai", act: 38,
    objections: [{ tag: "no proof", count: 312 }, { tag: "price unclear or too high", count: 96 }],
    quotes: [{ who: "Sceptical store owner", q: "Every AR tool says this. Where are the numbers?" }],
    blocked: null,
  },
}];
const improved = [{
  id: "e2", subject: "Why AR cuts furniture returns", created_at: "2026-09-20T10:01:00Z",
  data: { itemId: "i1", kind: "article", from: 58, to: 71, tickets: ["no proof"], changed: "Added the 27% returns figure in the opening line" },
}];
const activity = [{ id: "a1", verb: "published", message: "Published to arqr360.com/blog", created_at: "2026-09-20T09:30:00Z" }];

describe("the floor", () => {
  it("turns one test into the result, what they argued about, and what they said", () => {
    const rows = tickerFrom({ tested, improved: [], activity: [] });
    expect(rows.map((r) => r.kind)).toEqual(["result", "argument", "argument", "quote"]);
    expect(rows[0].text).toContain("1,000 read");
    expect(rows[0].value).toBe("71/100");
    expect(rows[1].text).toBe("312 of 1,000 said: no proof");
    expect(rows[3].who).toBe("Sceptical store owner");
    // The subject is shown as the owner wrote it, without Genie's own prefix.
    expect(rows[0].text).not.toContain("Launch test:");
  });

  it("puts every team in one stream, newest first, and shows the improvers' move", () => {
    const rows = tickerFrom({ tested, improved, activity });
    expect(rows[0].team).toBe("improvers");
    expect(rows[0].delta).toBe("+13");
    expect(rows[0].text).toContain("Proof & trust");
    expect(rows[rows.length - 1].team).toBe("doers");
    const times = rows.map((r) => Date.parse(r.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("says a quick check is a quick check", () => {
    const [row] = tickerFrom({ tested: [{ ...tested[0], data: { ...tested[0].data, mode: "rules" } }] });
    expect(row.sub).toContain("Quick check");
  });

  it("makes a tape of scores with the gain as the move", () => {
    const tape = tapeFrom({ tested: [{ ...tested[0], data: { ...tested[0].data, itemId: "i1" } }], improved });
    expect(tape[0]).toMatchObject({ label: "ARTICLE", score: 71, move: "+13", tone: "up" });
  });

  it("is empty when the teams have not run, rather than filled in", () => {
    expect(tickerFrom({})).toEqual([]);
    expect(tapeFrom({})).toEqual([]);
  });
});
