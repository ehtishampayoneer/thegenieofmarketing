import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/usage", () => ({ recordUsage: () => Promise.resolve(), estimateTokens: () => 1, estimateCost: () => 0 }));
vi.mock("@/lib/events", () => ({ recordEvent: () => Promise.resolve() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/log", () => ({ logger: { warn() {}, info() {}, error() {} } }));

const ok = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });

describe("AI router and reasoning models", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GEMINI_API_KEY = "g"; process.env.GROQ_API_KEY = "q";
    delete process.env.OPENROUTER_API_KEY; delete process.env.PAID_LLM_API_KEY;
    delete process.env.GEMINI_MODEL; delete process.env.GROQ_MODEL;
  });

  it("gives Gemini 2.5 a thinking allowance on top of the answer budget", async () => {
    const bodies = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      bodies.push({ url: String(url), body: JSON.parse(init.body) });
      return ok({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] });
    });
    const { callAI } = await import("@/lib/ai-router");
    const r = await callAI({ prompt: "x", json: true, maxTokens: 500 });
    expect(r.json).toEqual({ a: 1 });
    const cfg = bodies[0].body.generationConfig;
    expect(cfg.maxOutputTokens).toBe(1524);
    expect(cfg.thinkingConfig.thinkingBudget).toBe(1024);
  });

  it("moves on when a model runs out of room, without benching it for everyone", async () => {
    let geminiCalls = 0;
    globalThis.fetch = vi.fn(async (url, init) => {
      if (String(url).includes("generativelanguage")) {
        geminiCalls++;
        return geminiCalls === 1
          ? ok({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] })
          : ok({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
      }
      const body = JSON.parse(init.body);
      expect(body.reasoning_effort).toBe("low");
      expect(body.max_tokens).toBe(500 + 1024);
      return ok({ choices: [{ message: { content: '{"from":"groq"}' }, finish_reason: "stop" }] });
    });
    const { callAI } = await import("@/lib/ai-router");
    const first = await callAI({ prompt: "x", json: true, maxTokens: 500 });
    expect(first.provider).toBe("groq");
    // Gemini was not put on cooldown by the truncation, so the next call uses it.
    const second = await callAI({ prompt: "y", json: true, maxTokens: 500 });
    expect(second.provider).toBe("gemini");
  });
});

describe("a spent daily quota", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GEMINI_API_KEY = "g"; process.env.GROQ_API_KEY = "q";
    delete process.env.OPENROUTER_API_KEY; delete process.env.PAID_LLM_API_KEY;
  });

  it("rests the provider instead of retrying it every minute", async () => {
    const realNow = Date.now;
    let geminiCalls = 0;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes(":generateContent")) { geminiCalls++; return new Response(JSON.stringify({ error: { message: "You exceeded your current quota" } }), { status: 429 }); }
      return ok({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
    });
    const { callAI } = await import("@/lib/ai-router");
    await callAI({ prompt: "a", json: true, maxTokens: 50 });
    // Two minutes later a per-minute limit would have reset; a daily one has not.
    Date.now = () => realNow() + 2 * 60 * 1000;
    try { await callAI({ prompt: "b", json: true, maxTokens: 50 }); } finally { Date.now = realNow; }
    expect(geminiCalls).toBe(1);
  });
});

describe("Gemini model switching", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GEMINI_API_KEY = "g"; delete process.env.GROQ_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.PAID_LLM_API_KEY;
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
  });

  it("asks Google which models exist and moves to a live one when the configured model is closed", async () => {
    const tried = [];
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/v1beta/models?")) {
        return ok({ models: [
          { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.5-flash-preview-tts", supportedGenerationMethods: ["generateContent"] },
          { name: "models/text-embedding-005", supportedGenerationMethods: ["embedContent"] },
        ] });
      }
      const model = u.match(/models\/([^:]+):generateContent/)?.[1];
      tried.push(model);
      if (model === "gemini-2.5-flash-lite") return new Response(JSON.stringify({ error: { message: "This model models/gemini-2.5-flash-lite is no longer available to new users." } }), { status: 404 });
      return ok({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
    });
    const router = await import("@/lib/ai-router");
    const r = await router.callAI({ prompt: "x", json: true, maxTokens: 50 });
    expect(r.json).toEqual({ ok: true });
    // Newest stable Flash first, never previews or TTS.
    expect(tried).toEqual(["gemini-2.5-flash-lite", "gemini-3.5-flash"]);
    expect(router.lastGeminiModel).toBe("gemini-3.5-flash");
    // The swap is remembered: the next call goes straight to the live model.
    tried.length = 0;
    await router.callAI({ prompt: "y", json: true, maxTokens: 50 });
    expect(tried).toEqual(["gemini-3.5-flash"]);
  });
});

describe("paid backup and the spend cap", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.GEMINI_API_KEY; delete process.env.GROQ_API_KEY; delete process.env.PAID_LLM_API_KEY; delete process.env.OPENROUTER_PAID_DISABLED;
    process.env.OPENROUTER_API_KEY = "or"; process.env.OPENROUTER_PAID_MODEL = "qwen/qwen3-235b-a22b-2507";
    delete process.env.PAID_DAILY_USD;
  });

  const catalogue = { data: [{ id: "qwen/qwen3-235b-a22b-2507", pricing: { prompt: "0.000000087", completion: "0.00000035" } }] };

  it("is used only after the free models fail, and records its real price", async () => {
    const models = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/api/v1/models")) return ok(catalogue);
      const body = JSON.parse(init.body);
      models.push(body.model);
      if (body.model.endsWith(":free")) return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
      return ok({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
    });
    const { callAI } = await import("@/lib/ai-router");
    const r = await callAI({ prompt: "x".repeat(4000), json: true, maxTokens: 50 });
    expect(r.provider).toBe("openrouter-paid");
    expect(models[0]).toMatch(/:free$/);                       // free tried first
    expect(models.at(-1)).toBe("qwen/qwen3-235b-a22b-2507");
    expect(r.usage.costUsd).toBeGreaterThan(0);
    expect(r.usage.costUsd).toBeLessThan(0.001);               // ~1k tokens in: a fraction of a cent
  });

  it("stops spending once the daily cap is reached", async () => {
    // Token counting is stubbed to 1 per text in this file, so a call "costs" about
    // $0.0000005 here; the cap sits below that so the first call exceeds it.
    process.env.PAID_DAILY_USD = "0.0000001";
    let paidCalls = 0;
    globalThis.fetch = vi.fn(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/api/v1/models")) return ok(catalogue);
      const body = JSON.parse(init.body);
      if (body.model.endsWith(":free")) return new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 });
      paidCalls++;
      return ok({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
    });
    const { callAI } = await import("@/lib/ai-router");
    await callAI({ prompt: "x".repeat(4000), json: true, maxTokens: 50 });   // spends more than the cap
    await expect(callAI({ prompt: "y", json: true, maxTokens: 50 })).rejects.toThrow();
    expect(paidCalls).toBe(1);
  });
});
