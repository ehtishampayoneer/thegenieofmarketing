// app/api/scans/route.js
// Saves a completed scan to the signed-in user's history, and lists their
// past scans. Relies on Supabase RLS: a user can only touch their own rows.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Save a scan (called automatically after a scan completes, if logged in).
export async function POST(request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not logged in — nothing to save, and that's fine.
    return json({ ok: false, reason: "not_authenticated" }, 200);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const { url, finalUrl, scores, accuracy, checks, ai, speed } = body || {};
  if (!url || !scores) {
    return json({ ok: false, error: "Missing scan data." }, 400);
  }

  // MEMORY: find the most recent previous scan of the SAME site to compare against.
  const host = hostOf(finalUrl || url);
  let comparison = null;
  try {
    const { data: prior } = await supabase
      .from("scans")
      .select("overall_score, checks, created_at, final_url, url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const prev = (prior || []).find((s) => hostOf(s.final_url || s.url) === host);
    if (prev) comparison = compareScans(prev, { overall: scores.overall, checks });
  } catch {
    // comparison is best-effort
  }

  const { data, error } = await supabase
    .from("scans")
    .insert({
      user_id: user.id,
      url,
      final_url: finalUrl || null,
      overall_score: scores.overall ?? null,
      scores,
      accuracy: accuracy?.percent ?? null,
      checks: checks || null,
      ai: ai || null,
      speed: speed || null,
    })
    .select("id, created_at")
    .single();

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, id: data.id, createdAt: data.created_at, comparison });
}

function compareScans(prev, current) {
  const prevChecks = Array.isArray(prev.checks) ? prev.checks : [];
  const curChecks = Array.isArray(current.checks) ? current.checks : [];
  const prevMap = new Map(prevChecks.map((c) => [c.id, c.status]));

  const improved = [];
  const regressed = [];
  for (const c of curChecks) {
    const was = prevMap.get(c.id);
    if (was === undefined) continue;
    const wasPass = was === "pass";
    const nowPass = c.status === "pass";
    if (!wasPass && nowPass) improved.push(c.label);
    else if (wasPass && !nowPass) regressed.push(c.label);
  }

  return {
    prevScore: prev.overall_score ?? null,
    newScore: current.overall ?? null,
    delta: (current.overall ?? 0) - (prev.overall_score ?? 0),
    prevDate: prev.created_at,
    improved: improved.slice(0, 6),
    regressed: regressed.slice(0, 6),
  };
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u || "";
  }
}

// List the signed-in user's past scans (newest first, lightweight fields only).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return json({ ok: false, reason: "not_authenticated" }, 200);

  const { data, error } = await supabase
    .from("scans")
    .select("id, url, final_url, overall_score, scores, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, scans: data });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
