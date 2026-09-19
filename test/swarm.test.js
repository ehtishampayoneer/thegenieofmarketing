import { describe, it, expect, vi, beforeEach } from "vitest";
import { simulate, buildCrowd, normDist } from "@/lib/swarm/sim";
import { rulesJudge, readJudgement, normalizeObjection, distAround, meanOf } from "@/lib/swarm/judge";
import { pickWinner, shiftDist, needsImprovement } from "@/lib/swarm/improve";
import { kindOf, crowdFor, fallbackCrowd } from "@/lib/swarm/crowd";

const buyers = fallbackCrowd({ targetCustomer: "furniture stores", whatTheySell: "AR product views" });

describe("the crowd", () => {
  it("is 1,000 individuals, gatekeepers included", () => {
    const people = buildCrowd(crowdFor(buyers, "reddit"), { seed: 3 });
    expect(people).toHaveLength(1000);
    expect(people.some((p) => p.gate)).toBe(true);
  });

  it("gives the same result for the same seed", () => {
    const arch = crowdFor(buyers, "email");
    const re = Object.fromEntries(arch.map((a) => [a.id, { dist: [0.1, 0.2, 0.3, 0.3, 0.1], objections: ["no proof"] }]));
    expect(simulate(arch, re, { seed: 9 })).toEqual(simulate(arch, re, { seed: 9 }));
  });

  it("scores a liked draft far above a disliked one, and lets complaints spread", () => {
    const arch = crowdFor(buyers, "social");
    const liked = Object.fromEntries(arch.map((a) => [a.id, { dist: [0, 0.05, 0.15, 0.4, 0.4], objections: [] }]));
    const disliked = Object.fromEntries(arch.map((a) => [a.id, { dist: [0.35, 0.4, 0.2, 0.05, 0], objections: ["sounds like an advert"] }]));
    const good = simulate(arch, liked, { seed: 1 });
    const bad = simulate(arch, disliked, { seed: 1 });
    expect(good.score).toBeGreaterThan(bad.score + 30);
    expect(bad.objections[0].tag).toBe("sounds like an advert");
    expect(bad.objections[0].count).toBeGreaterThan(100);
    expect(good.series).toHaveLength(13);
  });

  it("marks it blocked when the gatekeeper says no", () => {
    const arch = crowdFor(buyers, "reddit");
    const re = Object.fromEntries(arch.map((a) => [a.id, { dist: a.gate ? [0.9, 0.1, 0, 0, 0] : [0, 0.1, 0.3, 0.4, 0.2], objections: [] }]));
    expect(simulate(arch, re, { seed: 2 }).gate.blocked).toBe(true);
  });
});

describe("the judges", () => {
  it("the rules catch hype, pushiness and rule-breaking", () => {
    const r = rulesJudge("Revolutionary game-changing tool!!! BUY NOW at https://a.com and https://b.com", "reddit");
    expect(r.base).toBeLessThan(2);
    expect(r.objections).toEqual(expect.arrayContaining(["sounds like an advert", "too pushy", "breaks the community rules"]));
    const ok = rulesJudge("Hi Sam, I saw your roundup of AR tools for furniture stores. We cut returns by 23% for two retailers; happy to share the data if useful for the list.", "pitch");
    expect(ok.base).toBeGreaterThan(3);
  });

  it("groups complaints under plain labels", () => {
    expect(normalizeObjection("Feels like a sales pitch")).toBe("sounds like an advert");
    expect(normalizeObjection("Where is the evidence?")).toBe("no proof");
    expect(normalizeObjection("")).toBe(null);
  });

  it("reads the AI's reactions and keeps the rules in the room", () => {
    const people = buyers.slice(0, 3);
    const rules = rulesJudge("Plain helpful text about sofas in rooms.", "social");
    const j = readJudgement({ r: [{ id: "a1", d: [0, 0, 0, 0, 1], o: "price", q: "Nice" }] }, people, rules);
    expect(meanOf(j.reactions.a1.dist)).toBeGreaterThan(4);
    expect(meanOf(j.reactions.a1.dist)).toBeLessThan(5);           // rules still count
    expect(j.reactions.a1.objections[0]).toBe("price unclear or too high");
    expect(j.reactions.a2.dist).toEqual(distAround(rules.base, people[1].skeptic)); // unanswered -> rules
  });
});

