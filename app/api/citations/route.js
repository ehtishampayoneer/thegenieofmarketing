// app/api/citations/route.js
// ── THE CITATION GAP ("get into the lists") ──
// GET  → the stored report: which third-party pages AI cites for this business's
//        buyer questions, and which of them the business is missing from.
// POST → run the analysis. Reads the sources the AI-search radar already recorded
//        (no second round of web search), crawls each one, and records whether the
//        business appears. A source they're absent from is the opportunity.
//
// Phase 1 is read-only reconnaissance: it finds and reports gaps. Nothing is sent
// to anyone here — outreach is a later phase and goes through the approval queue.

import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { analyzeCitations } from "@/lib/citations";
import { logActivity } from "@/lib/activity";
import { swallow } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let host = new URL(request.url).searchParams.get("host");
  if (!host) host = await latestHost(supabase, user.id);
  if (!host) return json({ ok: true, live: true, targets: [], summary: null });

  let targets = [];
  try {
    const { data, error } = await supabase.from("citation_targets").select("*")
      .eq("user_id", user.id).eq("host", host)
      .order("authority", { ascending: false }).limit(100);
    if (error) throw error;
    targets = data || [];
  } catch (e) {
    swallow("citations.read", e, { userId: user.id, host, hint: "run db/setup.sql for citation_targets" });
    return json({ ok: true, live: true, targets: [], summary: null, degraded: true });
  }

  return json({ ok: true, live: true, host, targets, summary: summarize(targets) });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body = {};
  try { body = await request.json(); } catch {}
  let host = body.host || await latestHost(supabase, user.id);
  if (!host) return json({ ok: false, error: "Run a scan first." }, 400);

  // Business identity + rivals, for mention detection.
  let businessName = host, competitors = [];
  try {
    const { data: scan } = await supabase.from("scans").select("ai").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    businessName = scan?.ai?.businessName || host;
    competitors = (scan?.ai?.competitors || []).map((c) => c?.name || c).filter(Boolean).slice(0, 8);
  } catch (e) { swallow("citations.scan", e, { userId: user.id, host }); }

  // The pages AI cites, recorded by the AI-search radar.
  let sources = [];
  try {
    const { data: decisions } = await supabase.from("decisions")
      .select("choice, meta").eq("user_id", user.id).eq("host", host).eq("kind", "aeo_gap")
      .order("created_at", { ascending: false }).limit(12);
    for (const d of decisions || []) {
      for (const s of d.meta?.sources || []) {
        if (s?.url) sources.push({ url: s.url, title: s.title || "", question: d.choice || null });
      }
    }
  } catch (e) { swallow("citations.sources", e, { userId: user.id, host }); }

  if (!sources.length) {
    return json({
      ok: false, needsAiSearch: true,
      message: "Run the AI-search check first — that's what finds the pages AI cites for your buyers.",
    }, 400);
  }

  const result = await analyzeCitations(supabase, { userId: user.id, host, businessName, competitors, sources });

  await logActivity(supabase, user.id, {
    host, verb: "discovered", icon: "🔗",
    message: `Checked ${result.checked} pages AI cites — you're missing from ${result.gaps}`,
    detail: result.alreadyIn > 0 ? `Already listed in ${result.alreadyIn}` : "These are the lists to get into",
    meta: { checked: result.checked, gaps: result.gaps },
  });

  return json({ ok: true, ...result, summary: summarize(result.targets) });
}

function summarize(targets) {
  const t = targets || [];
  const gaps = t.filter((x) => x.mentioned === false);
  const actionable = gaps.filter((x) => x.meta?.actionable && !x.pay_to_play);
  const rivals = {};
  for (const x of gaps) for (const c of x.competitors_found || []) rivals[c] = (rivals[c] || 0) + 1;
  return {
    checked: t.length,
    gaps: gaps.length,
    alreadyIn: t.filter((x) => x.mentioned === true).length,
    actionable: actionable.length,
    unreachable: t.filter((x) => x.mentioned == null).length,
    topRivals: Object.entries(rivals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({ name, count })),
  };
}

async function latestHost(supabase, userId) {
  try {
    const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ? hostOf(data) : null;
  } catch { return null; }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
