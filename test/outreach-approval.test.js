import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The gate that decides whether a cold email leaves the owner's own mailbox
// without them having seen it. Everything here is about the default being safe.
vi.mock("@/lib/publish-guard", () => ({
  guardContent: vi.fn(async () => ({ decision: "publish", confidence: 95, flags: [] })),
}));
vi.mock("@/lib/growth-memory", () => ({ recordDecision: vi.fn(async () => {}) }));

const { decideExecution } = await import("@/lib/autonomy");
const { guardContent } = await import("@/lib/publish-guard");

// A Supabase stand-in that returns whatever trust events the test wants.
// getEvents awaits the query builder itself rather than a final call, so the
// builder has to be thenable — every method returns it, and awaiting resolves.
function db(events = []) {
  const q = {
    select: () => q, eq: () => q, gte: () => q, in: () => q,
    order: () => q, limit: () => q,
    then: (resolve) => resolve({ data: events }),
  };
  return { from: () => q };
}
const ctx = { userId: "u1", host: "arqr360.com", channel: "email", content: "Subject\n\nHello there." };

beforeEach(() => { guardContent.mockResolvedValue({ decision: "publish", confidence: 95, flags: [] }); });
afterEach(() => { vi.clearAllMocks(); });

describe("does an outreach email send by itself?", () => {
  it("no — a fresh account holds it for approval, however good the draft is", async () => {
    const d = await decideExecution(db([]), ctx);
    expect(d.execute).toBe(false);
    expect(d.mode).toBe("review");
    expect(d.reason).toMatch(/not auto/);
  });

  it("only once the owner has granted the email channel autonomy", async () => {
    const granted = [{ type: "trust.set", data: { channel: "email", level: "auto" }, created_at: new Date().toISOString() }];
    const d = await decideExecution(db(granted), ctx);
    expect(d.execute).toBe(true);
    expect(d.trust).toBe("auto");
  });

  it("autonomy granted for a different channel does not unlock email", async () => {
    const other = [{ type: "trust.set", data: { channel: "blog", level: "auto" }, created_at: new Date().toISOString() }];
    expect((await decideExecution(db(other), ctx)).execute).toBe(false);
  });

  it("and even then the content guard can still stop it", async () => {
    const granted = [{ type: "trust.set", data: { channel: "email", level: "auto" }, created_at: new Date().toISOString() }];
    guardContent.mockResolvedValue({ decision: "hold", confidence: 95, flags: ["risky"] });
    const d = await decideExecution(db(granted), ctx);
    expect(d.execute).toBe(false);
    expect(d.reason).toMatch(/content guard/);
  });

  it("and a shaky draft is held even when the guard says publish", async () => {
    const granted = [{ type: "trust.set", data: { channel: "email", level: "auto" }, created_at: new Date().toISOString() }];
    guardContent.mockResolvedValue({ decision: "publish", confidence: 62, flags: [] });
    const d = await decideExecution(db(granted), ctx);
    expect(d.execute).toBe(false);
    expect(d.reason).toMatch(/confidence 62/);
  });

  it("holds when the trust lookup itself fails, rather than assuming the best", async () => {
    const broken = { from() { throw new Error("db down"); } };
    expect((await decideExecution(broken, ctx)).execute).toBe(false);
  });
});
