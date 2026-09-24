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
import { getEvents } from "@/lib/events";
import { swallow } from "@/lib/log";

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
    } else {
      out.needsOnboarding = true; // authenticated but no scan yet → first run
    }
  } catch {}

  out.greetingName = (user.email || "").split("@")[0] || null;

  // When Genie last finished a run. An owner cannot tell a quiet night from a
  // cron that stopped a fortnight ago, and the difference is the whole product.
  try {
    const runs = await getEvents(supabase, { userId: user.id, types: ["system.run.done"], limit: 1 });
    out.lastRun = runs?.[0]?.created_at || null;
    // What last night ran out of time for. The nightly pass skips the steps it
    // cannot finish inside the hosting plan's function limit, by name — and a skip
    // that is recorded and never shown is the same as a skip that was hidden.
    const sk = runs?.[0]?.data?.skipped;
    out.lastRunSkipped = Array.isArray(sk) ? sk.slice(0, 8) : [];
  } catch {}

  if (host) {
    const entity = await resolveEntity(supabase, user.id, host, ai);
    out.entity = { label: entity.label, type: entity.type, source: entity.source, confidence: entity.confidence, name: entity.name || ai.businessName || host, host };
  }

  // Overnight activity (24h) → stat counts + human summary.
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    // ── EVERY NUMBER COUNTS THE THING IT NAMES ─────────────────────────────
    // All five of these were read off the activity log, by verb or by a regex
    // over the message text. That log is written by every engine for every kind
    // of work, so:
    //   "Articles published"  counted a social post, which also logs "published"
    //   "Emails sent"         counted any message mentioning email
    //   "Replies received"    counted a reply Genie DRAFTED, via /repl/i
    //   "Rankings improved"   counted any message mentioning rank or traction
    // Not one of them was invented, and not one counted what the label said —
    // which from the owner's side is indistinguishable from invented, and is
    // what made them stop believing the rest of the page. Each now reads the
    // table that holds the fact.
    const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const countOf = async (table, build) => {
      try {
        const { count } = await build(supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", user.id));
        return count || 0;
      } catch { return 0; }
    };

    // Articles live on the owner's blog, not lines in a log.
    const published = await countOf("published_pages", (q) => q.eq("status", "published").gte("published_at", since24));
    // Buyers actually staged — the same rows the Buyer Hunt page lists, so the
    // two screens can never disagree again.
    const found = await countOf("placements", (q) => q.eq("status", "ready").contains("meta", { buyer_intent: true }));
    // Email that genuinely left the building.
    const emails = await countOf("outreach_log", (q) => q.eq("status", "sent").gte("sent_at", since24));
    // A reply RECEIVED, which is a different thing from one Genie wrote.
    const replies = await countOf("outreach_log", (q) => q.not("replied_at", "is", null).gte("replied_at", since24));
    // A ranking improves when today's position beats the last one recorded for
    // that keyword. Lower is better in search, so the comparison reads backwards
    // on purpose.
    let ranks = 0;
    try {
      const { data: hist } = await supabase.from("keyword_history")
        .select("keyword, position, recorded_on")
        .eq("user_id", user.id)
        .gte("recorded_on", new Date(Date.now() - 8 * 864e5).toISOString().slice(0, 10))
        .order("recorded_on", { ascending: false }).limit(600);
      const seen = new Map();
      for (const r of hist || []) {
        const k = r.keyword;
        const pos = Number(r.position) || 0;
        if (!pos) continue;
        const prev = seen.get(k);
        if (prev === undefined) { seen.set(k, pos); continue; }
        if (prev < pos) ranks++;           // newest (prev) is a better position
        seen.set(k, -1);                   // one comparison per keyword
      }
    } catch {}

    out.stats = [
      { iconKey: "write", tint: "emerald", n: String(published), label: "Articles published" },
      { iconKey: "conversations", tint: "blue", n: String(found), label: "Buyers found" },
      { iconKey: "mail", tint: "dawn", n: String(emails), label: "Emails sent" },
      { iconKey: "reply", tint: "emerald", n: String(replies), label: "Replies received" },
      { iconKey: "growth", tint: "dawn", n: String(ranks), label: "Rankings improved" },
    ];
    if (published + found + emails + replies + ranks > 0) {
      out.summaryLine = `While you were away I found ${found} buyer${found !== 1 ? "s" : ""}, published ${published} article${published !== 1 ? "s" : ""}, sent ${emails} email${emails !== 1 ? "s" : ""}, and got ${replies} repl${replies !== 1 ? "ies" : "y"} back.`;
    }
  } catch {}

  // AI-search standing. Deliberately NOT the onboarding reveal repeated — that's a
  // one-time shock and repeating it daily turns it into wallpaper. This is the
  // number that should MOVE: where you stand now, and how many answer pages are in
  // flight to change it.
  if (host) {
    try {
      const { data: mem } = await supabase.from("growth_memory").select("meta")
        .eq("user_id", user.id).eq("host", host).eq("mkey", "ai_search_visibility").limit(1);
      const m = mem?.[0]?.meta;
      if (m && typeof m.score === "number") {
        const { data: aeoKw } = await supabase.from("keywords").select("ai_cited")
          .eq("user_id", user.id).eq("host", host).eq("source", "aeo");
        out.aiSearch = {
          score: m.score,
          topCompetitor: m.topCompetitors?.[0]?.name || null,
          engines: m.engines || [],
          working: (aeoKw || []).length,
          won: (aeoKw || []).filter((k) => k.ai_cited).length,
        };
      }
    } catch (e) { swallow("today.aiSearch", e, { userId: user.id, host }); }
  }

  // Approvals (proposed actions) → top cards + count.
  try {
    const { data: actions } = await supabase
      .from("actions").select("id, type, title, priority, payload, target")
      .eq("user_id", user.id).eq("status", "proposed").neq("type", "media_outreach").neq("type", "foundation").neq("type", "recovery").neq("type", "local_services").neq("type", "sprint").limit(20);
    const list = actions || [];
    out.approvalsCount = list.length;
    // How many of the team's bots worked in the last 15 minutes (lib/swarm/live.js),
    // for the live count beside "Your team" in the menu.
    try {
      const { liveView } = await import("@/lib/swarm/live");
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const ev = await getEvents(supabase, { userId: user.id, types: ["swarm.tested", "swarm.improved"], since, limit: 50 });
      const { data: act } = await supabase.from("activity").select("verb, message, created_at").eq("user_id", user.id).gte("created_at", since).limit(50);
      out.teamLive = liveView({ tested: ev.filter((e) => e.type === "swarm.tested"), improved: ev.filter((e) => e.type === "swarm.improved"), activity: act || [] }).activeBots;
    } catch {}
    // Get featured pitches waiting to be sent are in Approvals too (see /api/approvals).
    try {
      const { MEDIA_TYPE, isPendingPitch } = await import("@/lib/media-store");
      const { data: pitches } = await supabase.from("actions").select("payload").eq("user_id", user.id).eq("type", MEDIA_TYPE).order("created_at", { ascending: false }).limit(60);
      out.approvalsCount += Math.min(20, (pitches || []).filter(isPendingPitch).length);
    } catch {}
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

  // Customers won (attribution) — the outcome that matters most, read straight from
  // the event ledger. Counted across the whole account (a conversion may not carry a
  // host) and summed by value. Zero is reported honestly, never hidden — this is the
  // number the whole product exists to move.
  try {
    const convs = await getEvents(supabase, { userId: user.id, types: ["conversion.recorded"], limit: 1000 });
    const value = convs.reduce((s, e) => s + (Number(e?.data?.value) || 0), 0);
    const since = Date.now() - 24 * 3600 * 1000;
    out.customers = {
      count: convs.length,
      value: Math.round(value),
      currency: convs.find((e) => e?.data?.currency)?.data?.currency || "USD",
      last24: convs.filter((e) => new Date(e.created_at).getTime() >= since).length,
    };
  } catch {}

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
