import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aliasRejected, aliasHelp } from "@/lib/gmail";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");

// Four things a real self-test run on the live site found on 2026-09-25. Each was
// invisible from the code alone, which is the whole argument for running it.
describe("a connection is never called broken before it has been asked", () => {
  const page = read("app/connections/page.js");

  it("shows 'Checking…' while the answer is in flight", () => {
    // The page starts from a FALLBACK where every integration is connected:false,
    // so for the first second of every visit it stated, as fact, that a working
    // Google was not connected. The owner then reconnects something that was fine.
    expect(page).toMatch(/checking = false/);
    expect(page).toMatch(/checking\s*\?[\s\S]{0,120}Checking…/);
  });

  it("asks every row, not just one", () => {
    const wired = (page.match(/<Row checking=\{state === "loading"\}/g) || []).length;
    expect(wired).toBeGreaterThanOrEqual(7);
  });

  it("hides the Connect button until it knows, so nobody reconnects a live account", () => {
    expect(page).toMatch(/\{checking \? null : action\}/);
  });
});

describe("a held-back article says what is wrong with it", () => {
  const page = read("app/approvals/page.js");
  const route = read("app/api/actions/[id]/execute/route.js");

  it("the route has always sent the reason", () => {
    // The wording changed when self-repair landed — it now says it already TRIED —
    // so this pins the thing that matters: the reason travels with the refusal.
    expect(route).toMatch(/blocked: true, error: "Genie rewrote this and it still is not safe to publish: " \+ \(guard\.reasons\[0\]/);
    expect(route).toMatch(/reasons: guard\.reasons/);
  });

  it("and the screen now uses it instead of a generic line", () => {
    // "Press E to edit" without saying what to edit is the same as saying nothing,
    // on a 780-word article.
    expect(page).toMatch(/const why = \(r\.guard\?\.reasons \|\| \[\]\)\.filter\(Boolean\)/);
    expect(page).toMatch(/Held back: \$\{why\.slice\(0, 2\)\.join\(" "\)\}/);
  });

  it("marks the card held so the full list and the exact claims appear", () => {
    expect(page).toMatch(/held: true, heldReasons: why\.slice\(0, 4\)/);
    expect(page).toMatch(/heldClaims: \(r\.guard\?\.claims \|\| \[\]\)\.slice\(0, 4\)/);
  });

  it("does not reload the queue, which would lose the toast and their place", () => {
    expect(page).not.toMatch(/blocked[\s\S]{0,400}window\.location\.reload/);
  });
});

describe("outreach sends as the owner's own address where Gmail allows it", () => {
  const engine = read("lib/email-engine.js");

  it("tries the address they actually asked for", () => {
    // sender_email was applied as Reply-To only, so every cold email still left
    // from a personal gmail.com address.
    expect(engine).toMatch(/const wanted = String\(profile\.sender_email \|\| ""\)\.trim\(\)/);
    expect(engine).toMatch(/fromEmail: wanted/);
  });

  it("falls back to the Gmail address rather than losing the send", () => {
    expect(engine).toMatch(/if \(aliasRejected\(a\.error\)\)/);
    expect(engine).toMatch(/replyTo: useAlias \? wanted : null/);
  });

  it("records why, once, so the owner is told how to fix it", () => {
    expect(engine).toMatch(/type: "outreach\.alias_unavailable"/);
    expect(engine).toMatch(/dedupeKey: `alias:\$\{userId\}:\$\{wanted\}`/);
  });

  it("recognises Gmail's refusal, and not much else", () => {
    for (const e of ["gmail_400: Invalid From header", "Delegation denied for user", "failedPrecondition"]) {
      expect(aliasRejected(e), e).toBe(true);
    }
    for (const e of ["gmail_429: rate limit", "network timeout", ""]) {
      expect(aliasRejected(e), JSON.stringify(e)).toBe(false);
    }
  });

  it("explains it in steps, not in Gmail's words", () => {
    const h = aliasHelp("info@arqr360.com", "arqrinfo@gmail.com");
    expect(h).toMatch(/Accounts and Import/);
    expect(h).toMatch(/info@arqr360\.com/);
    expect(h).toMatch(/arqrinfo@gmail\.com/);
    expect(h).not.toMatch(/Invalid From/);
  });
});

describe("the self-test reads the contact pool the way the sender does", () => {
  const self = read("lib/selftest.js");
  const engine = read("lib/email-engine.js");

  it("never filters the shared directory by a user", () => {
    // directory_contacts is shared across every owner on purpose — one row per
    // address, so a bounce is never retried by a second owner — so it has no
    // user_id. Asking for one reported a real failure against a column that was
    // never meant to exist.
    const check = self.slice(self.indexOf('id: "contacts-safe"'), self.indexOf('id: "ramp"'));
    expect(check).toMatch(/from\("directory_contacts"\)/);
    expect(check).not.toMatch(/directory_contacts[\s\S]{0,200}eq\("user_id"/);
  });

  it("filters it on the same two things the sender filters on", () => {
    for (const f of ['eq("is_genie_lead", false)', 'not("status", "in", "(unsubscribed,bounced)")']) {
      expect(self.includes(f), `selftest: ${f}`).toBe(true);
      expect(engine.includes(f), `email-engine: ${f}`).toBe(true);
    }
  });

  it("counts what the real send would accept, not a looser guess", () => {
    expect(self).toMatch(/roleFit\(c\.email, \{ purpose: "offer" \}\)/);
    expect(engine).toMatch(/roleFit\(c\.email, \{ purpose: "offer" \}\)/);
  });
});

describe("a slow provider is not reported as a bad key", () => {
  const self = read("lib/selftest.js");

  it("tells a timeout apart from a refusal", () => {
    expect(self).toMatch(/const timedOut = /);
    expect(self).toMatch(/did not respond within\|timeout\|aborted/);
  });

  it("does not send the owner to change a key that demonstrably works", () => {
    // The paid OpenRouter check passes using the very same key.
    const block = self.slice(self.indexOf("const timedOut"), self.indexOf("return (cooling ? warn : fail)"));
    expect(block).toMatch(/Your key is fine/);
    expect(block).not.toMatch(/Check the key in Vercel/);
  });
});
