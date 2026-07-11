// lib/ai-router.js
// Marketing Genie — The AI Brain.
// One function the whole app calls: callAI(). It tries Gemini, then Groq,
// then OpenRouter, automatically. If one is down or rate-limited, it moves
// to the next. The user never sees an error from a single provider failing.
//
// Models are read from env vars with current (July 2026) defaults baked in,
// so a future deprecation is a 1-line env change, not a code change.

import { retry } from "@/lib/resilience";
import { recordUsage, estimateTokens } from "@/lib/usage";

// ---------------------------------------------------------------------------
// PROVIDER CONFIG  (priority order: 1 = tried first)
// ---------------------------------------------------------------------------
const PROVIDERS = [
  {
    name: "gemini",
    priority: 1,
    apiKey: () => process.env.GEMINI_API_KEY,
    model: () => process.env.GEMINI_MODEL || "gemini-2.5-flash",
    rpm: 15, // free-tier requests/min (soft, proactive guard only)
    call: callGemini,
  },
  {
    name: "groq",
    priority: 2,
    apiKey: () => process.env.GROQ_API_KEY,
    // llama-3.1/3.3 were deprecated June 2026 -> gpt-oss is the current fast free-tier model
    model: () => process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    rpm: 30,
    call: (cfg, payload) =>
      callOpenAICompatible("https://api.groq.com/openai/v1", cfg, payload),
  },
  {
    name: "openrouter",
    priority: 3,
    apiKey: () => process.env.OPENROUTER_API_KEY,
    // Pick any current ":free" model at openrouter.ai/models if this one rotates out.
    model: () => process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
    rpm: 20,
    call: (cfg, payload) =>
      callOpenAICompatible("https://openrouter.ai/api/v1", cfg, payload, {
        "HTTP-Referer": process.env.APP_URL || "https://marketinggenie.app",
        "X-Title": "Marketing Genie",
      }),
  },
  {
    // PAID FALLBACK — last resort so Genie never goes dark if every free tier
    // fails. Gated by env (skipped when unset). Provider-agnostic: point
    // PAID_LLM_BASE at any OpenAI-compatible paid endpoint (OpenAI, Together,
    // Fireworks, a paid Gemini/Groq gateway, …).
    name: "paid",
    priority: 9,
    apiKey: () => process.env.PAID_LLM_API_KEY,
    model: () => process.env.PAID_LLM_MODEL || "gpt-4o-mini",
    rpm: 500,
    call: (cfg, payload) =>
      callOpenAICompatible(process.env.PAID_LLM_BASE || "https://api.openai.com/v1", cfg, payload),
  },
];

// ---------------------------------------------------------------------------
// SOFT RATE-LIMIT TRACKER
// In-memory, per serverless instance. Resets when the instance recycles.
// This is only a *proactive* skip ("we just got 429'd from Groq, give it a
// rest"). The real protection is catching provider errors and failing over.
// Upgrade path: swap this Map for Upstash Redis to make it global. (Task 5b)
// ---------------------------------------------------------------------------
const cooldowns = new Map(); // providerName -> timestamp (ms) until which to skip
const hits = new Map(); // providerName -> [timestamps within last 60s]

function isCoolingDown(name) {
  const until = cooldowns.get(name);
  return until && Date.now() < until;
}

function coolDown(name, seconds = 30) {
  cooldowns.set(name, Date.now() + seconds * 1000);
}

function underSoftLimit(name, rpm) {
  const now = Date.now();
  const recent = (hits.get(name) || []).filter((t) => now - t < 60_000);
  hits.set(name, recent);
  return recent.length < rpm;
}

