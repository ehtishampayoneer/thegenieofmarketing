// lib/ai-router.js
// Marketing Genie — The AI Brain.
// One function the whole app calls: callAI(). It tries Gemini, then Groq,
// then OpenRouter, automatically. If one is down or rate-limited, it moves
// to the next. The user never sees an error from a single provider failing.
//
// Models are read from env vars with current (July 2026) defaults baked in,
// so a future deprecation is a 1-line env change, not a code change.

import { retry } from "@/lib/resilience";
import { recordUsage, estimateTokens, estimateCost } from "@/lib/usage";
import { getGenieContext } from "@/lib/context";
import { logger } from "@/lib/log";
import { recordEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";

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
    // The old default (llama-3.3-70b-instruct:free) was withdrawn from the free tier,
    // so this backup failed every time it was needed. Free models rotate often, so
    // callOpenRouter also finds a live free model by itself when this one goes.
    model: () => process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free",
    rpm: 20,
    call: (cfg, payload) => callOpenRouter(cfg, payload),
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
// DAILY BUDGETS + SPEND CONTROLS + PROVIDER HEALTH
// In-memory per instance (like the soft rate-limit above) — swap for Redis at
// scale with no call-site changes. Budgets are guardrails so a runaway loop can't
// exhaust a free tier or overspend the paid fallback; failover stays graceful and
// is ALWAYS logged (never silent).
// ---------------------------------------------------------------------------
const DEFAULT_BUDGET = { gemini: 1400, groq: 14000, openrouter: 1000, paid: Infinity };
function intEnv(k, d) { const v = parseInt(process.env[k], 10); return Number.isFinite(v) ? v : d; }
const PAID_CAP = () => { const v = parseFloat(process.env.PAID_DAILY_USD); return Number.isFinite(v) ? v : 5; };
const dayKey = () => new Date().toISOString().slice(0, 10);

const dailyCalls = new Map(); // provider -> { day, count }
let paidSpend = { day: dayKey(), usd: 0 };

function underDailyBudget(name, budget) {
  if (!budget || budget === Infinity) return true;
  const d = dayKey();
  const e = dailyCalls.get(name);
  if (!e || e.day !== d) { dailyCalls.set(name, { day: d, count: 0 }); return true; }
  return e.count < budget;
}
function recordDailyCall(name) {
  const d = dayKey();
  const e = dailyCalls.get(name);
  if (!e || e.day !== d) dailyCalls.set(name, { day: d, count: 1 });
  else e.count++;
}
function paidUnderCap(cap) {
  if (paidSpend.day !== dayKey()) paidSpend = { day: dayKey(), usd: 0 };
  return paidSpend.usd < cap;
}
function addPaidSpend(usd) {
  if (paidSpend.day !== dayKey()) paidSpend = { day: dayKey(), usd: 0 };
  paidSpend.usd += usd || 0;
}

// Provider health — emit an event only on state change, so Health shows
// external-provider status without spamming the ledger.
const provState = new Map();
function providerEvent(name, status, detail) {
  try {
    const c = getGenieContext()?.supabase || createAdminClient();
    recordEvent(c, { type: "system.provider", actor: "system", subject: name, data: { status, detail } }).catch(() => {});
  } catch {}
}
function markDegraded(name, detail) {
  if (provState.get(name) !== "degraded") { provState.set(name, "degraded"); logger.warn("ai.provider.degraded", { provider: name, detail }); providerEvent(name, "degraded", detail); }
}
function markHealthy(name) {
  if (provState.get(name) === "degraded") { provState.set(name, "healthy"); logger.info("ai.provider.recovered", { provider: name }); providerEvent(name, "recovered", null); }
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
    // Optional per-call model override for the selected provider(s). Used to pin a
    // reliable PAID model (e.g. on OpenRouter) as a guaranteed backstop when the free
    // tiers are rate-limited. Ignored per-provider if the model doesn't apply.
    modelOverride = null,
    // Per-provider budget. Keep it well under the route's maxDuration so a slow
    // provider still leaves room to fail over to the next one.
    timeoutMs = PROVIDER_TIMEOUT_MS,
  } = opts;

  if (!prompt || typeof prompt !== "string") {
    throw new Error("callAI: `prompt` (string) is required.");
  }

  const payload = { prompt, system, json, temperature, maxTokens, timeoutMs };
  const attempts = [];

  const ordered = [...PROVIDERS]
    .filter((p) => (only ? only.includes(p.name) : true))
    .sort((a, b) => a.priority - b.priority);

  for (const provider of ordered) {
    const key = provider.apiKey();
    const model = modelOverride || provider.model();

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
    if (!underDailyBudget(provider.name, intEnv(`${provider.name.toUpperCase()}_DAILY_CALLS`, DEFAULT_BUDGET[provider.name] ?? Infinity))) {
      attempts.push({ provider: provider.name, skipped: "over_daily_budget" });
      logger.warn("ai.skip.budget", { provider: provider.name });
      continue;
    }
    if (provider.name === "paid" && !paidUnderCap(PAID_CAP())) {
      attempts.push({ provider: "paid", skipped: "over_spend_cap" });
      logger.warn("ai.skip.spend_cap", { cap: PAID_CAP() });
      continue;
    }

    const started = Date.now();
    try {
      recordHit(provider.name);
      recordDailyCall(provider.name);
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
      // Unit-economics instrumentation — ALWAYS metered (never silent). Uses the
      // request context when present (per-user attribution), else the system client.
      const mctx = opts.ctx || getGenieContext();
      recordUsage(mctx?.supabase, { userId: mctx?.userId || null, host: mctx?.host || null, kind: "llm", ok: true, tag: mctx?.tag || null, ...usage }).catch(() => {});
      if (provider.name === "paid") addPaidSpend(estimateCost(model, usage.tokensIn, usage.tokensOut));
      markHealthy(provider.name); // recovered if it was degraded
      return { text: clean, json: parsed, provider: provider.name, model, latencyMs, usage, attempts };
    } catch (err) {
      const status = err?.status;
      // 429 / 5xx => this provider is hurting; rest it, mark degraded, fail over.
      if (status === 429 || (status >= 500 && status < 600)) {
        // A spent DAILY quota does not come back in a minute. Retrying every 60s
        // just adds a wasted round trip to every AI call for the rest of the day,
        // so rest it for 15 minutes instead and let the other providers carry it.
        const dailyQuota = status === 429 && /exceeded your current quota|per day|RESOURCE_EXHAUSTED|daily limit/i.test(String(err?.message || ""));
        coolDown(provider.name, dailyQuota ? 900 : status === 429 ? 60 : 20);
        markDegraded(provider.name, status);
      }
      attempts.push({
        provider: provider.name,
        error: err?.message || "unknown",
        status: status || null,
      });
      logger.warn("ai.provider.error", { provider: provider.name, status: status || null, error: String(err?.message || "").slice(0, 120) });
      // continue to next provider
    }
  }

  // Never fail silently: every provider was exhausted — log it loudly so it's
  // visible in logs and (via the caller's fallbacks) the user still gets a result.
  logger.error("ai.all_providers_failed", { attempts });
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
// ── REASONING MODELS SPEND THE OUTPUT BUDGET BEFORE THEY ANSWER ──
// Both free defaults think first: Gemini 2.5 Flash counts its thinking against
// maxOutputTokens, and gpt-oss on Groq counts its reasoning against max_tokens.
// Every maxTokens in this codebase was sized for the ANSWER. With a long prompt a
// model could use the whole budget thinking and return nothing, or JSON cut off
// half way, which is how onboarding kept failing on long answers. Worse, "empty
// content" was reported as a 502, which benched the provider for 20s for every
// user on that instance. So thinking gets its own capped allowance on top of the
// answer budget, and running out of room is a 422 (try the next provider) rather
// than a 5xx (this provider is down).
const REASONING_TOKENS = intEnv("AI_REASONING_TOKENS", 1024);
const isThinkingGemini = (m) => /gemini-2\.5/i.test(String(m));
// Nemotron thinks before answering too: a live test with 60 tokens got only its
// reasoning back, cut off, and no JSON.
const isReasoningOpenAI = (m) => /gpt-oss|deepseek-r1|qwq|reasoning|nemotron|glm-5|nex-n2/i.test(String(m));

async function callGemini({ apiKey, model }, { prompt, system, json, temperature, maxTokens, timeoutMs }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: isThinkingGemini(model) ? maxTokens + REASONING_TOKENS : maxTokens,
      ...(isThinkingGemini(model) ? { thinkingConfig: { thinkingBudget: REASONING_TOKENS } } : {}),
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!res.ok) throw httpError(res.status, await safeBody(res));

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text) {
    const why = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "";
    // Out of room or blocked is about THIS request, not Gemini's health.
    if (why) throw httpError(422, `Gemini returned no text (${why})`);
    throw httpError(502, "Gemini returned empty content");
  }
  return text;
}

