// app/api/ai-search/route.js
// ── AI-SEARCH VERDICT RADAR (intent-fused) ──
// For the buyer questions Genie is hunting, ASK the real AI models directly what
// they recommend, detect whether the business is named in the actual answer,
// expose who wins instead, and recommend the content that captures the citation.
// Every gap + recommendation is written to the Decision Ledger and Growth Memory
// so it's explainable and compounds with content/outreach.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { webSearch } from "@/lib/search";
import { getBrief, recordDecision, recordLearning } from "@/lib/growth-memory";
import { aiSearchQuestions, summarizeVisibility, runVerdict } from "@/lib/ai-search";
import { logActivity, logActivityBatch } from "@/lib/activity";
import { recordEvent, getEvents } from "@/lib/events";

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

  const { entity } = await getBrief(supabase, userId, host, ai);
  const ctx = { supabase, userId, host, tag: "ai-search" };

  let keywords = [];
  try {
    const { data } = await supabase.from("keywords").select("keyword").eq("user_id", userId).eq("host", host).limit(6);
    keywords = (data || []).map((k) => k.keyword);
  } catch {}

  const questions = aiSearchQuestions(entity, ai, keywords);
  if (questions.length === 0) return json({ ok: false, needsContext: true, message: "Genie needs a scan or keyword to check AI search." }, 400);

  await logActivity(supabase, userId, {
    host, verb: "scanning", icon: "🔮",
    message: `Asking real AI models what they recommend for ${questions.length} buyer questions`,
    detail: "Google Gemini + any GPT/Llama engine you've connected — asked directly",
  });

  // Run the REAL multi-engine verdict and retrieve the third-party sources an AI
  // engine draws on (for the Citation Gap "get into these lists" chain) IN
  // PARALLEL. runVerdict asks each reachable model the buyer question directly and
  // detects the business in the actual answer — no self-reported "am I cited?".
  const [verdict, retrieved] = await Promise.all([
    runVerdict({ entity: { ...entity, host: entity?.host || host }, ai, questions, ctx }),
    Promise.allSettled(questions.map((q) => webSearch(q.query, { limit: 4, ctx }))),
  ]);

  // Honest failure: if we couldn't reach a single AI model, say so — never report
  // a fake 0% that reads as "you're invisible" when we simply couldn't ask.
  if (!verdict.engineCount) {
    return json({ ok: false, reason: "no_ai_engine", retryable: true, message: "Genie couldn't reach any AI model to ask right now. Add an AI key (Gemini is free) or try again in a moment." }, 503);
  }

  // Attach retrieved sources to each question's verdict (the Citation Gap engine
  // turns these into "get listed here" targets for the gaps).
  const results = verdict.perQuestion.map((r, i) => ({
    ...r,
    sources: (retrieved[i]?.status === "fulfilled" ? retrieved[i].value : []).slice(0, 3).map((s) => ({ title: s.title, url: s.url })),
  }));

  const summary = summarizeVisibility(results);
  const engineNames = verdict.engines.map((e) => e.label);

  // 3) Record every gap (explainability) + the visibility learning (compounding).
  for (const g of summary.gaps.slice(0, 8)) {
    await recordDecision(supabase, {
      userId, host, kind: "aeo_gap", choice: g.question,
      rationale: g.gap || `Not cited by AI for a ${g.stage} buyer question`,
      confidence: g.confidence / 100,
      // sources = the third-party pages AI actually draws on for this question.
      // The Citation Gap engine turns these into "get into the list" targets, so
      // they're persisted here rather than recomputed with another round of search.
      meta: { stage: g.stage, competitorsCited: g.competitorsCited, recommendation: g.recommendation, expectedOutcome: g.expectedOutcome, sources: g.sources || [] },
    });
  }
  await recordLearning(supabase, {
    userId, host, key: "ai_search_visibility",
    insight: `${engineNames.join(" & ") || "AI"} name you in ${summary.visible}/${summary.total} buyer answers (~${summary.score}%)${summary.topCompetitors[0] ? `; they most often recommend ${summary.topCompetitors[0].name}` : ""}. Win with AEO comparison/answer pages.`,
    weight: 2, meta: { score: summary.score, topCompetitors: summary.topCompetitors, engines: engineNames },
  });

  // Append a visibility SNAPSHOT to the ledger — the time-series that powers the
  // "watch AI start recommending you" proof. `cited` = the questions cited THIS run,
  // so the GET can diff consecutive snapshots into "newly won" citations.
  try {
    await recordEvent(supabase, {
      userId, host, type: "aeo.snapshot", actor: "genie", subject: host,
      data: {
        score: summary.score, visible: summary.visible, total: summary.total,
        engines: engineNames,
        competitors: summary.topCompetitors.map((c) => c.name).slice(0, 3),
        cited: results.filter((r) => r.aiCitesYou).map((r) => r.question),
      },
    });
  } catch {}

  // ── FEED THE CHAIN ── Turn each AI-search gap into a tracked keyword target, so
  // the content engine writes an AI-citable answer page for it and coverage tracks
  // the fight to get cited. source='aeo' badges them as AI-search targets. When
  // ai-search re-runs later, the visibility score reflects whether it's working.
  try {
    const rows = summary.gaps.slice(0, 5).map((g) => ({
      user_id: userId, host,
      keyword: String(g.question || "").toLowerCase().trim().slice(0, 120),
      intent: g.stage === "ready_to_buy" ? "transactional" : g.stage === "comparing" ? "commercial" : "informational",
      priority: 1, source: "aeo",
      traffic_potential: 55, competition: 45, coverage: 0, health: "new",
      rationale: g.gap ? `AI-search gap — ${g.gap}` : "AI recommends competitors here. Genie will write an answer page to win the citation.",
    })).filter((r) => r.keyword.length > 3);
    if (rows.length) await supabase.from("keywords").upsert(rows, { onConflict: "user_id,host,keyword", ignoreDuplicates: true });
  } catch {}

  // Stamp the per-keyword AI-citation status on every matching keyword, so the
  // Growth results view can show "AI cites you ✓" vs "not yet" and the change over
  // time. Runs after the seed so newly-added gaps get stamped too.
  try {
    const nowIso = new Date().toISOString();
    for (const r of results) {
      const kw = String(r.question || "").toLowerCase().trim().slice(0, 120);
      if (!kw) continue;
      await supabase.from("keywords").update({ ai_cited: !!r.aiCitesYou, ai_checked_at: nowIso })
        .eq("user_id", userId).eq("host", host).eq("keyword", kw);
    }
  } catch {}

  await logActivityBatch(supabase, userId, [
    { host, verb: "discovered", icon: "🔮", message: `${engineNames.join(" & ") || "AI"} name you in ${summary.visible}/${summary.total} buyer answers`, detail: `Asked ${engineNames.join(" · ")} directly — ${summary.gaps.slice(0, 2).map((g) => g.question).join(" · ")}`, meta: { score: summary.score, engines: engineNames } },
    summary.gaps.length ? { host, verb: "learning", message: `${summary.gaps.length} AI-search gaps found — Genie drafted content plans to win them`, meta: { gaps: summary.gaps.length } } : null,
  ].filter(Boolean));

  return json({
    ok: true,
    measured: true,
    entity: { type: entity.type, label: entity.label },
    engines: verdict.engines,
    score: summary.score,
    visible: summary.visible,
    total: summary.total,
    topCompetitors: summary.topCompetitors,
    byStage: summary.byStage,
    opportunities: results.sort((a, b) => Number(a.aiCitesYou) - Number(b.aiCitesYou) || b.intent - a.intent),
  });
}

