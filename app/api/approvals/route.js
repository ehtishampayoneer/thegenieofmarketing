// app/api/approvals/route.js
// ── THE UNIFIED APPROVAL QUEUE (aggregation) ──
// One queue for everything that needs the user: proposed actions (articles,
// social, outreach, SEO fixes) + ready placements (community replies, buyer-intent
// moves). Cadence-ordered: your OWNED accounts first (auto-publishable), then
// community taps, ranked by impact/intent. The single contract the Approval
// surface reads. Best-effort; unauth → ok:false so the UI falls back to demo.

import { createClient } from "@/lib/supabase/server";
import { toOutcome } from "@/lib/outcomes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const items = [];

  try {
    const { data: actions } = await supabase
      .from("actions").select("id, type, title, priority, payload, target, status")
      .eq("user_id", user.id).eq("status", "proposed").limit(50);
    for (const a of actions || []) items.push(normalizeAction(a));
  } catch {}

  try {
    const { data: placements } = await supabase
      .from("placements").select("*").eq("user_id", user.id).eq("status", "ready").limit(50);
    for (const p of placements || []) items.push(normalizePlacement(p));
  } catch {}

  // Owned (auto-publishable) first, then by impact/intent.
  items.sort((a, b) => Number(b.owned) - Number(a.owned) || b.impact - a.impact);

  const ownedCount = items.filter((i) => i.owned).length;
  return json({ ok: true, live: true, count: items.length, ownedCount, items });
}

function normalizeAction(a) {
  const p = a.payload || {};
  const platform = String(p.platform || a.target?.channel || p.channel || "").toLowerCase();
  const isX = /\b(x|twitter)\b/.test(platform);
  const owned = a.type === "article" || (a.type === "social_post" && isX) || (a.type === "distribution" && isX);
  const executable = a.type === "article" || isX;
  const o = toOutcome(a);
  const draft = p.body || p.text || (Array.isArray(p.draft) ? p.draft.join("\n\n") : p.draft) || "";
  return {
    id: a.id, source: "action", kind: a.type, platform, owned, executable,
    brand: brandFor(a.type, p, platform),
    title: o.title || a.title || labelFor(a.type),
    outcome: o.value || "",
    draft, why: p.rationale || null, target_url: p.url || null,
    impact: clampNum(p.impact, priorityScore(a.priority)),
    tags: tagsFor(a.priority),
  };
}

function normalizePlacement(p) {
  const meta = p.meta || {};
  const owned = !!p.owned;
  const stage = meta.journey_stage ? String(meta.journey_stage).replace(/_/g, " ") : null;
  const tags = [
    meta.buyer_intent ? { label: "Buyer intent", tone: "dawn" } : { label: "Community", tone: "info" },
    stage ? { label: stage, tone: "neutral" } : null,
  ].filter(Boolean);
  return {
    id: p.id, source: "placement", kind: p.kind || "reply", platform: p.platform, owned, executable: false,
    brand: p.platform,
    title: p.target_title || p.platform,
    outcome: meta.buyer_intent ? `Reach a ${stage || "buyer"} who’s deciding now` : "Show up where your customers are",
    draft: p.draft || "", why: meta.reason || null, target_url: p.target_url || null,
    impact: clampNum(meta.intent_score, 70),
    tags,
  };
}

function brandFor(type, p, platform) {
  if (type === "article" || type === "seo_fix" || type === "distribution") return "blog";
  if (type === "outreach_email") return "mail";
  if (type === "ad_campaign") return "ads";
  if (platform.includes("linkedin")) return "linkedin";
  if (platform.includes("quora")) return "quora";
  if (platform.includes("reddit")) return "reddit";
  if (platform.includes("insta")) return "instagram";
  if (platform.includes("medium")) return "medium";
  if (platform.includes("x") || platform.includes("twitter")) return "x";
  if (type === "community_engagement") return "reddit";
  if (type === "social_post") return "x";
  return "default";
}
function labelFor(type) { return String(type || "action").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function priorityScore(p) { return { high: 92, quick_win: 80, strategic: 74, medium: 66, low: 50 }[p] ?? 66; }
function tagsFor(p) {
  if (p === "high") return [{ label: "High impact", tone: "dawn" }];
  if (p === "quick_win") return [{ label: "Quick win", tone: "live" }];
  if (p === "strategic") return [{ label: "Strategic", tone: "info" }];
  return [{ label: "Ready", tone: "neutral" }];
}
function clampNum(n, dflt) { const v = Number(n); return Number.isFinite(v) ? Math.round(v) : dflt; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
