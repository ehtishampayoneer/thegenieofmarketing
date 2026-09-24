import { describe, it, expect } from "vitest";
import { repliedProfile, lookalikeNiche, lookalikeNote, MIN_REPLIES } from "@/lib/lookalike";

// Two tables, read in order: the send log, then the directory.
function db({ replies = [], contacts = [] } = {}) {
  let call = 0;
  const q = {
    select: () => q, eq: () => q, not: () => q, in: () => q, limit: () => q,
    then: (resolve) => resolve({ data: call++ === 0 ? replies : contacts }),
  };
  return { from: () => q };
}
const reply = (email) => ({ contact_email: email, replied_at: new Date().toISOString() });
const contact = (email, industry, domain = "x.com", email_type = "role") => ({ email, industry, domain, email_type, company: "" });

describe("what the people who replied have in common", () => {
  it("says nothing on a single reply, because one is an anecdote", async () => {
    const p = await repliedProfile(db({ replies: [reply("a@x.com")], contacts: [contact("a@x.com", "rug retailers")] }), { userId: "u1" });
    expect(p.total).toBe(1);
    expect(p.industries).toEqual([]);
    expect(MIN_REPLIES).toBe(2);
  });

  it("finds the pattern once there are two", async () => {
    const p = await repliedProfile(db({
      replies: [reply("a@x.co.uk"), reply("b@y.co.uk")],
      contacts: [contact("a@x.co.uk", "rug retailers", "x.co.uk"), contact("b@y.co.uk", "rug retailers", "y.co.uk")],
    }), { userId: "u1" });
    expect(p.total).toBe(2);
    expect(p.industries[0]).toEqual({ name: "rug retailers", n: 2 });
    expect(p.countries[0]).toEqual({ name: "United Kingdom", n: 2 });
  });

  it("reads a country only where the address actually says one", async () => {
    // .com says nothing, and guessing would narrow a list on a coin flip.
    const p = await repliedProfile(db({
      replies: [reply("a@x.com"), reply("b@y.com")],
      contacts: [contact("a@x.com", "rug retailers", "x.com"), contact("b@y.com", "rug retailers", "y.com")],
    }), { userId: "u1" });
    expect(p.countries).toEqual([]);
  });

  it("returns an empty shape rather than throwing when the database is down", async () => {
    const dead = { from() { throw new Error("db down"); } };
    const p = await repliedProfile(dead, { userId: "u1" });
    expect(p.total).toBe(0);
    expect(await repliedProfile(null, { userId: "u1" })).toEqual(p);
  });

  it("knows the difference between replies it has and replies it can explain", async () => {
    // Three people replied and none of them is in the directory: a count is not
    // a pattern, so it must not steer anything.
    const p = await repliedProfile(db({ replies: [reply("a@x.com"), reply("b@x.com"), reply("c@x.com")], contacts: [] }), { userId: "u1" });
    expect(p.total).toBe(3);
    expect(p.industries).toEqual([]);
  });
});

describe("what to search for tonight", () => {
  const profile = (over = {}) => ({ total: 4, known: 4, industries: [], countries: [], audiences: [], namedShare: 0, ...over });

  it("leaves the original search alone until there is evidence", () => {
    expect(lookalikeNiche(profile({ total: 1 }), "furniture retailers").changed).toBe(false);
    expect(lookalikeNiche(null, "furniture retailers").niche).toBe("furniture retailers");
    expect(lookalikeNiche(profile(), "furniture retailers").changed).toBe(false);
  });

  it("narrows to the group most of them came from", () => {
    const r = lookalikeNiche(profile({ industries: [{ name: "rug retailers", n: 3 }] }), "furniture retailers");
    expect(r.changed).toBe(true);
    expect(r.niche).toBe("rug retailers");
    expect(r.reason).toMatch(/3 of the 4 companies who replied are rug retailers/);
  });

  it("refuses a pattern that is only the largest pile of ones", () => {
    // Four replies, four different industries. Nothing has been learned.
    const r = lookalikeNiche(profile({ industries: [{ name: "a", n: 1 }, { name: "b", n: 1 }] }), "furniture retailers");
    expect(r.changed).toBe(false);
  });

  it("refuses a group that is not most of them", () => {
    const r = lookalikeNiche(profile({ known: 10, industries: [{ name: "rug retailers", n: 3 }] }), "furniture retailers");
    expect(r.changed).toBe(false);
  });

  it("adds a country only when they genuinely cluster in one", () => {
    const base = { industries: [{ name: "rug retailers", n: 4 }] };
    expect(lookalikeNiche(profile({ ...base, countries: [{ name: "United Kingdom", n: 4 }] }), "x").niche)
      .toBe("rug retailers in United Kingdom");
    // Half in one country is not a cluster.
    expect(lookalikeNiche(profile({ ...base, countries: [{ name: "United Kingdom", n: 2 }] }), "x").niche)
      .toBe("rug retailers");
  });

  it("does not announce a change when the answer is what it was already doing", () => {
    const r = lookalikeNiche(profile({ industries: [{ name: "rug retailers", n: 3 }] }), "Rug Retailers");
    expect(r.changed).toBe(false);
  });

  it("calls partners partners", () => {
    const r = lookalikeNiche(profile({
      industries: [{ name: "shopify agencies", n: 3 }],
      audiences: [{ name: "partner", n: 3 }],
    }), "x");
    expect(r.reason).toMatch(/partners who replied/);
  });
});

describe("the one line that shows the loop working", () => {
  it("says nothing before anyone has replied", () => {
    expect(lookalikeNote({ total: 0 })).toBe("");
    expect(lookalikeNote(null)).toBe("");
  });

  it("is honest about waiting, and about no pattern", () => {
    expect(lookalikeNote({ total: 1 })).toMatch(/needs one more/);
    expect(lookalikeNote({ total: 4, known: 4, industries: [{ name: "a", n: 1 }] })).toMatch(/no clear pattern/);
  });

  it("says what it learned once it has learned it", () => {
    expect(lookalikeNote({ total: 4, known: 4, industries: [{ name: "rug retailers", n: 3 }] }))
      .toMatch(/3 of your replies came from rug retailers/);
  });
});