function recordHit(name) {
  const arr = hits.get(name) || [];
  arr.push(Date.now());
  hits.set(name, arr);
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------
/**
 * Call the AI brain. Tries every configured provider in order until one works.
 *
 * @param {Object} opts
 * @param {string} opts.prompt            The user/task message. (required)
 * @param {string} [opts.system]          System instruction / Genie persona.
 * @param {boolean} [opts.json=false]     Ask the model to return strict JSON.
 * @param {number} [opts.temperature=0.7]
 * @param {number} [opts.maxTokens=2048]
 * @param {string[]} [opts.only]          Restrict to these provider names.
 * @returns {Promise<{text:string, json:any|null, provider:string, model:string, latencyMs:number, attempts:Array}>}
 * @throws {AllProvidersFailedError} when every provider fails.
 */
export async function callAI(opts = {}) {
  const {
    prompt,
    system = "",
    json = false,
    temperature = 0.7,
    maxTokens = 2048,
    only = null,
  } = opts;

  if (!prompt || typeof prompt !== "string") {
    throw new Error("callAI: `prompt` (string) is required.");
  }

  const payload = { prompt, system, json, temperature, maxTokens };
  const attempts = [];

  const ordered = [...PROVIDERS]
    .filter((p) => (only ? only.includes(p.name) : true))
    .sort((a, b) => a.priority - b.priority);

  for (const provider of ordered) {
    const key = provider.apiKey();
    const model = provider.model();

    if (!key) {
      attempts.push({ provider: provider.name, skipped: "no_api_key" });
      continue;
    }
    if (isCoolingDown(provider.name)) {
      attempts.push({ provider: provider.name, skipped: "cooling_down" });
      continue;
    }
    if (!underSoftLimit(provider.name, provider.rpm)) {
      attempts.push({ provider: provider.name, skipped: "soft_rate_limit" });
      continue;
    }

    const started = Date.now();
    try {
      recordHit(provider.name);
      // Retry only transient (network) errors here; 429/5xx fail over to the next
      // provider (handled below) rather than hammering a hurting one.
      const text = await retry(
        () => provider.call({ apiKey: key, model }, payload),
        { tries: 2, retryOn: (e) => !e?.status }
      );
      const clean = stripText(text);
      const parsed = json ? safeParseJSON(clean) : null;
      if (json && parsed === null) {
        // Provider replied, but not with usable JSON — fall through to the next.
        throw httpError(422, "invalid_json");
      }
      const latencyMs = Date.now() - started;
      const usage = {
        provider: provider.name, model,
        tokensIn: estimateTokens(system) + estimateTokens(prompt),
        tokensOut: estimateTokens(clean), latencyMs, cached: false,
      };
      // Unit-economics instrumentation (opt-in via ctx; never blocks the result).
      if (opts.ctx?.supabase) {
        recordUsage(opts.ctx.supabase, { userId: opts.ctx.userId || null, host: opts.ctx.host || null, kind: "llm", ok: true, tag: opts.ctx.tag || null, ...usage }).catch(() => {});
      }
      return { text: clean, json: parsed, provider: provider.name, model, latencyMs, usage, attempts };
    } catch (err) {
      const status = err?.status;
      // 429 / 5xx => this provider is hurting; rest it and fail over.
      if (status === 429 || (status >= 500 && status < 600)) {
        coolDown(provider.name, status === 429 ? 60 : 20);
      }
      attempts.push({
        provider: provider.name,
        error: err?.message || "unknown",
        status: status || null,
      });
      // continue to next provider
    }
  }

  throw new AllProvidersFailedError(attempts);
}

export class AllProvidersFailedError extends Error {
  constructor(attempts) {
    super("All AI providers failed or were unavailable.");
    this.name = "AllProvidersFailedError";
    this.attempts = attempts;
  }
}

// ---------------------------------------------------------------------------
// PROVIDER ADAPTERS
// ---------------------------------------------------------------------------
async function callGemini({ apiKey, model }, { prompt, system, json, temperature, maxTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw httpError(res.status, await safeBody(res));

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) throw httpError(502, "Gemini returned empty content");
  return text;
}

async function callOpenAICompatible(baseUrl, { apiKey, model }, { prompt, system, json, temperature, maxTokens }, extraHeaders = {}) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw httpError(res.status, await safeBody(res));

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw httpError(502, "Provider returned empty content");
  return text;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function httpError(status, detail) {
  const e = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  e.status = status;
  return e;
}

async function safeBody(res) {
  try {
    return await res.text();
  } catch {
    return `HTTP ${res.status}`;
  }
}

function stripText(text) {
  // Remove accidental ```json ... ``` fences some models add around JSON.
  return String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    // last-ditch: pull the first {...} or [...] block
    const match = text.match(/[\{\[][\s\S]*[\}\]]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
