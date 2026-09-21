// app/api/strategy/route.js
// ── THE PLAN GENIE WORKS TO ──
// One strategy per business, drafted from the scan and the owner's own
// interview, stored on the event ledger, and read by every engine instead of
// each one interpreting the brief for itself.
//
// GET   -> the current strategy (drafting one if there is none yet) + anything
//          Genie has learned since that disagrees with it, awaiting the owner
// GET ?refresh=1 -> redraft from the latest scan and brief
// POST  -> the owner's corrections, confirming it is right, or answering a
//          proposal with { proposal: "accept" | "dismiss" }
//
// Drafting costs one free-AI call and is cached until something changes, so the
// nightly run never pays for it. When every provider is busy it falls back to
// the deterministic strategy rather than leaving engines with nothing.

import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { fallbackStrategy, normalizeStrategy, strategyReady } from "@/lib/strategy";
import { getStrategy, storedStrategy, saveStrategy } from "@/lib/strategy-store";
import { storedProposal, answerProposal } from "@/lib/brain-learn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { supabase, user } = await session();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  // What the engines learned since this plan was written, if it disagrees with
  // it. Genie never applies this itself: the owner reads the evidence and says.
  const proposal = await storedProposal(supabase, user.id);

  const stored = refresh ? null : await storedStrategy(supabase, user.id);
  if (stored && strategyReady(stored)) return json({ ok: true, strategy: stored, drafted: false, proposal });

  const { ai, host } = await businessOf(supabase, user.id);
  if (!ai) return json({ ok: true, strategy: null, needsScan: true });

  const strategy = await getStrategy(supabase, { userId: user.id, host, ai, draft: true });
  return json({ ok: true, strategy, drafted: true, via: strategy?.source || "fallback", proposal });
}

export async function POST(request) {
  const { supabase, user } = await session();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  let body = {};
  try { body = await request.json(); } catch {}

  const current = (await storedStrategy(supabase, user.id)) || fallbackStrategy((await businessOf(supabase, user.id)).ai || {});

  // Answering what Genie learned. Accepting merges it in as the owner's own plan,
  // because they agreed to it; dismissing records that so it is not asked again.
  if (body?.proposal === "accept" || body?.proposal === "dismiss") {
    const { host: h } = await businessOf(supabase, user.id);
    const pending = await storedProposal(supabase, user.id);
    if (!pending) return json({ ok: false, error: "There is nothing waiting." }, 400);
    await answerProposal(supabase, { userId: user.id, host: h, accepted: body.proposal === "accept" });
    if (body.proposal === "dismiss") return json({ ok: true, strategy: current, dismissed: true });

    const { reason, ...fields } = pending.patch || {};
    const merged = normalizeStrategy({ ...current, ...fields, source: "owner", at: new Date().toISOString() });
    if (!strategyReady(merged)) return json({ ok: false, error: "That change would leave the plan incomplete." }, 400);
    await saveStrategy(supabase, user.id, h, merged, "human");
    return json({ ok: true, strategy: merged, applied: true });
  }

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
  await saveStrategy(supabase, user.id, host, next, "human");
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
