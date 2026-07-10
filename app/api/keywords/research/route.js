// app/api/keywords/research/route.js
// POST { seed } -> real discovery (Google Autocomplete) + AI enrichment -> a
//   full keyword table (volume/trend/competition/difficulty/intent).
// PUT  { host, keywords:[...] } -> add selected researched keywords into the
//   marketing portfolio so Genie starts growing them everywhere.

import { createClient } from "@/lib/supabase/server";
import { discoverKeywords, enrichKeywords } from "@/lib/keyword-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { seed, productContext } = body || {};
  if (!seed?.trim()) return json({ ok: false, error: "Enter a keyword to research." }, 400);

  const raw = await discoverKeywords(seed);
  const keywords = await enrichKeywords(seed, raw, productContext);
  // Sort by volume desc (like a real tool).
  keywords.sort((a, b) => b.volume - a.volume);

  return json({
    ok: true,
    seed,
    discovered: raw.length,
    total: keywords.length,
    keywords,
    note: raw.length > 0 ? "Keywords discovered from Google. Volumes are estimates until you connect Search Console." : "Google discovery was unavailable, so these are AI-generated ideas with estimates.",
  });
}

// Add selected researched keywords into the growth portfolio.
export async function PUT(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, keywords } = body || {};
  if (!host || !Array.isArray(keywords) || keywords.length === 0) return json({ ok: false, error: "Nothing to add." }, 400);

  const rows = keywords.slice(0, 100).map((k) => ({
    user_id: user.id, host,
    keyword: String(k.keyword || "").toLowerCase().trim(),
    intent: k.intent || "informational",
    priority: 2, source: "research",
    traffic_potential: volumeToPotential(k.volume),
    competition: k.competition ?? 50,
    coverage: 0, health: "new",
    rationale: "Added from keyword research.",
  })).filter((r) => r.keyword);

  const { error } = await supabase.from("keywords").upsert(rows, { onConflict: "user_id,host,keyword", ignoreDuplicates: true });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, added: rows.length });
}

function volumeToPotential(v) {
  if (!v) return 40;
  if (v >= 50000) return 90;
  if (v >= 10000) return 75;
  if (v >= 2000) return 60;
  if (v >= 500) return 50;
  return 40;
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
