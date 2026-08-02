import { describe, it, expect } from "vitest";
import { checkScaledContent } from "@/lib/publish-guard";

// Google's scaled-content-abuse policy is the existential risk for a product whose
// core loop is "publish an article every day". If this gate is wrong, a client's
// whole site can be penalised — so it gets real tests.

const words = (n, seed = "furniture room sofa buying guide space living") => {
  const w = seed.split(" ");
  return Array.from({ length: n }, (_, i) => w[i % w.length] + (i % 7 === 0 ? ` ${i}` : "")).join(" ");
};

// Minimal supabase stub: only the query shape checkScaledContent uses.
const stubDb = (rows) => ({
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({ limit: async () => ({ data: rows }) }),
        }),
      }),
    }),
  }),
});

describe("scaled-content guard", () => {
  it("flags thin content", async () => {
    const r = await checkScaledContent(null, { body: "Buy our sofas. They are nice." });
    expect(r.thin).toBe(true);
    expect(r.words).toBeLessThan(300);
  });

  it("does not flag a substantial article as thin", async () => {
    const r = await checkScaledContent(null, { body: words(400) });
    expect(r.thin).toBe(false);
  });

  it("catches a near-duplicate of an earlier article", async () => {
    const body = words(400);
    const db = stubDb([{ title: "Sofa Buying Guide", payload: { title: "Sofa Buying Guide", body } }]);
    const r = await checkScaledContent(db, { userId: "u1", title: "A New Title", body });
    expect(r.duplicateOf).toBe("Sofa Buying Guide");
    expect(r.similarity).toBeGreaterThan(0.5);
  });

  it("catches an exact title repeat immediately", async () => {
    const db = stubDb([{ title: "Same Title", payload: { title: "Same Title", body: words(400) } }]);
    const r = await checkScaledContent(db, { userId: "u1", title: "Same Title", body: words(400, "totally other words entirely different topic here") });
    expect(r.duplicateOf).toBe("Same Title");
  });

  it("allows genuinely different articles", async () => {
    const db = stubDb([{ title: "Sofas", payload: { title: "Sofas", body: words(400, "sofa couch seating upholstery fabric cushion frame") } }]);
    const r = await checkScaledContent(db, { userId: "u1", title: "Rugs", body: words(400, "rug carpet weave wool pile underlay stain") });
    expect(r.duplicateOf).toBe(null);
    expect(r.similarity).toBeLessThan(0.5);
  });

  it("never throws when the database is unavailable", async () => {
    const broken = { from: () => { throw new Error("db down"); } };
    const r = await checkScaledContent(broken, { userId: "u1", body: words(400) });
    expect(r.duplicateOf).toBe(null);
    expect(r.thin).toBe(false);
  });
});
