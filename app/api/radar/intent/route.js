// app/api/radar/intent/route.js
// ── THE BUYER-INTENT RADAR ──
// Finds people most likely to become customers across the whole journey and many
// surfaces, ranks them by intent, and drafts the right entity-adapted move for
// each — then records WHY (Decision Ledger) so Genie can explain and learn.
// Goal: qualified buyers, not traffic.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { resolveRadarUser } from "@/lib/radar-auth";
import { webSearch, redditSearch } from "@/lib/search";
import { getBrief, recordDecision } from "@/lib/growth-memory";
import { buildIntentQueries, selectSources, scoreIntent, reachabilityFor, rankOpportunities } from "@/lib/intent";
import { cooldownFor } from "@/lib/cadence";
import { logActivity, logActivityBatch } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { host, ai = {} } = body || {};
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  // 1) Who are we growing? Pull entity + everything Genie has learned about it.
  const { entity, brief } = await getBrief(supabase, userId, host, ai);

  // 2) Seed the buyer-question universe (keywords sharpen it; entity alone works).
  let keywords = [];
  try {
    const { data } = await supabase.from("keywords").select("keyword").eq("user_id", userId).eq("host", host).limit(6);
    keywords = (data || []).map((k) => k.keyword);
  } catch {}
  const queries = buildIntentQueries(entity, ai, keywords);
  if (queries.length === 0) return json({ ok: false, needsContext: true, message: "Genie needs a scan or a keyword to hunt buyers." }, 400);

  const sources = selectSources(entity);
  await logActivity(supabase, userId, {
    host, verb: "scanning", icon: "🎯",
    message: `Hunting buyer intent across ${sources.length} surfaces`,
    detail: sources.map((s) => s.label).join(", "), meta: { queries: queries.length },
  });

  // 3) Hunt — bounded, parallel. The entity playbook already chose the surfaces.
  const competitors = (ai.competitors || []).map((c) => c?.name).filter(Boolean);
  const pairs = [];
  for (const s of sources) for (const q of queries.slice(0, s.key === "reddit" ? 4 : 3)) pairs.push({ s, q });
  const settled = await Promise.allSettled(pairs.slice(0, 14).map(({ s, q }) => runOne(s, q)));
  let candidates = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // 4) Score every candidate for buyer intent, competitor-aware; keep the best.
  candidates = candidates.map((c) => ({ ...c, intent: scoreIntent(`${c.title} ${c.snippet || ""}`, { competitors }) }))
    .filter((c) => c.intent.score >= 45);
  candidates = rankOpportunities(candidates);

  // Don't re-surface things already staged.
  try {
    const { data: existing } = await supabase.from("placements").select("target_url").eq("user_id", userId).eq("host", host);
    const seen = new Set((existing || []).map((p) => p.target_url));
    candidates = candidates.filter((c) => !seen.has(c.url));
  } catch {}

  const top = candidates.slice(0, 8);
  if (top.length === 0) {
    return json({ ok: true, found: 0, staged: 0, message: "No fresh high-intent buyers found this run — Genie will keep hunting.", entity: slim(entity) });
  }

  // 5) Genie confirms intent + drafts the right entity-adapted move for each.
  let refined;
  try {
    const result = await callAI({
      system:
        `You are Genie, a buyer-intent specialist. ${brief}\n` +
        "For each candidate, decide if this is a GENUINE buyer actively researching/comparing/deciding (fit:true) or noise (fit:false). " +
        "Rate intent 0-100 and name the journey stage. Write the RIGHT move for the platform, in the entity's voice — value-first, genuinely helpful, product mentioned only where it truly helps. Never spammy. Return ONLY JSON.",
      json: true, maxTokens: 3200, temperature: 0.6,
      prompt: buildPrompt(top, entity),
    });
    refined = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, message: "Genie is busy — try again." }, 503);
    refined = { opportunities: [] };
  }

  const items = Array.isArray(refined?.opportunities) ? refined.opportunities : [];
  const rows = [];
  const decisions = [];
  const opportunities = [];

  for (const it of items) {
    const c = top[it.index];
    if (!c || it.fit === false) continue;
    const reach = reachabilityFor(c.platform);
    const action = it.action || reach.action;
    const intent = clampNum(it.intent, c.intent.score);
    const stage = it.stage || c.intent.stage;
    const meta = { buyer_intent: true, intent_score: intent, journey_stage: stage, signals: c.intent.signals, source: c.source, reason: it.rationale || null, competitorMention: c.intent.competitorMention, query: c.query };

    opportunities.push({ title: c.title, url: c.url, platform: c.platform, stage, intent, action, rationale: it.rationale || null, draft: it.draft || null });

    // Reachable actions become tap-ready placements (flow into Today/Approvals).
    if (["reply", "answer", "post"].includes(action) && it.draft) {
      rows.push({
        user_id: userId, host, platform: c.platform, owned: reach.owned, keyword: c.query,
        target_url: c.url, target_title: `${c.platform} · ${c.title}`.slice(0, 200),
        kind: action, draft: it.draft, status: "ready", cooldown_days: cooldownFor(c.platform), meta,
      });
    }
    decisions.push({ userId, host, kind: "buyer_intent_pick", choice: c.title, rationale: it.rationale || `${stage} · intent ${intent}`, confidence: intent / 100, meta: { platform: c.platform, url: c.url, stage, source: c.source } });
  }

  let staged = 0;
  if (rows.length) {
    try {
      const { data: inserted } = await supabase.from("placements").insert(rows).select("id");
      staged = (inserted || []).length;
    } catch {}
  }
  // Explainability + the seed of the Learning Loop: log why Genie chose each.
  for (const d of decisions) await recordDecision(supabase, d);

  const byStage = opportunities.reduce((a, o) => { a[o.stage] = (a[o.stage] || 0) + 1; return a; }, {});
  await logActivityBatch(supabase, userId, [
    { host, verb: "discovered", icon: "🎯", message: `Found ${opportunities.length} buyer${opportunities.length !== 1 ? "s" : ""} researching now`, detail: opportunities.slice(0, 3).map((o) => o.title).join(" · "), meta: { byStage } },
    staged ? { host, verb: "staged", message: `Staged ${staged} high-intent repl${staged !== 1 ? "ies" : "y"} to reach them`, meta: { staged } } : null,
  ].filter(Boolean));

  return json({
    ok: true,
    entity: slim(entity),
    found: opportunities.length,
    staged,
    summary: { byStage, sources: sources.map((s) => s.label), topIntent: opportunities[0]?.intent ?? null },
    opportunities: opportunities.sort((a, b) => b.intent - a.intent),
  });
}

