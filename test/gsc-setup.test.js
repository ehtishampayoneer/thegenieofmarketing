import { describe, it, expect, vi, beforeEach } from "vitest";
import { propertyUrl, getVerificationTag, verifyOwnership, addSearchConsoleProperty } from "@/lib/gsc-setup";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

describe("Search Console set up for the owner", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("names the property the way Google does", () => {
    expect(propertyUrl("arqr360.com")).toBe("https://arqr360.com/");
    expect(propertyUrl("https://www.shop.com/")).toBe("https://www.shop.com/");
  });

  it("asks Google for the tag and pulls out the value a plugin needs", async () => {
    let body;
    globalThis.fetch = vi.fn(async (_u, init) => { body = JSON.parse(init.body); return json({ token: '<meta name="google-site-verification" content="AbC123" />', method: "META" }); });
    const r = await getVerificationTag("tok", "arqr360.com");
    expect(r.ok).toBe(true);
    expect(r.content).toBe("AbC123");
    expect(body.site).toEqual({ type: "SITE", identifier: "https://arqr360.com/" });
    expect(body.verificationMethod).toBe("META");
  });

  it("tells 'tag not live yet' apart from a real refusal", async () => {
    globalThis.fetch = vi.fn(async () => json({ error: { message: "We could not find the verification token on your site." } }, 400));
    const a = await verifyOwnership("tok", "arqr360.com");
    expect(a.ok).toBe(false);
    expect(a.notFound).toBe(true);

    globalThis.fetch = vi.fn(async () => json({ error: { message: "Request had insufficient authentication scopes." } }, 403));
    const b = await verifyOwnership("tok", "arqr360.com");
    expect(b.notFound).toBe(false);
    expect(b.error).toMatch(/scopes/);
  });

  it("adds the property with a PUT to the encoded site URL", async () => {
    let url, method;
    globalThis.fetch = vi.fn(async (u, init) => { url = String(u); method = init.method; return new Response(null, { status: 204 }); });
    expect((await addSearchConsoleProperty("tok", "arqr360.com")).ok).toBe(true);
    expect(method).toBe("PUT");
    expect(url).toContain(encodeURIComponent("https://arqr360.com/"));
  });
});
