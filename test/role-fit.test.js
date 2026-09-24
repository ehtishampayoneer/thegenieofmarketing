import { describe, it, expect } from "vitest";
import { roleFit, roleOfAddress, rankByRole } from "@/lib/role-fit";
import { deliverEmail } from "@/lib/email-engine";

describe("addresses nobody should ever be sent commercial mail at", () => {
  it("refuses them hard, whatever the message is", () => {
    for (const e of [
      "noreply@x.com", "no-reply@x.com", "postmaster@x.com", "abuse@x.com",
      "legal@x.com", "privacy@x.com", "dpo@x.com", "unsubscribe@x.com",
      "careers@x.com", "jobs@x.com", "hr@x.com", "recruitment@x.com",
    ]) {
      const r = roleFit(e, { purpose: "offer" });
      expect(r.ok, e).toBe(false);
      expect(r.hard, e).toBe(true);
    }
  });

  it("explains why in a way that names the real reason", () => {
    const r = roleFit("careers@x.com");
    expect(r.reason).toMatch(/hiring address/);
    expect(r.reason).toMatch(/relevant to the recipient's role/);
  });

  it("is not fooled by punctuation in the mailbox name", () => {
    expect(roleFit("no.reply@x.com").hard).toBe(true);
    expect(roleFit("human-resources@x.com").hard).toBe(true);
  });
});

describe("right for one kind of message, wrong for another", () => {
  it("sends a product pitch to the commercial side, not the press desk", () => {
    expect(roleFit("sales@x.com", { purpose: "offer" }).ok).toBe(true);
    expect(roleFit("press@x.com", { purpose: "offer" }).ok).toBe(false);
    // But it is not a hard block: press@ is exactly right for something else.
    expect(roleFit("press@x.com", { purpose: "offer" }).hard).toBe(false);
  });

  it("sends a 'would you feature us' pitch to the press desk", () => {
    expect(roleFit("press@x.com", { purpose: "media" }).ok).toBe(true);
    expect(roleFit("editor@x.com", { purpose: "media" }).ok).toBe(true);
  });

  it("leaves the billing and returns desks alone for an offer", () => {
    expect(roleFit("billing@x.com", { purpose: "offer" }).ok).toBe(false);
    expect(roleFit("returns@x.com", { purpose: "offer" }).ok).toBe(false);
  });

  it("treats a person's own address as the right person", () => {
    // A named address at a small company is usually whoever decides.
    expect(roleOfAddress("sarah@alis-rugs.com").bucket).toBe("named");
    expect(roleFit("sarah.chen@alis-rugs.com", { purpose: "offer" }).ok).toBe(true);
  });

  it("uses a stated title to confirm, never to reject", () => {
    // Plenty of right people have titles the plan never thought to list, so a
    // title that does not match must not throw the contact away.
    const roles = ["ecommerce manager"];
    expect(roleFit("sarah@x.com", { purpose: "offer", roles, title: "Ecommerce Manager" }).reason).toMatch(/matches "ecommerce manager"/);
    expect(roleFit("sarah@x.com", { purpose: "offer", roles, title: "Head of Retail" }).ok).toBe(true);
  });
});

describe("picking the best address a company published", () => {
  it("prefers a person, then the commercial desk, then a general one", () => {
    const list = [{ email: "info@x.com" }, { email: "sales@x.com" }, { email: "sarah@x.com" }];
    expect(rankByRole(list, { purpose: "offer" }).map((e) => e.email))
      .toEqual(["sarah@x.com", "sales@x.com", "info@x.com"]);
  });

  it("drops the ones that should never be written to", () => {
    const list = [{ email: "careers@x.com" }, { email: "hello@x.com" }];
    expect(rankByRole(list, { purpose: "offer" }).map((e) => e.email)).toEqual(["hello@x.com"]);
  });

  it("returns nothing rather than something wrong", () => {
    expect(rankByRole([{ email: "legal@x.com" }], { purpose: "offer" })).toEqual([]);
    expect(rankByRole([], {})).toEqual([]);
    expect(rankByRole(null, {})).toEqual([]);
  });
});

describe("the send itself refuses the never tier", () => {
  const sb = { from() { throw new Error("must not be reached"); } };

  it("will not write to careers@ even with perfect provenance", async () => {
    const r = await deliverEmail(sb, "u1", { to: "careers@x.com", subject: "hi", body: "x", source: "discovery" });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.code).toBe("wrong_role");
  });

  it("still lets an ordinary business address through to the real send path", async () => {
    const r = await deliverEmail(sb, "u1", { to: "hello@x.com", subject: "hi", body: "x", source: "discovery" });
    expect(r.blocked).toBeUndefined();
  });

  it("does not block press@ at the send, because that depends on the message", async () => {
    const r = await deliverEmail(sb, "u1", { to: "press@x.com", subject: "hi", body: "x", source: "discovery" });
    expect(r.blocked).toBeUndefined();
  });
});
