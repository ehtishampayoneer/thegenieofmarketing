import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fillBlanks, findBlanks, hasBlanks, NO_BLANKS_RULE } from "@/lib/fill-blanks";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");

// ── THE DRAFT THAT HANDED THE WORK BACK ──
// A card reached the owner reading "Hi [Decision-Maker Name]," and signing off
// "Best regards, [Your Name]". Models write templates because templates are most
// of what they were trained on, and nothing here forbade it or noticed afterwards.
// Worse than ugly: the whole promise is that Genie does the work and the owner
// presses approve, and two blanks hand it straight back on the one screen that
// exists to say the opposite. Approved unread, it reaches a stranger's inbox with
// the brackets still in it.
describe("the exact drafts that shipped", () => {
  it("fixes the one from the screenshot", () => {
    const r = fillBlanks("Hi [Decision-Maker Name],\n\nMost hotel websites struggle.\n\nBest regards,\n[Your Name]",
      { senderName: "ARQR360", companyName: "ARQR360" });
    expect(r.text).toBe("Hi there,\n\nMost hotel websites struggle.\n\nBest regards,\nARQR360");
    expect(findBlanks(r.text)).toEqual([]);
  });

  it("uses the real name when the contact came with one", () => {
    const r = fillBlanks("Hi [First Name], I saw [Their Company] is growing.\n\nThanks,\n[Your Name]",
      { recipientName: "Maria Schmidt", senderName: "Ehtisham", recipientCompany: "Höffner" });
    expect(r.text).toContain("Hi Maria,");
    expect(r.text).toContain("I saw Höffner is growing.");
    expect(r.text).toContain("Ehtisham");
  });

  it("removes what it cannot know rather than inventing it", () => {
    const r = fillBlanks("We offer a [Custom Discount Percentage] discount.", { senderName: "X" });
    expect(r.text).toBe("We offer a discount.");
    expect(r.removed).toHaveLength(1);
  });

  it("keeps the paragraphs, or every email becomes a wall", () => {
    const r = fillBlanks("Hi [Name],\n\nOne.\n\nTwo.\n\nBest,\n[Your Name]", { senderName: "X" });
    expect(r.text.split("\n\n")).toHaveLength(4);
  });

  it("catches the three shapes models actually use", () => {
    expect(hasBlanks("Hi [Name]")).toBe(true);
    expect(hasBlanks("Hi {{name}}")).toBe(true);
    expect(hasBlanks("Hi <First Name>")).toBe(true);
  });

  it("leaves ordinary writing alone", () => {
    for (const t of ["We ship to the UAE (usually 4 days).", "Costs $29/mo, no setup fee.", "a < b and c > d"]) {
      expect(fillBlanks(t, {}).text, t).toBe(t);
    }
  });
});

describe("it is forbidden up front and caught at the end", () => {
  it("every prompt that writes a message says so", () => {
    expect(NO_BLANKS_RULE).toMatch(/NEVER leave a blank/);
    expect(NO_BLANKS_RULE).toMatch(/Hi there,/);
    for (const f of ["lib/prospects.js", "lib/earned-media.js"]) {
      expect(read(f).includes("${NO_BLANKS_RULE}"), f).toBe(true);
    }
  });

  it("the card the owner reads is filled before they read it", () => {
    expect(read("app/api/outreach/campaign/route.js")).toMatch(/body = fillBlanks\(body, who\)\.text/);
    expect(read("lib/earned-media.js")).toMatch(/pitch: fillPitch\(/);
  });

  it("and nothing is sent with one, whatever route it came from", () => {
    // Every send in the product passes through deliverEmail.
    const engine = read("lib/email-engine.js");
    expect(engine).toMatch(/const \{ fillBlanks, hasBlanks \} = await import\("@\/lib\/fill-blanks"\)/);
    expect(engine).toMatch(/code: "unfilled_blank"/);
  });

  it("is given the contact's real name by every caller", () => {
    for (const f of ["app/api/outreach/campaign/route.js", "app/api/prospects/send/route.js", "app/api/announce/route.js"]) {
      expect(read(f).includes("name:"), f).toBe(true);
    }
  });

  it("cleans the subject too, which is what a recipient sees first", () => {
    expect(read("lib/email-engine.js")).toMatch(/const subjectFixed = fillBlanks\(subject/);
    expect(read("lib/earned-media.js")).toMatch(/subject: fillBlanks\(pitch\.subject, who\)\.text/);
  });
});