describe("the improvers", () => {
  const panel = [{ id: "a1" }, { id: "a2" }, { id: "g1", gate: true }];
  it("pick a version only when it clearly beats the original", () => {
    const win = pickWinner({ s: [{ id: "a1", v: [2, 4, 3] }, { id: "a2", v: [2, 4, 2] }, { id: "g1", v: [3, 3, 2] }] }, panel, 2);
    expect(win.index).toBe(0);
    expect(win.gain).toBeGreaterThan(0.25);
    expect(pickWinner({ s: [{ id: "a1", v: [3, 3.1] }, { id: "a2", v: [3, 3.1] }] }, panel, 1).index).toBe(-1);
  });

  it("never pick a version the gatekeeper likes less", () => {
    const win = pickWinner({ s: [{ id: "a1", v: [2, 5] }, { id: "a2", v: [2, 5] }, { id: "g1", v: [3, 2] }] }, panel, 1);
    expect(win.index).toBe(-1);
  });

  it("move reactions up or down the scale", () => {
    const d = normDist([0.2, 0.2, 0.2, 0.2, 0.2]);
    expect(meanOf(shiftDist(d, 1))).toBeGreaterThan(meanOf(d));
    expect(meanOf(shiftDist(d, -0.5))).toBeLessThan(meanOf(d));
    expect(shiftDist(d, 0.7).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("step in when the crowd is lukewarm, blocked or turning", () => {
    expect(needsImprovement({ score: 50, backlash: 0 })).toBe(true);
    expect(needsImprovement({ score: 80, backlash: 0, gate: { blocked: true } })).toBe(true);
    expect(needsImprovement({ score: 80, backlash: 0 })).toBe(false);
  });
});

describe("what each item is", () => {
  it("knows the kind of every queued item", () => {
    expect(kindOf({ source: "placement", platform: "reddit" })).toBe("reddit");
    expect(kindOf({ source: "action", type: "media_outreach" })).toBe("pitch");
    expect(kindOf({ source: "action", type: "directory_submission" })).toBe("listing");
    expect(kindOf({ source: "action", type: "social_post", payload: { platform: "linkedin" } })).toBe("social");
    expect(kindOf({ source: "action", type: "recovery" })).toBe("winback");
  });
});

// ── A whole pass, with a fake database and a fake AI ─────────────────────────
const calls = { n: 0, down: false };
vi.mock("@/lib/ai-router", () => {
  class AllProvidersFailedError extends Error {}
  return {
    AllProvidersFailedError,
    freeProvidersReady: () => (calls.down ? [] : ["groq"]),
    callAI: async ({ prompt }) => {
      calls.n++;
      if (calls.down) throw new AllProvidersFailedError("down");
      if (prompt.includes("Describe 30 distinct kinds")) return { json: { people: Array.from({ length: 12 }, (_, i) => ({ name: `P${i}`, who: `Person ${i}`, skeptic: 0.5, weight: 3 })) } };
      if (prompt.includes("Rewrite it three different ways")) return { json: { variants: [{ text: "Hi Sam, a short, specific note with a real number: 23% fewer returns.", changed: "added proof" }] } };
      if (prompt.includes("rates each version")) {
        const ids = [...prompt.matchAll(/^(a\d+|g-[a-z]+):/gm)].map((m) => m[1]);
        return { json: { s: ids.map((id) => ({ id, v: [2, 4] })) } };
      }
      const ids = [...prompt.matchAll(/^(a\d+|g-[a-z]+):/gm)].map((m) => m[1]);
      return { json: { r: ids.map((id) => ({ id, d: [0.3, 0.4, 0.2, 0.1, 0], o: "no proof", q: "Where is the proof?" })) } };
    },
  };
});

const store = { actions: [], placements: [], events: [], scans: [] };
function fakeAdmin() {
  const q = (table) => {
    let rows = store[table] || [];
    const b = {
      select: () => b, order: () => b, limit: () => b,
      eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return b; },
      in: (c, vs) => { rows = rows.filter((r) => vs.includes(r[c])); return b; },
      maybeSingle: async () => ({ data: rows[0] || null }),
      then: (res) => res({ data: rows }),
      update: (patch) => ({ eq: (c, v) => ({ eq: async () => { for (const r of store[table]) if (r[c] === v) Object.assign(r, patch); return {}; } }) }),
      insert: async (row) => { store[table].push(...[].concat(row)); return {}; },
      upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    };
    return b;
  };
  return { from: q };
}

describe("a swarm pass", () => {
  beforeEach(() => {
    calls.n = 0; calls.down = false;
    store.actions = [{ id: "x1", user_id: "u1", type: "outreach_email", title: "Pitch to Home Tech", status: "proposed", created_at: "2026-09-19T00:00:00Z", target: { host: "arqr360.com" },
      payload: { body: "Our revolutionary AR tool is amazing! Buy now at https://arqr360.com" } }];
    store.placements = []; store.events = []; store.scans = [{ user_id: "u1", final_url: "https://arqr360.com", ai: { businessName: "ARQR" } }];
  });

  it("tests with the crowd, improves a weak draft, and saves both", async () => {
    const { tick } = await import("@/lib/swarm/engine");
    const r = await tick(fakeAdmin(), { budgetMs: 200000 });
    expect(r.tested).toBe(1);
    const a = store.actions[0];
    expect(a.payload.crowd.size).toBe(1000);
    expect(a.payload.crowd.mode).toBe("ai");
    expect(a.payload.crowd.improved).toBeTruthy();
    expect(a.payload.body).toContain("23% fewer returns");
    expect(a.payload.originalDraft).toContain("revolutionary");
    expect(store.events.map((e) => e.type)).toEqual(expect.arrayContaining(["swarm.crowd", "swarm.tested", "swarm.improved"]));
  });

  it("keeps testing with the rules when every free AI is down", async () => {
    calls.down = true;
    const { tick } = await import("@/lib/swarm/engine");
    const r = await tick(fakeAdmin(), { budgetMs: 200000 });
    expect(r.tested).toBe(1);
    expect(r.aiDown).toBe(true);
    expect(store.actions[0].payload.crowd.mode).toBe("rules");
    expect(store.actions[0].payload.crowd.size).toBe(1000);
    expect(calls.n).toBe(0);
  });
});

describe("the reality check", async () => {
  const { learnWeights, crowdLift, outcomeOfEmail, outcomeOfPlacement } = await import("@/lib/swarm/calibrate");

  it("reads real results", () => {
    expect(outcomeOfPlacement({ performance: "winning" })).toBe(1);
    expect(outcomeOfPlacement({ performance: "pending" })).toBe(null);
    expect(outcomeOfEmail({ status: "replied" })).toBe(1);
    expect(outcomeOfEmail({ status: "sent", sent_at: new Date(Date.now() - 20 * 864e5).toISOString() })).toBe(0);
    expect(outcomeOfEmail({ status: "sent", sent_at: new Date().toISOString() })).toBe(null); // still waiting
  });

  it("gives more say to people who liked what worked, less to those who liked the flops", () => {
    const outcomes = [
      { y: 1, am: { a1: 4.6, a2: 1.8 } },
      { y: 1, am: { a1: 4.2, a2: 2.0 } },
      { y: 0, am: { a1: 2.1, a2: 4.5 } },
      { y: 0, am: { a1: 1.9, a2: 4.4 } },
    ];
    const w = learnWeights(outcomes);
    expect(w.a1).toBeGreaterThan(1);
    expect(w.a2).toBeLessThan(1);
    expect(w.a1).toBeLessThanOrEqual(2);
    expect(w.a2).toBeGreaterThanOrEqual(0.5);
  });

  it("says plainly whether the crowd is predicting well", () => {
    expect(crowdLift([{ score: 80, y: 1 }]).verdict).toBe("learning");
    const good = [90, 85, 80, 30, 25, 20].map((score, i) => ({ score, y: i < 3 ? 1 : 0 }));
    expect(crowdLift(good).verdict).toBe("predictive");
    const bad = [90, 85, 80, 30, 25, 20].map((score, i) => ({ score, y: i < 3 ? 0 : 1 }));
    expect(crowdLift(bad).verdict).toBe("wrong");
  });
});