// ── OPENROUTER: SURVIVE A RETIRED FREE MODEL ──
// When the chosen model is gone ("unavailable for free", "No endpoints found"),
// ask OpenRouter which free models exist right now, pick a strong one that
// supports JSON output, remember it for six hours, and retry once.
const OR_BASE = "https://openrouter.ai/api/v1";
const OR_HEADERS = () => ({ "HTTP-Referer": process.env.APP_URL || "https://marketinggenie.app", "X-Title": "Marketing Genie" });
// Preferred families, best first. Anything else free with JSON support is the fallback.
// Models that answer directly come first; ones that think out loud are slower and
// can spend the whole budget reasoning, so they are the later fallbacks.
const OR_PREFER = [/gemma-4-31b/i, /gemma-4/i, /glm-5/i, /nex-n2\.5-pro/i, /nemotron-3-super/i];
let orFallback = { model: null, until: 0 };

// Free models OpenRouter offers right now, best first. Cached for an hour so a busy
// night does not refetch the catalogue on every call.
let orCatalogue = { list: [], until: 0 };
async function freeOpenRouterModels() {
  if (orCatalogue.list.length && Date.now() < orCatalogue.until) return orCatalogue.list;
  try {
    const res = await fetch(`${OR_BASE}/models`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return orCatalogue.list;
    const list = ((await res.json()).data || [])
      .filter((m) => String(m.id).endsWith(":free"))
      .filter((m) => (m.supported_parameters || []).includes("response_format"))
      .filter((m) => !/safety|guard|code|vl\b|omni|reasoning/i.test(m.id))
      .sort((a, b) => {
        const ra = OR_PREFER.findIndex((rx) => rx.test(a.id)), rb = OR_PREFER.findIndex((rx) => rx.test(b.id));
        return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || (b.context_length || 0) - (a.context_length || 0);
      })
      .map((m) => m.id);
    orCatalogue = { list, until: Date.now() + 3600 * 1000 };
    return list;
  } catch { return orCatalogue.list; }
}

const orRetired = (e) => (e?.status === 404 || e?.status === 400) && /unavailable for free|no endpoints found|not a valid model|model.*(not found|does not exist|deprecated)/i.test(String(e?.message || ""));
// Popular free models are often "rate-limited upstream". That limit belongs to the one
// model, not to OpenRouter, so a different free model usually answers.
const orBusy = (e) => e?.status === 429 && /upstream|temporarily rate-limited/i.test(String(e?.message || ""));

async function callOpenRouter(cfg, payload) {
  // A model that was found retired this instance is skipped straight away.
  const first = orFallback.model && Date.now() < orFallback.until ? orFallback.model : cfg.model;
  try {
    return await callOpenAICompatible(OR_BASE, { ...cfg, model: first }, payload, OR_HEADERS());
  } catch (e) {
    // A paid model override (modelOverride) is never swapped for a free one.
    if (!(orRetired(e) || orBusy(e)) || !String(first).endsWith(":free")) throw e;
    let lastErr = e;
    const candidates = (await freeOpenRouterModels()).filter((m) => m !== first && m !== cfg.model).slice(0, 3);
    for (const m of candidates) {
      try {
        const out = await callOpenAICompatible(OR_BASE, { ...cfg, model: m }, payload, OR_HEADERS());
        // Remember the replacement only when the configured model is actually gone.
        if (orRetired(e)) { orFallback = { model: m, until: Date.now() + 6 * 3600 * 1000 }; logger.warn("ai.openrouter.model_switched", { from: first, to: m }); }
        return out;
      } catch (e2) {
        lastErr = e2;
        if (!(orRetired(e2) || orBusy(e2))) break;
      }
    }
    throw lastErr;
  }
}

async function callOpenAICompatible(baseUrl, { apiKey, model }, { prompt, system, json, temperature, maxTokens, timeoutMs }, extraHeaders = {}) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const body = {
    model,
    messages,
    temperature,
    max_tokens: isReasoningOpenAI(model) ? maxTokens + REASONING_TOKENS : maxTokens,
    // gpt-oss on Groq takes an effort level; low keeps reasoning inside the allowance.
    ...(/gpt-oss/i.test(String(model)) && baseUrl.includes("groq.com") ? { reasoning_effort: "low" } : {}),
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };

  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }, timeoutMs);

  if (!res.ok) throw httpError(res.status, await safeBody(res));

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) {
    const why = data?.choices?.[0]?.finish_reason || "";
    if (why === "length" || why === "content_filter") throw httpError(422, `Provider returned no text (${why})`);
    throw httpError(502, "Provider returned empty content");
  }
  return text;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
// A provider that never answers is worse than one that errors: the fetch hangs, the
// serverless function burns its whole maxDuration, and failover NEVER fires because
// nothing ever threw. Bound every provider call, and report a timeout as 504 so the
// router rests that provider (5xx path) and moves to the next one immediately.
const PROVIDER_TIMEOUT_MS = intEnv("AI_TIMEOUT_MS", 25000);

async function fetchWithTimeout(url, init, timeoutMs = PROVIDER_TIMEOUT_MS) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      throw httpError(504, `provider did not respond within ${timeoutMs}ms`);
    }
    throw e;
  }
}

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
