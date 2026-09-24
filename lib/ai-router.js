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
    // Switches model by itself when this one is retired for the key or its daily
    // quota is spent. See callGeminiSmart.
    call: (cfg, payload) => callGeminiSmart(cfg, payload),
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
  // ── MORE FREE CAPACITY ──
  // Each of these is skipped until its key is set, so adding one never changes
  // anything else. Together they multiply the free daily capacity, which is what
  // lets the swarm (lib/swarm) test at full size without touching paid credit.
  {
    name: "cerebras",
    priority: 4,
    apiKey: () => process.env.CEREBRAS_API_KEY,
    model: () => process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    rpm: 30,
    call: (cfg, payload) => callOpenAICompatible("https://api.cerebras.ai/v1", cfg, payload),
  },
  {
    name: "mistral",
    priority: 5,
    apiKey: () => process.env.MISTRAL_API_KEY,
    // Ministral 14B: on the free plan it allows ~940k tokens a minute (Mistral
    // Small allows 20k, less than one crowd test) and uses little of the monthly
    // included allowance.
    model: () => process.env.MISTRAL_MODEL || "ministral-14b-2512",
    rpm: 50,
    call: (cfg, payload) => callOpenAICompatible("https://api.mistral.ai/v1", cfg, payload),
  },
  {
    // Cloudflare Workers AI: 10,000 free "neurons" a day on any Cloudflare account.
    name: "cloudflare",
    priority: 7,
    apiKey: () => (process.env.CLOUDFLARE_ACCOUNT_ID ? process.env.CLOUDFLARE_AI_TOKEN : null),
    model: () => process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    rpm: 60,
    call: (cfg, payload) => callOpenAICompatible(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`, cfg, payload),
  },
  {
    // OPENROUTER CREDIT — the paid backstop, tried only after every free provider
    // has failed. Uses the same OPENROUTER_API_KEY, bills the account's credit, and
    // is capped per day by PAID_DAILY_USD across every instance (paidUnderCapNow).
    // Qwen3 235B instruct: strong, JSON-capable, and about $0.09/M in, $0.35/M out.
    // Set OPENROUTER_PAID_DISABLED=true to never spend credit.
    name: "openrouter-paid",
    priority: 8,
    paid: true,
    apiKey: () => (/^(1|true|yes)$/i.test(process.env.OPENROUTER_PAID_DISABLED || "") ? null : process.env.OPENROUTER_API_KEY),
    model: () => process.env.OPENROUTER_PAID_MODEL || "qwen/qwen3-235b-a22b-2507",
    rpm: 60,
    call: (cfg, payload) => callOpenAICompatible(OR_BASE, cfg, payload, OR_HEADERS()),
  },
  {
    // PAID FALLBACK — last resort so Genie never goes dark if every free tier
    // fails. Gated by env (skipped when unset). Provider-agnostic: point
    // PAID_LLM_BASE at any OpenAI-compatible paid endpoint (OpenAI, Together,
    // Fireworks, a paid Gemini/Groq gateway, …).
    name: "paid",
    priority: 9,
    paid: true,
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
const DEFAULT_BUDGET = { gemini: 1400, groq: 14000, openrouter: 1000, cerebras: 5000, mistral: 5000, cloudflare: 300, "openrouter-paid": Infinity, paid: Infinity };
function intEnv(k, d) { const v = parseInt(process.env[k], 10); return Number.isFinite(v) ? v : d; }
// Default lowered from $5 to $0.30 a day: with OpenRouter credit now in the chain,
// $5 a day could empty a small balance in a single bad day.
const PAID_CAP = () => { const v = parseFloat(process.env.PAID_DAILY_USD); return Number.isFinite(v) ? v : 0.3; };

// ── PAID SPEND, COUNTED FOR REAL ──
// The old cap only saw the "paid" provider and priced unknown models at $0, while
// Find clients and Get featured quietly called paid gpt-4o-mini on OpenRouter
// through a model override that the cap never counted. Now any call that bills
// money is paid: the paid providers, and OpenRouter with a non-":free" model.
const isPaidCall = (provider, model) => !!provider.paid || (provider.name === "openrouter" && !!model && !String(model).endsWith(":free"));

// The in-memory total only knows about this serverless instance, and Vercel runs
// many. Today's spend is also read from the usage ledger (every paid call records
// its cost there), cached for a minute, and the larger of the two is used.
let ledgerSpend = { at: 0, usd: 0 };
async function spendTodayUsd() {
  if (Date.now() - ledgerSpend.at < 60000) return Math.max(ledgerSpend.usd, paidSpend.day === dayKey() ? paidSpend.usd : 0);
  let usd = 0;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("events").select("data").eq("type", "usage.llm")
      .gte("created_at", `${dayKey()}T00:00:00.000Z`).limit(10000);
    for (const r of data || []) usd += Number(r?.data?.costUsd) || 0;
    ledgerSpend = { at: Date.now(), usd };
  } catch { usd = ledgerSpend.usd; }
  return Math.max(usd, paidSpend.day === dayKey() ? paidSpend.usd : 0);
}
async function paidUnderCapNow() { return (await spendTodayUsd()) < PAID_CAP(); }

// Real OpenRouter prices from its public catalogue, so the cap counts actual cost.
// Unknown models are priced high on purpose: overestimating stops spending early,
// underestimating is how a cap fails.
let orPrices = { map: new Map(), until: 0 };
async function openRouterPrice(model) {
  if (Date.now() > orPrices.until) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const map = new Map();
        for (const m of (await res.json()).data || []) map.set(m.id, { in: Number(m.pricing?.prompt) || 0, out: Number(m.pricing?.completion) || 0 });
        orPrices = { map, until: Date.now() + 3600 * 1000 };
      }
    } catch {}
  }
  return orPrices.map.get(model) || { in: 2e-6, out: 8e-6 };
}
async function costOf(provider, model, tokensIn, tokensOut) {
  if (provider.name === "openrouter" || provider.name === "openrouter-paid") {
    const p = await openRouterPrice(model);
    return tokensIn * p.in + tokensOut * p.out;
  }
  const est = estimateCost(model, tokensIn, tokensOut);
  return est > 0 ? est : tokensIn * 2e-6 + tokensOut * 8e-6;
}
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
// ── WHO IS GOOD ENOUGH TO WRITE SOMETHING A BUYER WILL READ ──
// The router's whole design is to never go dark: when Gemini is rate-limited it
// moves to Groq, then Gemma, then whatever else has a key. For scoring, sorting
// and classifying that is exactly right.
//
// For the cold email and the article it is wrong, and quietly so. Monday's email
// is written by the strong model and reads well; Friday's is written by the
// fourth fallback and reads flat. The owner cannot see why, so they conclude
// Genie is unreliable and stop sending. Inconsistency costs more trust than being
// consistently average, because there is no expectation left to form.
//
// The codebase already argues this for a different case: draftEmail refuses to
// fall back to a template because "a generic email burns the contact for good,
// and tonight's miss becomes tomorrow's properly written email." Same principle,
// one level deeper — if the good model is not available, do not write it today.
//
// Configurable, because which model is "good" changes faster than this file does.
export function writerProviders() {
  const raw = process.env.WRITER_PROVIDERS || "paid,openrouter-paid,gemini";
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Thrown when quality:"best" was asked for and no writer-grade provider was free. */
export class QualityUnavailableError extends Error {
  constructor(attempts) {
    super("No writer-grade model was available; nothing was written rather than writing it badly.");
    this.name = "QualityUnavailableError";
    this.attempts = attempts;
    this.retryable = true;
  }
}

export async function callAI(opts = {}) {
  const {
    prompt,
    system = "",
    json = false,
    temperature = 0.7,
    maxTokens = 2048,
    only = null,
    // "best" restricts this call to writer-grade providers and FAILS rather than
    // quietly dropping to a weaker one. Use it for anything a buyer will read.
    quality = null,
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

  const writersOnly = quality === "best";
  const allowed = writersOnly ? writerProviders() : null;
  const ordered = [...PROVIDERS]
    .filter((p) => (only ? only.includes(p.name) : true))
    .filter((p) => (allowed ? allowed.includes(p.name) : true))
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
    const paidCall = isPaidCall(provider, model);
    if (paidCall && !(await paidUnderCapNow())) {
      attempts.push({ provider: provider.name, skipped: "over_spend_cap" });
      logger.warn("ai.skip.spend_cap", { cap: PAID_CAP(), provider: provider.name });
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
      const costUsd = paidCall ? await costOf(provider, model, usage.tokensIn, usage.tokensOut) : 0;
      if (paidCall) { addPaidSpend(costUsd); usage.costUsd = costUsd; }
      recordUsage(mctx?.supabase, { userId: mctx?.userId || null, host: mctx?.host || null, kind: "llm", ok: true, tag: mctx?.tag || null, ...usage, costUsd }).catch(() => {});
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
  // A writer-grade call that found nobody free is a different event from the
  // router going dark, and the caller has to treat it differently: skip tonight
  // and write it tomorrow, rather than fall back to something weaker.
  if (writersOnly) {
    logger.warn("ai.writer_unavailable", { attempts, allowed });
    throw new QualityUnavailableError(attempts);
  }

  logger.error("ai.all_providers_failed", { attempts });
  throw new AllProvidersFailedError(attempts);
}

/** Names of the providers that never cost money, in order. */
export function freeProviderNames() {
  return [...PROVIDERS].filter((p) => !p.paid).sort((a, b) => a.priority - b.priority).map((p) => p.name);
}

/** Free providers that have a key and are not resting right now. */
export function freeProvidersReady() {
  return PROVIDERS.filter((p) => !p.paid && p.apiKey() && !isCoolingDown(p.name)).map((p) => p.name);
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
// 2.5 Flash/Pro take an explicit thinking budget. Gemini 3.x thinks by default and
// uses a different control, so it gets the extra output room without the 2.5-only
// setting, which is safe on any model.
const isThinkingGemini = (m) => /gemini-2\.5-(flash|pro)(?!-lite)/i.test(String(m));
const needsGeminiHeadroom = (m) => isThinkingGemini(m) || /gemini-[3-9]/i.test(String(m));
// Nemotron thinks before answering too: a live test with 60 tokens got only its
// reasoning back, cut off, and no JSON.
const isReasoningOpenAI = (m) => /gpt-oss|deepseek-r1|qwq|reasoning|nemotron|glm-5|nex-n2/i.test(String(m));

async function callGemini({ apiKey, model }, { prompt, system, json, temperature, maxTokens, timeoutMs }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: needsGeminiHeadroom(model) ? maxTokens + REASONING_TOKENS : maxTokens,
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

// ── GEMINI: SURVIVE A RETIRED MODEL OR A SPENT DAILY QUOTA ──
// Google keeps closing models to new API keys ("gemini-2.5-flash-lite is no longer
// available to new users. Please update your code to use gemini-3.5-flash-lite")
// and free daily quotas are per model. Instead of a hardcoded name that goes stale,
// ask Google which Flash models this key can use and move to the next one.
let geminiCatalogue = { list: [], until: 0 };
let geminiSwap = { from: null, to: null, until: 0 };
export let lastGeminiModel = null;

/** Stable Flash models this key can call, newest first. `preferLite` puts Lite first. */
export async function geminiModelCandidates(apiKey, { preferLite = false } = {}) {
  if (!geminiCatalogue.list.length || Date.now() > geminiCatalogue.until) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${apiKey}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const list = ((await res.json()).models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
          .map((m) => String(m.name || "").replace(/^models\//, ""))
          // Stable Flash and Flash-Lite only: no previews, experiments, TTS or image models.
          .map((id) => ({ id, m: /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/.exec(id) }))
          .filter((x) => x.m)
          .map((x) => ({ id: x.id, v: parseFloat(x.m[1]), lite: !!x.m[2] }));
        geminiCatalogue = { list, until: Date.now() + 6 * 3600 * 1000 };
      }
    } catch {}
  }
  return [...geminiCatalogue.list]
    .sort((a, b) => b.v - a.v || (preferLite ? Number(b.lite) - Number(a.lite) : Number(a.lite) - Number(b.lite)))
    .map((x) => x.id);
}

const geminiRetired = (e) => e?.status === 404 || (e?.status === 400 && /no longer available|not found|is not supported|deprecated/i.test(String(e?.message || "")));
const geminiQuotaSpent = (e) => e?.status === 429 && /exceeded your current quota|per day|RESOURCE_EXHAUSTED/i.test(String(e?.message || ""));
const endOfUtcDay = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };

async function callGeminiSmart(cfg, payload) {
  const first = geminiSwap.from === cfg.model && geminiSwap.to && Date.now() < geminiSwap.until ? geminiSwap.to : cfg.model;
  try {
    const out = await callGemini({ ...cfg, model: first }, payload);
    lastGeminiModel = first;
    return out;
  } catch (e) {
    if (!geminiRetired(e) && !geminiQuotaSpent(e)) throw e;
    let lastErr = e;
    const candidates = (await geminiModelCandidates(cfg.apiKey)).filter((m) => m !== first && m !== cfg.model).slice(0, 3);
    for (const m of candidates) {
      try {
        const out = await callGemini({ ...cfg, model: m }, payload);
        // A retired model is swapped for hours; a spent quota only until it resets.
        geminiSwap = { from: cfg.model, to: m, until: geminiRetired(e) ? Date.now() + 6 * 3600 * 1000 : endOfUtcDay() };
        lastGeminiModel = m;
        logger.warn("ai.gemini.model_switched", { from: first, to: m, reason: geminiRetired(e) ? "retired" : "quota" });
        return out;
      } catch (e2) {
        lastErr = e2;
        if (!geminiRetired(e2) && !geminiQuotaSpent(e2)) break;
      }
    }
    throw lastErr;
  }
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
