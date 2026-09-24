import { describe, it, expect } from "vitest";
import { checkSource, provenanceLine, sourceLabel, COLD_SOURCES } from "@/lib/contact-source";
import { deliverEmail } from "@/lib/email-engine";

describe("Genie will not write to an address it cannot account for", () => {
  it("allows the addresses a company published itself", () => {
    for (const s of ["discovery", "site", "directory"]) {
      expect(checkSource(s).ok, s).toBe(true);
      expect(checkSource(s).published, s).toBe(true);
    }
  });

  it("allows the owner's own contacts, on a different basis", () => {
    for (const s of ["owner", "import", "reply"]) {
      const c = checkSource(s);
      expect(c.ok, s).toBe(true);
      // Not cold outreach, so not something to claim was publicly published.
      expect(c.published, s).toBeFalsy();
    }
    expect(COLD_SOURCES).not.toContain("import");
  });

  it("refuses a bought list, a guessed address and a scrape, by name", () => {
    for (const s of ["purchased", "guessed", "scraped"]) {
      const c = checkSource(s);
      expect(c.ok, s).toBe(false);
      expect(c.code, s).toBe("refused_source");
      // The refusal has to be a sentence a person can act on, not a code.
      expect(c.reason.length).toBeGreaterThan(40);
    }
  });

  it("refuses an unknown source rather than assuming it is fine", () => {
    // The dangerous default: a contact from somewhere nobody thought about.
    expect(checkSource("apollo-export").ok).toBe(false);
    expect(checkSource("apollo-export").code).toBe("unknown_source");
  });

  it("refuses a missing source, because that is what an imported list looks like", () => {
    for (const s of [undefined, null, "", "   "]) {
      const c = checkSource(s);
      expect(c.ok).toBe(false);
      expect(c.code).toBe("no_source");
    }
  });

  it("is not case or whitespace sensitive, so a stored value never fails by accident", () => {
    expect(checkSource(" Discovery ").ok).toBe(true);
    expect(checkSource("DIRECTORY").ok).toBe(true);
  });
});

describe("the gate is on the send, not on the caller remembering", () => {
  const sb = { from() { throw new Error("must not be reached"); } };

  it("refuses to send with no source, before it touches anything", async () => {
    const r = await deliverEmail(sb, "u1", { to: "a@b.com", subject: "hi", body: "x" });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.code).toBe("no_source");
  });

  it("refuses a bought list even when everything else is in order", async () => {
    const r = await deliverEmail(sb, "u1", { to: "a@b.com", subject: "hi", body: "x", source: "purchased" });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.error).toMatch(/bought list/i);
  });

  it("lets a published address through the gate and on to the real send path", async () => {
    // It gets past provenance and then fails on the database, which is the proof
    // that the gate is not what stopped it.
    const r = await deliverEmail(sb, "u1", { to: "a@b.com", subject: "hi", body: "x", source: "discovery" });
    expect(r.blocked).toBeUndefined();
  });
});

describe("it can say where it got the address, which is what strict countries ask", () => {
  it("writes the line for a published address", () => {
    expect(provenanceLine("directory", "alis-rugs.com")).toMatch(/alis-rugs\.com publishes this address publicly/);
    expect(provenanceLine("discovery")).toMatch(/published publicly/);
  });

  it("writes nothing for the owner's own contacts — there is no claim to make", () => {
    expect(provenanceLine("import", "x.com")).toBe("");
    expect(provenanceLine("owner")).toBe("");
  });

  it("writes nothing it could not stand behind", () => {
    expect(provenanceLine("purchased", "x.com")).toBe("");
    expect(provenanceLine(null)).toBe("");
    expect(sourceLabel("nonsense")).toBe("an unverified source");
  });
});
