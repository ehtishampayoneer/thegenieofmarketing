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

// GET -> the keywords Genie already picked for this host, formatted for the
// research table (so the page auto-loads populated).
export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  if (!host) return json({ ok: true, keywords: [] });

  const { data: kws } = await supabase.from("keywords").select("*")
    .eq("user_id", user.id).eq("host", host).neq("health", "retired").limit(200);

  const keywords = (kws || []).map((k) => {
    const competition = k.competition ?? 50;
    const difficulty = competition < 40 ? "easy" : competition <= 65 ? "medium" : "hard";
    const volume = potentialToVolume(k.traffic_potential, k.gsc_impressions);
    const volScore = Math.min(100, Math.log10(Math.max(10, volume)) * 22);
    const opportunity = Math.round(Math.max(0, volScore - competition * 0.6));
    const isQuestion = /^(how|what|why|can|is|does|where|when|which|are|should)\b/.test(k.keyword);
    const real = (k.gsc_impressions || 0) > 0;
    return {
      keyword: k.keyword, volume, competition, difficulty,
      cpc: estimateCpc(k.intent, competition),
      trend: real ? "up" : "flat",
      intent: k.intent || "informational", isQuestion,
      opportunity, easyWin: competition < 45 && volume >= 200, highPotential: opportunity >= 45,
      spark: sparkFrom(k.keyword, real ? "up" : "flat"),
      ranking: real ? Math.round(k.gsc_position || 0) || null : (volume > 0 ? Math.max(3, Math.min(98, Math.round(100 - opportunity + competition / 3))) : null),
      rankChange: real ? (k.gsc_clicks > 0 ? Math.ceil(k.gsc_clicks % 12) : 0) : 0,
      inPortfolio: true, real,
      coverage: k.coverage || 0,
    };
  });
  keywords.sort((a, b) => b.opportunity - a.opportunity);
  return json({ ok: true, keywords });
}

function potentialToVolume(p, gscImp) {
  if (gscImp && gscImp > 0) return gscImp; // real impressions
  const map = { 90: 45000, 75: 12000, 60: 3500, 50: 900, 40: 300 };
  return map[p] || (p ? p * 20 : 200);
}
function estimateCpc(intent, comp) {
  const base = intent === "transactional" ? 3.2 : intent === "commercial" ? 1.8 : 0.6;
  return Math.round((base + comp / 40) * 100) / 100;
}
function sparkFrom(seed, trend) {
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 1000;
  const pts = []; let v = 30 + (h % 30);
  const drift = trend === "up" ? 3 : trend === "down" ? -3 : 0;
  for (let i = 0; i < 12; i++) { h = (h * 17 + 7) % 1000; v += drift + ((h % 16) - 8); v = Math.max(8, Math.min(92, v)); pts.push(Math.round(v)); }
  return pts;
}

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
