import { it, expect, vi } from "vitest";

// safeFetch returns { res, finalUrl }. The broken-link finder used to read r.ok
// and r.status off that wrapper, so it never found a single dead link.
vi.mock("@/lib/ssrf", () => {
  const resp = (status, body = "") => ({ ok: status < 400, status, text: async () => body });
  return {
    safeFetch: vi.fn(async (url) => {
      if (url === "https://blog.example/resources") {
        return { res: resp(200, `
          <a href="https://gone-page.example/guide">Old guide</a>
          <a href="https://dead-domain.example/">Dead site</a>
          <a href="https://alive.example/">Alive</a>`), finalUrl: url };
      }
      if (url.startsWith("https://gone-page.example")) return { res: resp(404), finalUrl: url };
      if (url.startsWith("https://dead-domain.example")) { const e = new Error("ssrf_dns_fail"); e.ssrf = "dns_fail"; e.code = "ENOTFOUND"; throw e; }
      return { res: resp(200), finalUrl: url };
    }),
  };
});

it("finds a 404 and a domain that no longer exists, and skips a live link", async () => {
  const { findDeadLinks } = await import("@/lib/earned-media");
  const dead = await findDeadLinks("https://blog.example/resources");
  expect(dead.map((d) => [d.host, d.status])).toEqual([
    ["gone-page.example", 404],
    ["dead-domain.example", "gone"],
  ]);
});
