import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/activity", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/events", () => ({ recordEvent: vi.fn(async () => {}) }));

const { recoverStuckActions } = await import("@/lib/stuck");
const { logActivity } = await import("@/lib/activity");

// A Supabase stand-in holding one stuck action and, optionally, the page that
// proves the publish actually landed.
function db({ stuck = [], page = null } = {}) {
  const updates = [];
  const api = {
    updates,
    from(table) {
      const q = {
        _table: table,
        select() { return q; }, eq() { return q; }, lt() { return q; },
        limit() { return table === "actions" ? Promise.resolve({ data: stuck }) : q; },
        maybeSingle() { return Promise.resolve({ data: page }); },
        update(patch) { updates.push({ table, patch }); return { eq: () => ({ eq: () => Promise.resolve({}) }) }; },
      };
      return q;
    },
  };
  return api;
}

const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const action = { id: "a1", type: "article", title: "Why sofas come back", target: { host: "arqr360.com" }, updated_at: old };

describe("work that stopped halfway", () => {
  it("comes back to Approvals instead of vanishing", async () => {
    const d = db({ stuck: [action] });
    const out = await recoverStuckActions(d, { userId: "u1" });
    expect(out.recovered).toBe(1);
    const back = d.updates.find((u) => u.table === "actions");
    expect(back.patch.status).toBe("proposed");
    // And the owner is told, because a draft that silently reappears is its own
    // kind of confusing.
    expect(logActivity).toHaveBeenCalled();
    expect(logActivity.mock.calls[0][2].message).toMatch(/didn't finish/i);
  });

  it("is marked done, not republished, when the page actually went live", async () => {
    // The publish landed and only the status update was lost. Retrying would
    // give the owner two copies of the same article.
    const d = db({ stuck: [action], page: { id: "p1", handle: "arqr360.com", slug: "why-sofas-come-back", status: "published" } });
    const out = await recoverStuckActions(d, { userId: "u1" });
    expect(out.completed).toBe(1);
    expect(out.recovered).toBe(0);
    expect(d.updates[0].patch.status).toBe("done");
    expect(d.updates[0].patch.result.recovered).toBe(true);
  });

  it("leaves work that is legitimately still running alone", async () => {
    const d = db({ stuck: [] });
    expect(await recoverStuckActions(d, { userId: "u1" })).toEqual({ recovered: 0, completed: 0 });
    expect(d.updates).toHaveLength(0);
  });

  it("never throws, because it runs inside the nightly job and the queue", async () => {
    const broken = { from() { throw new Error("db down"); } };
    expect(await recoverStuckActions(broken, { userId: "u1" })).toEqual({ recovered: 0, completed: 0 });
    expect(await recoverStuckActions(null, {})).toEqual({ recovered: 0, completed: 0 });
  });
});
