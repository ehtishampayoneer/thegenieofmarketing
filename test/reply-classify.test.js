import { describe, it, expect } from "vitest";
import { classifyReply } from "@/lib/reply-classify";

describe("reply classification, in code", () => {
  it.each([
    ["I'm out of the office until Monday, limited access to email.", "auto"],
    ["Please remove me from your list.", "unsubscribe"],
    ["Sounds interesting, can you send me pricing?", "interested"],
    ["We already use a 3D viewer, so not a fit for us.", "objection"],
    ["Not right now, maybe next quarter.", "not_now"],
    ["I'm not the right person, you should contact our marketing lead.", "wrong_person"],
    ["Does it work with WooCommerce?", "question"],
  ])("%s -> %s", (text, label) => {
    expect(classifyReply(text)).toBe(label);
  });
  it("ignores the quoted original email", () => {
    expect(classifyReply("Thanks, not now. On Tue, 1 Sep 2026, Ali wrote: are you interested?")).toBe("not_now");
  });
});
