// app/api/hunt/route.js
// The Buyer Hunt board's data: every scored buyer the intent radar found, ranked by
// how close they are to buying. Reads the staged buyer-intent placements (the radar
// writes these with meta.intent_score + journey_stage), newest-hottest first, plus a
// summary for the header. Read-only; engaging is done via /api/approvals/act.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAT = {
  reddit: { label: "Reddit", color: "#FF4500" },
  hackernews: { label: "Hacker News", color: "#FF6600" },
  stackexchange: { label: "Software Recs", color: "#F48024" },
  github: { label: "GitHub", color: "#6E5494" },
  quora: { label: "Quora", color: "#B92B27" },
  x: { label: "X", color: "#111827" },
  twitter: { label: "X", color: "#111827" },
  linkedin: { label: "LinkedIn", color: "#0A66C2" },
  youtube: { label: "YouTube", color: "#FF0000" },
  producthunt: { label: "Product Hunt", color: "#DA552F" },
};

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data: pl } = await supabase
    .from("placements")
    .select("id, platform, kind, target_url, target_title, draft, keyword, meta, status, created_at")
    .eq("user_id", user.id).eq("status", "ready").limit(300);

  const buyers = (pl || [])
    .map((p) => {
      const m = p.meta || {};
      const platform = String(p.platform || m.source || "").toLowerCase();
      return {
        id: p.id,
        platform,
        platformLabel: PLAT[platform]?.label || cap(platform || "Community"),
        platformColor: PLAT[platform]?.color || "#6B7280",
        kind: p.kind || "reply",
        url: p.target_url,
        title: cleanTitle(p.target_title, platform),
        draft: p.draft || "",
        intent: clamp(Number(m.intent_score)),
        stage: m.journey_stage || null,
        signals: Array.isArray(m.signals) ? m.signals : [],
        reason: m.reason || null,
        competitor: !!m.competitorMention,
        query: p.keyword || m.query || null,
        createdAt: p.created_at,
      };
    })
    // Buyer-intent items only (scored by the intent radar).
    .filter((b) => b.intent > 0 || b.stage)
    .sort((a, b) => b.intent - a.intent);

  const byStage = {};
  let sum = 0;
  for (const b of buyers) { if (b.stage) byStage[b.stage] = (byStage[b.stage] || 0) + 1; sum += b.intent; }
  const summary = {
    total: buyers.length,
    readyToBuy: byStage.ready_to_buy || 0,
    comparing: byStage.comparing || 0,
    avg: buyers.length ? Math.round(sum / buyers.length) : 0,
    top: buyers[0]?.intent || 0,
    byStage,
  };

  return json({ ok: true, buyers, summary });
}

function cleanTitle(t, platform) {
  let s = String(t || "");
  // Radar stores "platform · title" — strip the prefix for a clean card.
  const dot = s.indexOf(" · ");
  if (dot > -1 && dot < 24) s = s.slice(dot + 3);
  return s.slice(0, 200);
}
function cap(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
function clamp(n) { const v = Number(n); return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
