import { describe, it, expect } from "vitest";
import { pitchToApproval, isPendingPitch } from "@/lib/media-store";

const row = (payload) => ({ id: "a1", created_at: "2026-09-19", payload: { play: "backlinks", company: "Home Tech Weekly", domain: "hometech.example", subject: "A tool for your AR roundup", body: "Hi Sam, ...", whyFit: "They list AR furniture tools.", ...payload } });

describe("Get featured pitches in Approvals", () => {
  it("sends by email when there is an address", () => {
    const it_ = pitchToApproval(row({ contact: { email: "sam@hometech.example", name: "Sam" } }));
    expect(it_.kind).toBe("media_pitch");
    expect(it_.pitch).toMatchObject({ email: "sam@hometech.example", name: "Sam", subject: "A tool for your AR roundup" });
    expect(it_.draft).toBe("Hi Sam, ...");
    expect(it_.target_url).toBe(null);
    expect(it_.owned).toBe(false);
  });

  it("opens the contact form when there is no address", () => {
    const it_ = pitchToApproval(row({ contact: { email: null, contactForm: "https://hometech.example/contact" } }));
    expect(it_.platform).toBe("form");
    expect(it_.target_url).toBe("https://hometech.example/contact");
  });

  it("leaves sent and skipped pitches out", () => {
    expect(isPendingPitch(row({}))).toBe(true);
    expect(isPendingPitch(row({ applied: true }))).toBe(false);
  });
});
