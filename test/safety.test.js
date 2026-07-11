import { describe, it, expect } from "vitest";
import { checkPolicy } from "@/lib/platform-policy";
import { guardContent } from "@/lib/publish-guard";
import { unsubToken, verifyUnsub } from "@/lib/compliance";
import { assertPublicUrl } from "@/lib/ssrf";

describe("platform policy", () => {
  it("flags overt self-promo + excess links on reddit", () => {
    const r = checkPolicy("reddit", "check out my product buy now https://a.com https://b.com");
    expect(r.flags).toContain("banned_phrase");
    expect(r.flags.some((f) => f.startsWith("too_many_links"))).toBe(true);
  });
  it("passes clean blog content", () => {
    expect(checkPolicy("blog", "A helpful, genuine article.").flags.length).toBe(0);
  });
});

describe("publish guard (fast mode)", () => {
  it("blocks toxic content even without a session", async () => {
    const g = await guardContent(null, { channel: "x", content: "this is fucking garbage", deep: false });
    expect(g.decision).toBe("block");
  });
  it("lets clean content publish with high confidence", async () => {
    const g = await guardContent(null, { channel: "x", content: "Genuinely useful thoughts on AR shopping.", deep: false });
    expect(g.decision).toBe("publish");
    expect(g.confidence).toBeGreaterThanOrEqual(80);
  });
  it("lowers confidence on risky claims", async () => {
    const g = await guardContent(null, { channel: "blog", content: "Guaranteed 100% results, the #1 best cure.", deep: false });
    expect(g.confidence).toBeLessThan(80);
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips and rejects tampering", () => {
    const t = unsubToken("user-1", "A@Example.com");
    expect(verifyUnsub("user-1", "a@example.com", t)).toBe(true); // case-insensitive email
    expect(verifyUnsub("user-1", "a@example.com", "bad")).toBe(false);
    expect(verifyUnsub("user-2", "a@example.com", t)).toBe(false);
  });
});

describe("SSRF guard", () => {
  it("blocks private / loopback / metadata IPs", async () => {
    for (const u of ["http://127.0.0.1", "http://10.0.0.5", "http://169.254.169.254", "http://192.168.1.1", "http://localhost"]) {
      await expect(assertPublicUrl(u)).rejects.toThrow();
    }
  });
  it("blocks non-http schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
  });
  it("allows a public IP literal", async () => {
    const u = await assertPublicUrl("http://8.8.8.8");
    expect(u.hostname).toBe("8.8.8.8");
  });
});
