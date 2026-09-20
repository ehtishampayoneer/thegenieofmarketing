import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getValidAccessToken } from "@/lib/google";

// A fake Supabase that records what got written, so the test can check that a
// dead connection is announced exactly once a day and that a working one is not.
function fakeDb({ events = [] } = {}) {
  const writes = { events: [], activity: [], connections: [] };
  const seenKeys = new Set();
  const api = {
    from(table) {
      const q = {
        _rows: table === "events" ? events : [],
        select() { return q; },
        eq() { return q; },
        order() { return q; },
        limit() { return Promise.resolve({ data: q._rows }); },
        insert(row) { writes[table]?.push(row); return { select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "x" } }) }) }; },
        update(patch) { writes.connections.push(patch); return { eq: () => Promise.resolve({}) }; },
        upsert(row) {
          // Mirrors Postgres: a repeated dedupe_key inserts nothing and returns no row.
          const dup = seenKeys.has(row.dedupe_key);
          if (!dup) { seenKeys.add(row.dedupe_key); writes.events.push(row); }
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: dup ? null : { id: "e1" } }) }) };
        },
      };
      return q;
    },
    writes,
  };
  return api;
}

const conn = { id: "c1", user_id: "u1", provider: "google", refresh_token: "r", access_token: "old", token_expires_at: new Date(0).toISOString() };

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("a Google connection that stops working", () => {
  it("tells the owner and returns null instead of exploding into 31 silent catches", async () => {
    fetch.mockResolvedValue({ ok: false, text: async () => '{"error":"invalid_grant"}' });
    const db = fakeDb();
    const token = await getValidAccessToken(db, conn);
    expect(token).toBeNull();
    expect(db.writes.events.map((e) => e.type)).toContain("connection.broken");
    expect(db.writes.activity[0].message).toMatch(/disconnected/i);
  });

  it("says it once a day, not once per call, however many engines ask", async () => {
    fetch.mockResolvedValue({ ok: false, text: async () => '{"error":"invalid_grant"}' });
    const db = fakeDb();
    for (let i = 0; i < 5; i++) await getValidAccessToken(db, conn);
    expect(db.writes.events.filter((e) => e.type === "connection.broken")).toHaveLength(1);
    expect(db.writes.activity).toHaveLength(1);
  });

  it("treats a Google outage as an outage, so one bad night is not read as revoked", async () => {
    fetch.mockResolvedValue({ ok: false, text: async () => "backend error" });
    const db = fakeDb();
    await expect(getValidAccessToken(db, conn)).rejects.toThrow(/Token refresh failed/);
    expect(db.writes.events).toHaveLength(0);
    expect(db.writes.activity).toHaveLength(0);
  });

  it("clears the alarm when the owner reconnects", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ access_token: "new", expires_in: 3600 }) });
    const db = fakeDb({ events: [{ id: "b1", type: "connection.broken", created_at: new Date().toISOString(), data: { provider: "google" } }] });
    const token = await getValidAccessToken(db, conn);
    expect(token).toBe("new");
    expect(db.writes.events.map((e) => e.type)).toContain("connection.restored");
  });

  it("says nothing at all while the connection is healthy", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ access_token: "new", expires_in: 3600 }) });
    const db = fakeDb();
    await getValidAccessToken(db, conn);
    expect(db.writes.events).toHaveLength(0);
    expect(db.writes.activity).toHaveLength(0);
  });

  it("does not call Google at all while the current token is still valid", async () => {
    const db = fakeDb();
    const fresh = { ...conn, token_expires_at: new Date(Date.now() + 600000).toISOString() };
    expect(await getValidAccessToken(db, fresh)).toBe("old");
    expect(fetch).not.toHaveBeenCalled();
  });
});
