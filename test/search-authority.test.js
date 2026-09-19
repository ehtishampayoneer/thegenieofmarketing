import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/usage", () => ({ recordUsage: () => Promise.resolve(), estimateTokens: () => 1, estimateCost: () => 0 }));
vi.mock("@/lib/events", () => ({ recordEvent: () => Promise.resolve() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/log", () => ({ logger: { warn() {}, info() {}, error() {} } }));

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("Gemini grounded web search", () => {
  beforeEach(() => { vi.resetModules(); process.env.GEMINI_API_KEY = "k"; delete process.env.BRAVE_SEARCH_API_KEY; delete process.env.GEMINI_MODEL; });

  it("resolves Google's redirect links, drops invented URLs, and gives Gemini a thinking allowance", async () => {
    let sentBody = null, sentUrl = "";
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      const MODELS = [{ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] }];
      if (u.includes("/v1beta/models?")) return json({ models: MODELS });
      if (u.includes("generativelanguage")) {
        sentBody = JSON.parse(init.body); sentUrl = u;
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
    // Searches on the newest Lite model the key can use (found by asking Google),
    // with extra output room for Gemini 3 thinking but no 2.5-only setting.
    expect(sentUrl).toContain("gemini-3.5-flash-lite");
    expect(sentBody.generationConfig.thinkingConfig).toBeUndefined();
    expect(sentBody.generationConfig.maxOutputTokens).toBe(3024);
    expect(groundedSearchLastError()).toBeNull();
    // 20s, not the 5s default: this test re-imports the whole search module graph
    // after resetModules(), which takes several seconds when the full suite is
    // running in parallel. It is module loading, not the code under test.
  }, 20000);

  it("records Gemini's real error instead of silently returning nothing", async () => {
    globalThis.fetch = vi.fn(async (url) => String(url).includes("generativelanguage")
      ? json({ error: { message: "Resource has been exhausted (e.g. check quota)." } }, 429)
      : new Response("", { status: 403 }));
    const { webSearch, groundedSearchLastError } = await import("@/lib/search");
    await webSearch("anything unique 123", { limit: 3 });
    expect(groundedSearchLastError()).toMatch(/429.*exhausted/i);
  });
});

describe("search when Gemini's quota is spent", () => {
  beforeEach(() => { vi.resetModules(); process.env.GEMINI_API_KEY = "k"; delete process.env.GEMINI_MODEL; delete process.env.GEMINI_SEARCH_MODEL; delete process.env.BRAVE_SEARCH_API_KEY; delete process.env.TAVILY_API_KEY; });

  it("tries the next Gemini model when one is out of quota, with thinking for 2.5 Flash", async () => {
    const tried = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      const MODELS = [{ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] }];
      if (u.includes("/v1beta/models?")) return json({ models: MODELS });
      if (u.includes("generativelanguage")) {
        tried.push(u.match(/models\/([^:]+)/)[1]);
        if (u.includes("flash-lite")) return json({ error: { message: "You exceeded your current quota" } }, 429);
        expect(JSON.parse(init.body).generationConfig.thinkingConfig.thinkingBudget).toBe(1024);
        return json({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ title: "A", url: "https://a.example/x" }]) }] } }] });
      }
      return new Response("", { status: 500 });
    });
    const { webSearch } = await import("@/lib/search");
    const out = await webSearch("quota fallback q", { limit: 3 });
    expect(tried).toEqual(["gemini-3.5-flash-lite", "gemini-2.5-flash"]);
    expect(out[0].url).toBe("https://a.example/x");
  });

  it("falls back to Tavily when every Gemini model is out of quota", async () => {
    process.env.TAVILY_API_KEY = "tvly-x";
    let tavilyBody = null;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      if (u.includes("generativelanguage")) return json({ error: { message: "You exceeded your current quota" } }, 429);
      if (u.includes("api.tavily.com")) {
        tavilyBody = JSON.parse(init.body);
        expect(init.headers.Authorization).toBe("Bearer tvly-x");
        return json({ results: [{ title: "Rug shop", url: "https://rugs.example/", content: "snippet" }] });
      }
      return new Response("", { status: 500 });
    });
    const { webSearch } = await import("@/lib/search");
    const out = await webSearch("rugs site:reddit.com", { limit: 3 });
    expect(out[0].url).toBe("https://rugs.example/");
    expect(tavilyBody.query).toBe("rugs");
    expect(tavilyBody.include_domains).toEqual(["reddit.com"]);
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

  it("ignores spaces and quotes pasted around the key", async () => {
    process.env.OPENPAGERANK_API_KEY = `  "opr_live_abc"${String.fromCharCode(10)}`;
    let auth;
    globalThis.fetch = vi.fn(async (_u, init) => { auth = init.headers.Authorization; return json({ results: [] }); });
    const { scoreDomains } = await import("@/lib/authority");
    await scoreDomains(["x.org"]);
    expect(auth).toBe("Bearer opr_live_abc");
  });

  it("keeps the API's refusal for the self-test", async () => {
    globalThis.fetch = vi.fn(async () => json({ error: { type: "authentication_error", message: "Invalid API key" } }, 401));
    const { scoreDomains, authorityLastError } = await import("@/lib/authority");
    await scoreDomains(["example.org"]);
    expect(authorityLastError()).toMatch(/401: Invalid API key/);
  });
});

describe("Reddit and Gemini resting", () => {
  beforeEach(() => { vi.resetModules(); process.env.GEMINI_API_KEY = "k"; process.env.TAVILY_API_KEY = "tvly"; delete process.env.GEMINI_MODEL; delete process.env.REDDIT_CLIENT_ID; delete process.env.REDDIT_RSS_TOKEN; });

  it("finds threads with a second phrasing when the site-filtered search returns only community pages", async () => {
    const tavilyQueries = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      if (u.includes("/v1beta/models?")) return json({ models: [] });
      if (u.includes("generativelanguage")) return json({ error: { message: "You exceeded your current quota" } }, 429);
      if (u.includes("api.tavily.com")) {
        const b = JSON.parse(init.body);
        tavilyQueries.push(b.include_domains ? `${b.query} [site]` : b.query);
        return b.include_domains
          ? json({ results: [{ title: "r/furniture", url: "https://www.reddit.com/r/furniture/" }] })
          : json({ results: [{ title: "Where do you buy sofas?", url: "https://www.reddit.com/r/furniture/comments/abc123/where_do_you_buy/" }] });
      }
      return new Response("", { status: 403 });
    });
    const { redditSearch } = await import("@/lib/search");
    const out = await redditSearch("buying a sofa", { limit: 5 });
    expect(out.map((t) => t.threadId)).toEqual(["abc123"]);
    expect(tavilyQueries).toEqual(["buying a sofa [site]", "buying a sofa reddit"]);
  });

  it("stops calling Gemini for search once every model is out of quota", async () => {
    let geminiCalls = 0;
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/v1beta/models?")) return json({ models: [{ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] }] });
      if (u.includes(":generateContent")) { geminiCalls++; return json({ error: { message: "You exceeded your current quota" } }, 429); }
      if (u.includes("api.tavily.com")) return json({ results: [{ title: "A", url: "https://a.example/" }] });
      return new Response("", { status: 403 });
    });
    const { webSearch } = await import("@/lib/search");
    await webSearch("first query", { limit: 3 });
    const afterFirst = geminiCalls;
    const out = await webSearch("second query", { limit: 3 });
    expect(afterFirst).toBe(2);           // both models tried once
    expect(geminiCalls).toBe(afterFirst); // then rested: no more Gemini calls
    expect(out[0].url).toBe("https://a.example/");
  });
});
