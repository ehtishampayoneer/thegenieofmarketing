import { describe, it, expect } from "vitest";
import { climbFrom } from "@/lib/keyword-health";

// This drives the "Your climb on Google" chart, which makes a factual claim about
// the owner's rankings ("▲ 12 places gained"). In search, a LOWER position number is
// better, so the sign of `delta` is easy to get backwards — these lock it down.
describe("climbFrom — portfolio rank climb", () => {
  const series = {
    "buy sofa online": [
      { date: "2026-08-01", position: 40, clicks: 1 },
      { date: "2026-08-02", position: 30, clicks: 3 },
    ],
    "modern sectional": [
      { date: "2026-08-01", position: 60, clicks: 0 },
      { date: "2026-08-02", position: 50, clicks: 2 },
    ],
  };

  it("averages position across keywords per day", () => {
    const c = climbFrom(series);
    expect(c.points.map((p) => p.position)).toEqual([50, 40]); // (40+60)/2, (30+50)/2
  });

  it("reports improvement as a POSITIVE delta when position falls", () => {
    expect(climbFrom(series).delta).toBe(10); // 50 → 40 is 10 places gained
  });

  it("reports a slide as a negative delta", () => {
    const worse = { a: [{ date: "2026-08-01", position: 10 }, { date: "2026-08-02", position: 25 }] };
    expect(climbFrom(worse).delta).toBe(-15);
  });

  it("sums clicks across the window", () => {
    expect(climbFrom(series).clicks).toBe(6);
  });

  it("returns null rather than inventing a curve from one day", () => {
    expect(climbFrom({ a: [{ date: "2026-08-01", position: 12 }] })).toBe(null);
  });

  it("returns null when there is no position data at all", () => {
    expect(climbFrom({ a: [{ date: "2026-08-01", clicks: 5 }] })).toBe(null);
    expect(climbFrom({})).toBe(null);
    expect(climbFrom(null)).toBe(null);
  });

  it("orders days chronologically regardless of input order", () => {
    const jumbled = { a: [{ date: "2026-08-03", position: 20 }, { date: "2026-08-01", position: 40 }] };
    const c = climbFrom(jumbled);
    expect(c.points[0].date).toBe("2026-08-01");
    expect(c.delta).toBe(20);
  });
});
