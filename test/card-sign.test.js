import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signImageUrl, verifyImageUrl, setCardImage } from "@/lib/card-sign";

const PHOTO = "https://images.pexels.com/photos/1/sofa.jpg";
const ATTACKER = "http://169.254.169.254/latest/meta-data/";

let saved;
beforeEach(() => { saved = process.env.CRON_SECRET; process.env.CRON_SECRET = "test-secret-value"; });
afterEach(() => { if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved; });

describe("only photos Genie chose can be fetched", () => {
  it("accepts a URL it signed itself", async () => {
    const sig = await signImageUrl(PHOTO);
    expect(sig).toBeTruthy();
    expect(await verifyImageUrl(PHOTO, sig)).toBe(true);
  });

  it("refuses a different URL carrying a real signature", async () => {
    // The whole point: lifting a valid sig off one card and pointing it somewhere
    // else is what an open proxy would allow.
    const sig = await signImageUrl(PHOTO);
    expect(await verifyImageUrl(ATTACKER, sig)).toBe(false);
    expect(await verifyImageUrl(PHOTO + "?x=1", sig)).toBe(false);
  });

  it("refuses a missing, empty or malformed signature", async () => {
    expect(await verifyImageUrl(PHOTO, null)).toBe(false);
    expect(await verifyImageUrl(PHOTO, "")).toBe(false);
    expect(await verifyImageUrl(PHOTO, "notasignature")).toBe(false);
    expect(await verifyImageUrl(PHOTO, "x".repeat(16))).toBe(false);
  });

  it("refuses everything when there is no secret, rather than letting it through", async () => {
    delete process.env.CRON_SECRET;
    expect(await signImageUrl(PHOTO)).toBeNull();
    expect(await verifyImageUrl(PHOTO, "anything")).toBe(false);
  });

  it("will not verify an empty url", async () => {
    expect(await verifyImageUrl("", "")).toBe(false);
    expect(await verifyImageUrl(null, null)).toBe(false);
  });

  it("does not hand back the secret, and is not a plain hash of the url", async () => {
    const sig = await signImageUrl(PHOTO);
    expect(sig).not.toContain("test-secret-value");
    expect(sig.length).toBe(16);
    // A different secret must produce a different signature, or it is not keyed.
    process.env.CRON_SECRET = "another-secret";
    expect(await signImageUrl(PHOTO)).not.toBe(sig);
  });

  it("signs a signature that only works for the card, not as a cron token", async () => {
    // Domain separation: the signature is over a prefixed value, so it can never
    // be the cron secret itself or replayed against an endpoint expecting one.
    const sig = await signImageUrl(PHOTO);
    expect(sig).not.toBe(process.env.CRON_SECRET);
  });
});

describe("setCardImage is the one way a photo gets onto a card", () => {
  it("adds both the url and its signature", async () => {
    const u = new URL("https://app.example.com/api/card");
    await setCardImage(u, PHOTO);
    expect(u.searchParams.get("img")).toBe(PHOTO);
    expect(await verifyImageUrl(u.searchParams.get("img"), u.searchParams.get("sig"))).toBe(true);
  });

  it("adds nothing at all when there is no photo", async () => {
    const u = new URL("https://app.example.com/api/card");
    await setCardImage(u, "");
    expect(u.searchParams.get("img")).toBeNull();
    expect(u.searchParams.get("sig")).toBeNull();
  });

  it("sets the url without a signature when there is no secret, so the card falls back to its brand panel", async () => {
    delete process.env.CRON_SECRET;
    const u = new URL("https://app.example.com/api/card");
    await setCardImage(u, PHOTO);
    expect(u.searchParams.get("img")).toBe(PHOTO);
    expect(u.searchParams.get("sig")).toBeNull();
  });
});
