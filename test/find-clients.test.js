// test/find-clients.test.js
// Reported by the owner from the Find clients screen, 27 Sep:
//   1. Nine in ten of the companies it listed had websites that would not open.
//   2. Companies already emailed kept coming back as new finds.
//   3. Follow-ups should show up as follow-ups, not new finds.
// And found while fixing the third: follow-ups were being SENT every night with
// nobody ever approving them.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contactedSet, alreadyContacted, domainOfEmail, isFreeMail } from "@/lib/contacted";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");

// A fake Supabase: each table returns fixed rows, filtered the way the reads filter.
function fakeDb({ log = [], actions = [] }) {
  return {
    from(table) {
      let rows = table === "outreach_log" ? log : table === "actions" ? actions : [];
      const q = {
        select() { return q; },
        eq(c, v) { rows = rows.filter((r) => r[c] === undefined || r[c] === v); return q; },
        in(c, vs) { rows = rows.filter((r) => vs.includes(r[c])); return q; },
        limit() { return Promise.resolve({ data: rows, error: null }); },
      };
      return q;
    },
  };
}

describe("who counts as already contacted", () => {
  it("anyone in the send log, matched by company domain", async () => {
    const set = await contactedSet(fakeDb({ log: [{ user_id: "u", contact_email: "Info@AcmeSofas.com" }] }), "u");
    // Emailed at info@ on Monday is still Acme when a search finds sales@ on Wednesday.
    expect(alreadyContacted(set, { domain: "acmesofas.com" })).toBe(true);
    expect(alreadyContacted(set, { domain: "https://www.acmesofas.com/" })).toBe(true);
    expect(alreadyContacted(set, { email: "sales@acmesofas.com" })).toBe(false); // exact-address check
    expect(alreadyContacted(set, { domain: "othershop.com" })).toBe(false);
  });

  it("anyone already waiting in the approvals queue", async () => {
    const set = await contactedSet(fakeDb({
      actions: [{ user_id: "u", type: "outreach_email", status: "proposed", payload: { to: "hello@rugroom.ae" } }],
    }), "u");
    expect(alreadyContacted(set, { domain: "rugroom.ae" })).toBe(true);
  });

  it("a shop on Gmail does not make every Gmail shop disappear", async () => {
    const set = await contactedSet(fakeDb({ log: [{ user_id: "u", contact_email: "rugsbyamir@gmail.com" }] }), "u");
    expect(isFreeMail("gmail.com")).toBe(true);
    expect(alreadyContacted(set, { domain: "gmail.com" })).toBe(false);
    // ...but that exact person is still recognised.
    expect(alreadyContacted(set, { email: "RugsByAmir@gmail.com" })).toBe(true);
  });

  it("reads safely when there is nothing to read", async () => {
    const set = await contactedSet(null, "u");
    expect(set.domains.size + set.emails.size).toBe(0);
    expect(alreadyContacted(null, { domain: "x.com" })).toBe(false);
    expect(domainOfEmail("not-an-email")).toBe("");
  });
});

describe("Find clients leaves out companies already contacted", () => {
  const route = read("app/api/prospects/discover/route.js");
  const prospects = read("lib/prospects.js");

  it("loads the contacted set and passes it to discovery", () => {
    expect(route).toMatch(/exclude = await contactedSet\(supabase, userId\)/);
    expect(route).toMatch(/discoverProspects\(\{[^}]*exclude \}\)/);
  });

  it("skips them before their site is fetched, not after", () => {
    const add = prospects.slice(prospects.indexOf("const add = (name, domain, url) => {"));
    expect(add.slice(0, 600)).toMatch(/if \(exclude && alreadyContacted\(exclude, \{ domain \}\)\)/);
  });

  it("the fallback path obeys the same rule", () => {
    expect(route).toMatch(/const fresh = exclude \? diag\.companies\.filter\(\(c\) => !alreadyContacted\(exclude/);
    expect(route).toMatch(/buildProspectsFromCompanies\(fresh, userBusiness, 8, \{ exclude, stats \}\)/);
  });

  it("tells the owner what was left out and why", () => {
    expect(route).toMatch(/you have already contacted \(their follow-ups come through Approvals\)/);
    expect(read("app/prospects/page.js")).toMatch(/setLeftOut\(j\.leftOut \|\| ""\)/);
  });
});

describe("Find clients never lists a website that will not open", () => {
  const prospects = read("lib/prospects.js");

  it("a site that would not load is dropped, not kept as backfill", () => {
    expect(prospects).toMatch(/loaded: !!p,/);
    expect(prospects).toMatch(/const loaded = profiles\.filter\(\(p\) => p\.loaded\)/);
    expect(prospects).toMatch(/let usable = loaded;/);
    expect(prospects).not.toMatch(/homepage-only ones backfill so results are never empty/);
  });

  it("a domain with no DNS record is dropped before any fetch", () => {
    expect(prospects).toMatch(/async function resolves\(domain\)/);
    expect(prospects).toMatch(/\["ENOTFOUND", "ENODATA", "EAI_NONAME"\]/);
    expect(prospects).toMatch(/const alive = await Promise\.all\(out\.map\(\(c\) => resolves\(c\.domain\)\)\)/);
  });

  it("the comment no longer claims dead domains are dropped when they were not", () => {
    expect(prospects).not.toMatch(/wrong or dead domain is simply dropped/);
  });
});

describe("follow-ups are follow-ups, and wait for the owner like any email", () => {
  const campaign = read("app/api/outreach/campaign/route.js");
  const execute = read("app/api/actions/[id]/execute/route.js");

  it("a follow-up passes the same gate as a first email before it can send", () => {
    const loop = campaign.slice(campaign.indexOf("for (const c of due) {"), campaign.indexOf("// Whatever the follow-ups used"));
    const gate = loop.indexOf("await decideExecution(supabase, {");
    const send = loop.indexOf("await deliverEmail(supabase, userId, {");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(send);
    expect(loop).toMatch(/if \(!gate\.execute\) \{[\s\S]*?stageForApproval/);
  });

  it("it is labelled as a follow-up on the card, never as a new email", () => {
    expect(campaign).toMatch(/`Follow-up \$\{followup\.step\} of \$\{followup\.of\}: /);
    expect(campaign).toMatch(/followup: \{ step: c\.step, of: MAX_FOLLOWUPS \}/);
  });

  it("once approved, it is logged as the follow-up it is, so the sequence moves on", () => {
    expect(execute).toMatch(/p\.followup\?\.step \? \{ is_followup: true, followup_step: p\.followup\.step \} : \{\}/);
  });

  it("one waiting follow-up is not drafted again every night", () => {
    expect(campaign).toMatch(/if \(waiting\.has\(String\(c\.email \|\| ""\)\.toLowerCase\(\)\)\) continue;/);
  });

  it("a skipped follow-up is an answer, not a question to ask again tomorrow", () => {
    expect(campaign).toMatch(/\.in\("status", \["proposed", "needs_review", "dismissed"\]\)/);
    expect(campaign).toMatch(/a\.status !== "dismissed" \|\| a\.payload\?\.followup/);
  });

  it("the owner is told follow-ups are waiting", () => {
    expect(campaign).toMatch(/follow-up\$\{stagedFollowUps > 1 \? "s are" : " is"\} waiting for you to approve/);
  });
});