async function runOne(source, q) {
  try {
    const results = source.key === "reddit"
      ? await redditSearch(q.query, { limit: 4 })
      : await webSearch(q.query, { site: source.site || "", limit: 4 });
    return (results || []).map((r) => ({ ...r, platform: source.platform, source: source.key, query: q.query, stageHint: q.stage }));
  } catch { return []; }
}

function buildPrompt(candidates, entity) {
  const list = candidates.map((c, i) =>
    `[${i}] platform: ${c.platform} | intent(pre): ${c.intent.score} | signals: ${c.intent.signals.join(", ") || "—"} | query: "${c.query}"
title: ${c.title}
context: ${(c.snippet || "").slice(0, 220) || "(none)"}`
  ).join("\n\n");

  return `Entity: ${entity.label} — ${entity.dims.audience} audience, goal: ${entity.playbook.primaryGoal}.

Buyer candidates Genie found (write the move for each genuine buyer):
${list}

Return ONLY this JSON:
{
  "opportunities": [
    {
      "index": 0,
      "fit": true,
      "stage": "comparing",
      "intent": 88,
      "action": "reply",
      "rationale": "one line: why this is a real buyer and how to help",
      "draft": "the value-first move in the entity's voice — genuinely helpful, product only where it truly fits, no marketing tone"
    }
  ]
}
Reject anything that isn't a real person researching/comparing/deciding (fit:false). Never force a pitch.`;
}

function slim(e) { return e ? { type: e.type, label: e.label, goal: e.playbook?.primaryGoal } : null; }
function clampNum(n, dflt) { const v = Number(n); return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : dflt; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
