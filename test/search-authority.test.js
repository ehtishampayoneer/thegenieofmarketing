import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/usage", () => ({ recordUsage: () => Promise.resolve(), estimateTokens: () => 1, estimateCost: () => 0 }));
vi.mock("@/lib/events", () => ({ recordEvent: () => Promise.resolve() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/log", () => ({ logger: { warn() {}, info() {}, error() {} } }));

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("Gemini grounded web search", () => {
  beforeEach(() => { vi.resetModules(); process.env.GEMINI_API_KEY = "k"; delete process.env.BRAVE_SEARCH_API_KEY; delete process.env.GEMINI_MODEL; });

  it("resolves Google's redirect links, drops invented URLs, and gives Gemini a thinking allowance", async () => {
    let sentBody = null;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      if (u.includes("generativelanguage")) {
        sentBody = JSON.parse(init.body);
        return json({ candidates: [{ finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify([
            { title: "Design Milk furniture", url: "https://design-milk.com/furniture/", snippet: "s" },
            { title: "Made up", url: "https://invented-site.example/best", snippet: "x" },
          ]) }] },
          groundingMetadata: { groundingChunks: [
            { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA", title: "design-milk.com" } },
            { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB", title: "dwell.com" } },
          ] } }] });
      }
      if (u.endsWith("/AAA")) return new Response(null, { status: 302, headers: { location: "https://design-milk.com/furniture/" } });
      if (u.endsWith("/BBB")) return new Response(null, { status: 302, headers: { location: "https://www.dwell.com/shop" } });
      return new Response("", { status: 500 });
    });
    const { webSearch, groundedSearchLastError } = await import("@/lib/search");
    const out = await webSearch("best furniture stores", { limit: 5 });
    const urls = out.map((r) => r.url);
    expect(urls).toContain("https://design-milk.com/furniture/");
    expect(urls).toContain("https://www.dwell.com/shop");
    expect(urls.some((x) => x.includes("invented-site"))).toBe(false);
    expect(urls.some((x) => x.includes("vertexaisearch"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
    expect(sentBody.generationConfig.thinkingConfig.thinkingBudget).toBe(1024);
    expect(groundedSearchLastError()).toBeNull();
  });

  it("records Gemini's real error instead of silently returning nothing", async () => {
    globalThis.fetch = vi.fn(async (url) => String(url).includes("generativelanguage")
      ? json({ error: { message: "Resource has been exhausted (e.g. check quota)." } }, 429)
      : new Response("", { status: 403 }));
    const { webSearch, groundedSearchLastError } = await import("@/lib/search");
    await webSearch("anything unique 123", { limit: 3 });
    expect(groundedSearchLastError()).toMatch(/429.*exhausted/i);
  });
});

describe("OpenPageRank", () => {
  beforeEach(() => { vi.resetModules(); process.env.OPENPAGERANK_API_KEY = "opr_live_x"; });

  it("reads scores from `results`, the field the API actually returns", async () => {
    let body;
    globalThis.fetch = vi.fn(async (_u, init) => {
      body = JSON.parse(init.body);
      return json({ as_of: "2026-09-01", count: 2, results: [
        { domain: "wikipedia.org", found: true, open_page_rank: 9.7, rank: 12, referring_domains: 900000 },
        { domain: "nowhere-xyz.example", found: false, open_page_rank: null },
      ], invalid: [] });
    });
    const { scoreDomains } = await import("@/lib/authority");
    const m = await scoreDomains(["wikipedia.org", "nowhere-xyz.example"]);
    expect(m.get("wikipedia.org").score).toBe(9.7);
    expect(m.has("nowhere-xyz.example")).toBe(false);
    expect(body.include_history).toBe(false);
  });

  it("keeps the API's refusal for the self-test", async () => {
    globalThis.fetch = vi.fn(async () => json({ error: { type: "authentication_error", message: "Invalid API key" } }, 401));
    const { scoreDomains, authorityLastError } = await import("@/lib/authority");
    await scoreDomains(["example.org"]);
    expect(authorityLastError()).toMatch(/401: Invalid API key/);
  });
});
