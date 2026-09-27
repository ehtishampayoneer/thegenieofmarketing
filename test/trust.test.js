// test/trust.test.js
// ── UNATTENDED SENDING IS SWITCHED ON BY THE OWNER, NEVER BY GENIE ──
//
// "auto" is the level at which Genie acts on the outside world with nobody
// looking: for email, cold messages leaving the owner's own Gmail every night.
// It used to be reached automatically, by a rule broken twice over — wins were
// counted from any channel, so one social post doing well could have unlocked
// unattended email; and every win was saved without a user id, so none was ever
// found. The second bug was the only thing stopping the first.

import { describe, it, expect } from "vitest";
import { getTrustLevel, earnedTrust } from "@/lib/trust";

// A fake Supabase holding a fixed set of events, filtered the way lib/events does.
function fakeDb(events) {
  const q = (rows) => {
    const chain = {
      _rows: rows,
      select() { return chain; },
      eq(col, v) { chain._rows = chain._rows.filter((r) => r[col] === v); return chain; },
      in(col, vs) { chain._rows = chain._rows.filter((r) => vs.includes(r[col])); return chain; },
      gte() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      // lib/events.js calls .limit() early and awaits the query at the end, so
      // the chain itself has to be awaitable — as Supabase's query builder is.
      then(resolve, reject) { return Promise.resolve({ data: chain._rows, error: null }).then(resolve, reject); },
    };
    return chain;
  };
  return { from: () => q(events.map((e) => ({ user_id: "u", host: null, ...e }))) };
}
const approvals = (n, channel = "email") => Array.from({ length: n }, () => ({ type: "decision.approval", data: { channel } }));

describe("what Genie can earn", () => {
  it("six email approvals and a real reply make it ELIGIBLE", async () => {
    const db = fakeDb([...approvals(6), { type: "outreach.reply", data: {} }]);
    const e = await earnedTrust(db, { userId: "u", channel: "email" });
    expect(e.eligibleForAuto).toBe(true);
    expect(e.wins).toBe(1);
  });

  it("but eligibility never switches unattended sending on by itself", async () => {
    const db = fakeDb([...approvals(20), { type: "outreach.reply", data: {} }, { type: "outreach.reply", data: {} }]);
    expect(await getTrustLevel(db, { userId: "u", channel: "email" })).toBe("assisted");
  });

  it("a win on another channel does not count toward email", async () => {
    // The failure this guards against: one social post doing well unlocking email.
    const db = fakeDb([...approvals(6), { type: "outcome.recorded", data: { outcome: "winning", platform: "x" } }]);
    const e = await earnedTrust(db, { userId: "u", channel: "email" });
    expect(e.wins).toBe(0);
    expect(e.eligibleForAuto).toBe(false);
  });

  it("assisted still comes from approvals, as before", async () => {
    expect(await getTrustLevel(fakeDb(approvals(3)), { userId: "u", channel: "email" })).toBe("assisted");
    expect(await getTrustLevel(fakeDb(approvals(2)), { userId: "u", channel: "email" })).toBe("review");
  });
});

describe("only the owner switches it on", () => {
  it("an explicit choice in the Trust Center is honoured", async () => {
    const db = fakeDb([{ type: "trust.set", data: { channel: "email", level: "auto" } }]);
    expect(await getTrustLevel(db, { userId: "u", channel: "email" })).toBe("auto");
  });

  it("and so is turning it back off, whatever was earned", async () => {
    const db = fakeDb([...approvals(20), { type: "outreach.reply", data: {} }, { type: "trust.set", data: { channel: "email", level: "review" } }]);
    expect(await getTrustLevel(db, { userId: "u", channel: "email" })).toBe("review");
  });
});
