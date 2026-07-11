// app/api/today/route.js
// ── THE MORNING BRIEF (aggregation) ──
// One endpoint that answers "what did Genie accomplish while I was away, and what
// needs me?" — assembled server-side from everything Genie produced (scans,
// activity, actions, placements, keywords, Growth Memory). Powers /today so the
// Operator UI reads ONE contract instead of fanning out to six endpoints.
// Everything is best-effort; a sparse account returns real-but-small data, and
// unauthenticated callers get ok:false so the page falls back to the demo.

import { createClient } from "@/lib/supabase/server";
import { resolveEntity } from "@/lib/growth-memory";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const out = { ok: true, live: true };

  // Latest scan → entity + score + delta.
  let host = null, ai = {};
  try {
    const { data: scans } = await supabase
      .from("scans").select("overall_score, ai, final_url, url, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
    if (scans?.length) {
      const latest = scans[0];
      host = hostOf(latest);
      ai = latest.ai || {};
      const sameHost = scans.filter((s) => hostOf(s) === host);
      out.growth = {
        score: latest.overall_score ?? null,
        delta: sameHost[1]?.overall_score != null && latest.overall_score != null ? latest.overall_score - sameHost[1].overall_score : null,
      };
    }
  } catch {}

  out.greetingName = (user.email || "").split("@")[0] || null;

  if (host) {
    const entity = await resolveEntity(supabase, user.id, host, ai);
    out.entity = { label: entity.label, type: entity.type, source: entity.source, confidence: entity.confidence, name: entity.name || ai.businessName || host, host };
  }

  // Overnight activity (24h) → stat counts + human summary.
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: acts } = await supabase
      .from("activity").select("verb, message").eq("user_id", user.id).gte("created_at", since).limit(300);
    const a = acts || [];
    const has = (re) => a.filter((x) => re.test(`${x.verb} ${x.message}`)).length;
    const published = a.filter((x) => x.verb === "published").length || has(/publish/i);
    const found = a.filter((x) => x.verb === "discovered").length || has(/found|discover/i);
    const emails = has(/outreach|email|sent/i);
    const replies = a.filter((x) => x.verb === "replied").length || has(/repl/i);
    const ranks = has(/rank|position|climb|traction/i);
    out.stats = [
      { iconKey: "write", tint: "emerald", n: String(published), label: "Articles published" },
      { iconKey: "conversations", tint: "blue", n: String(found), label: "Conversations found" },
      { iconKey: "mail", tint: "dawn", n: String(emails), label: "Emails sent" },
      { iconKey: "reply", tint: "emerald", n: String(replies), label: "Replies received" },
      { iconKey: "growth", tint: "dawn", n: String(ranks), label: "Rankings improved" },
    ];
    if (published + found + emails + replies + ranks > 0) {
      out.summaryLine = `While you were away I found ${found} conversation${found !== 1 ? "s" : ""}, published ${published}, sent ${emails} email${emails !== 1 ? "s" : ""}, and handled ${replies} repl${replies !== 1 ? "ies" : "y"}.`;
    }
  } catch {}

  // Approvals (proposed actions) → top cards + count.
  try {
    const { data: actions } = await supabase
      .from("actions").select("id, type, title, priority, payload, target")
      .eq("user_id", user.id).eq("status", "proposed").limit(20);
    const list = actions || [];
    out.approvalsCount = list.length;
    if (list.length) out.approvals = list.slice(0, 3).map(approvalView);
  } catch {}

  // What Genie learned (Growth Memory) → real learnings.
  if (host) {
    try {
      const { data: mem } = await supabase
        .from("growth_memory").select("insight, weight").eq("user_id", user.id).eq("host", host)
        .order("weight", { ascending: false }).limit(3);
      if (mem?.length) out.learned = mem.map((m) => m.insight);
    } catch {}
  }

  return json(out);
}

function approvalView(a) {
  const p = a.payload || {};
  const brand = brandFor(a.type, p);
  const impact = clampNum(p.impact, priorityScore(a.priority));
  return {
    brand,
    title: a.title || labelFor(a.type),
    desc: p.summary || p.metaDescription || p.desc || labelFor(a.type),
    impact,
    tags: tagsFor(a.priority),
  };
}
function brandFor(type, p) {
  const plat = String(p.platform || "").toLowerCase();
  if (type === "article" || type === "seo_fix" || type === "distribution") return "blog";
  if (type === "outreach_email") return "mail";
  if (type === "ad_campaign") return "ads";
  if (plat.includes("linkedin")) return "linkedin";
  if (plat.includes("quora")) return "quora";
  if (plat.includes("reddit")) return "reddit";
  if (plat.includes("insta")) return "instagram";
  if (plat.includes("medium")) return "medium";
  if (plat.includes("x") || plat.includes("twitter")) return "x";
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
