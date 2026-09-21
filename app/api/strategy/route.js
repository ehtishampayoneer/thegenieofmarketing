// app/api/strategy/route.js
// ── THE PLAN GENIE WORKS TO ──
// One strategy per business, drafted from the scan and the owner's own
// interview, stored on the event ledger, and read by every engine instead of
// each one interpreting the brief for itself.
//
// GET   -> the current strategy, drafting one if there is none yet
// GET ?refresh=1 -> redraft from the latest scan and brief
// POST  -> the owner's corrections, and/or confirming it is right
//
// Drafting costs one free-AI call and is cached until something changes, so the
// nightly run never pays for it. When every provider is busy it falls back to
// the deterministic strategy rather than leaving engines with nothing.

import { createClient } from "@/lib/supabase/server";
import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { recordEvent, getEvents } from "@/lib/events";
import { hostOf } from "@/lib/business";
import { briefText } from "@/lib/business-brief";
import { strategyPrompt, readStrategy, fallbackStrategy, normalizeStrategy, strategyReady } from "@/lib/strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { supabase, user } = await session();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  const stored = refresh ? null : await latest(supabase, user.id);
  if (stored) return json({ ok: true, strategy: stored, drafted: false });

  const { ai, host } = await businessOf(supabase, user.id);
  if (!ai) return json({ ok: true, strategy: null, needsScan: true });

  const { strategy, via } = await draft(supabase, user.id, host, ai);
  return json({ ok: true, strategy, drafted: true, via });
}

export async function POST(request) {
  const { supabase, user } = await session();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  let body = {};
  try { body = await request.json(); } catch {}

  const current = (await latest(supabase, user.id)) || fallbackStrategy((await businessOf(supabase, user.id)).ai || {});
  // The owner's words win over anything Genie worked out, and confirming is
  // what turns "Genie's read of your business" into "the plan".
  const patch = body?.patch && typeof body.patch === "object" ? body.patch : {};
  const next = normalizeStrategy({
    ...current, ...patch,
    source: Object.keys(patch).length ? "owner" : current.source,
    confirmedAt: body?.confirm === false ? null : (body?.confirm ? new Date().toISOString() : current.confirmedAt),
    at: new Date().toISOString(),
  });
  if (!strategyReady(next)) {
    return json({ ok: false, error: "A strategy needs who the customer is, what they want, how you show up, and why it works." }, 400);
  }

  const { host } = await businessOf(supabase, user.id);
  await save(supabase, user.id, host, next, "human");
  return json({ ok: true, strategy: next });
}

// ── the pieces ──────────────────────────────────────────────────────────────

async function session() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** The latest scan's read of the business, which is what a strategy is built on. */
async function businessOf(supabase, userId) {
  try {
    const { data } = await supabase.from("scans").select("ai, url, final_url")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return { ai: data?.ai || null, host: data ? hostOf(data) : "" };
  } catch { return { ai: null, host: "" }; }
}

/** The stored strategy, or null. */
async function latest(supabase, userId) {
  try {
    const rows = await getEvents(supabase, { userId, types: ["strategy.set"], limit: 1 });
    const s = rows?.[0]?.data?.strategy;
    return s ? normalizeStrategy(s) : null;
  } catch { return null; }
}

async function save(supabase, userId, host, strategy, actor) {
  await recordEvent(supabase, {
    userId, host, type: "strategy.set", actor,
    subject: strategy.angle || strategy.who.join(", ") || "strategy",
    data: { strategy },
  });
}

/** Draft one. AI when it can, deterministic when it cannot — never nothing. */
async function draft(supabase, userId, host, ai) {
  let strategy = null, via = "fallback";
  try {
    const res = await callAI({
      system: "You resolve a business into one marketing strategy that other systems execute literally. Return only JSON. Never invent proof, numbers or customers.",
      prompt: strategyPrompt({ ai, briefText: briefText(ai, { max: 2500 }) }),
      json: true, maxTokens: 900, temperature: 0.4, timeoutMs: 40000, userId, host, tag: "strategy",
    });
    strategy = readStrategy(res?.json, ai);
    via = strategy.source === "ai" ? "ai" : "fallback";
  } catch (e) {
    if (!(e instanceof AllProvidersFailedError)) via = "fallback";
    strategy = fallbackStrategy(ai);
  }
  if (!strategy) strategy = fallbackStrategy(ai);
  if (strategyReady(strategy)) await save(supabase, userId, host, strategy, "genie");
  return { strategy, via };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