// Read stored AI-search results (from the Decision Ledger) for the surface.
export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let host = new URL(request.url).searchParams.get("host");
  try {
    if (!host) {
      const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      host = data ? hostOf(data) : null;
    }
  } catch {}

  let decisions = [], score = null, competitors = [], engines = [], topCompetitors = [], total = null, visible = null;
  try {
    let q = supabase.from("decisions").select("choice, rationale, confidence, meta, created_at").eq("user_id", user.id).eq("kind", "aeo_gap").order("created_at", { ascending: false }).limit(12);
    if (host) q = q.eq("host", host);
    const { data } = await q; decisions = data || [];
  } catch {}
  try {
    let q = supabase.from("growth_memory").select("meta").eq("user_id", user.id).eq("mkey", "ai_search_visibility").limit(1);
    if (host) q = q.eq("host", host);
    const { data } = await q;
    const m = data?.[0]?.meta;
    if (m) { score = m.score ?? null; topCompetitors = m.topCompetitors || []; competitors = topCompetitors.map((c) => c.name); engines = m.engines || []; }
  } catch {}

  const opportunities = decisions.map((d) => {
    const rec = d.meta?.recommendation || {};
    return {
      question: d.choice,
      competitorsCited: d.meta?.competitorsCited || [],
      stage: d.meta?.stage || "comparing",
      discovered: `When buyers ask AI “${d.choice}”, you’re not cited`,
      badges: [{ label: String(d.meta?.stage || "comparing").replace(/_/g, " "), tone: "dawn" }, { label: "Not cited", tone: "danger" }],
      why: d.rationale || "AI recommends competitors instead at the moment of decision.",
      recommendation: rec.title || "Publish an AI-citable answer page.",
      ifApproved: "Genie writes it AEO-structured (direct answer, comparison table, FAQ schema) and publishes.",
      outcome: d.meta?.expectedOutcome || "Become citable for a high-intent AI answer.",
      rationale: d.rationale || null,
      confidence: Math.round((d.confidence ?? 0.7) * 100) || 70,
      tint: "dawn",
    };
  });

  // The proof timeline — visibility over time + citations newly won since last run.
  // Read straight from the append-only snapshot events (getEvents is newest-first).
  let history = [], newlyCited = [];
  try {
    const evs = await getEvents(supabase, { userId: user.id, host: host || null, types: ["aeo.snapshot"], limit: 60 });
    history = evs.map((e) => ({ date: e.created_at, score: Number(e.data?.score) || 0, visible: Number(e.data?.visible) || 0, total: Number(e.data?.total) || 0 })).reverse(); // oldest→newest for charting
    if (evs.length >= 2) {
      const latest = new Set(evs[0].data?.cited || []);
      const prev = new Set(evs[1].data?.cited || []);
      newlyCited = [...latest].filter((q) => !prev.has(q)).slice(0, 5);
    }
  } catch {}
  const _last = history[history.length - 1];
  if (_last) { total = _last.total || total; visible = _last.visible || visible; }

  return json({ ok: true, live: true, score, competitors, topCompetitors, total, visible, engines, history, newlyCited, opportunities });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
