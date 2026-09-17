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
      if (String(url).includes("generativelanguage")) { geminiCalls++; return new Response(JSON.stringify({ error: { message: "You exceeded your current quota" } }), { status: 429 }); }
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
