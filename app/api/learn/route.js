// app/api/learn/route.js
// ── THE LEARNING LOOP RUNNER ──
// Distills accumulated outcomes (decisions + placement performance + real keyword
// traffic) into weighted learnings in Growth Memory, so every capability gets
// smarter tomorrow. Runs nightly and on demand. Explainable: it writes a
// learning_synthesis decision so users can see exactly what Genie concluded.

import { resolveRadarUser } from "@/lib/radar-auth";
import { getBrief, recordLearning, recordDecision } from "@/lib/growth-memory";
import { synthesizeLearnings } from "@/lib/learning";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { host, ai = {} } = body || {};
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  const { entity } = await getBrief(supabase, userId, host, ai);

  const [decisions, placements, keywords] = await Promise.all([
    safeSelect(supabase, "decisions", "kind, meta, outcome", userId, host, 300),
    safeSelect(supabase, "placements", "*", userId, host, 300),
    safeSelect(supabase, "keywords", "keyword, gsc_clicks", userId, host, 150),
  ]);

  const learnings = synthesizeLearnings({ decisions, placements, keywords });
  if (learnings.length === 0) {
    return json({ ok: true, count: 0, message: "Not enough results yet — Genie learns as work lands.", learnings: [] });
  }

  // Persist each learning (upsert by key so winners strengthen over time).
  for (const l of learnings) {
    await recordLearning(supabase, { userId, host, key: l.key, insight: l.insight, weight: l.weight, meta: l.meta });
  }
  // Explainability: record the synthesis itself as a decision.
  await recordDecision(supabase, {
    userId, host, kind: "learning_synthesis",
    choice: `${learnings.length} learnings`,
    rationale: learnings.slice(0, 4).map((l) => l.insight).join(" | "),
    meta: { changed: learnings.map((l) => l.changed).filter(Boolean) },
  });
  await logActivity(supabase, userId, {
    host, verb: "learning", icon: "🧠",
    message: `Genie learned ${learnings.length} new ${learnings.length === 1 ? "thing" : "things"} from your results`,
    detail: learnings.slice(0, 2).map((l) => l.changed || l.insight).join(" · "),
  });

  return json({ ok: true, entity: { type: entity.type, label: entity.label }, count: learnings.length, learnings });
}

async function safeSelect(supabase, table, cols, userId, host, limit) {
  try {
    const { data } = await supabase.from(table).select(cols).eq("user_id", userId).eq("host", host).limit(limit);
    return data || [];
  } catch { return []; }
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
