// app/api/stories/route.js
// THE PLACEMENT STORY — assembles each conversation Genie is running into a
// living narrative: found → wrote → posted → traction → replies → watching.
// Pure surfacing of data Genie already has (placements + notifications).

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  let pq = supabase.from("placements").select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(60);
  if (host) pq = pq.eq("host", host);
  const { data: placements } = await pq;

  // Reply notifications tied to placements.
  const { data: notes } = await supabase.from("notifications").select("*")
    .eq("user_id", user.id).eq("kind", "reply").order("created_at", { ascending: false }).limit(100);
  const repliesByPlacement = {};
  for (const n of notes || []) {
    if (n.placement_id) (repliesByPlacement[n.placement_id] ||= []).push(n);
  }

  const stories = (placements || []).map((p) => {
    const eng = p.engagement || {};
    const replies = repliesByPlacement[p.id] || [];
    const steps = [];

    // 1. Found
    steps.push({
      stage: "found", icon: "🔍", at: p.created_at,
      title: `Found a conversation on ${platformLabel(p.platform)}`,
      detail: p.target_title || p.target_url,
      meta: p.keyword ? `matched "${p.keyword}"` : null,
    });
    // 2. Wrote
    if (p.draft) steps.push({
      stage: "wrote", icon: "✍️", at: p.created_at,
      title: "Wrote your value-first reply",
      detail: p.draft.slice(0, 140) + (p.draft.length > 140 ? "…" : ""),
    });
    // 3. Posted or ready
    if (p.status === "posted") {
      steps.push({ stage: "posted", icon: "✅", at: p.posted_at, title: "You posted this", detail: p.target_url });
    } else if (p.status === "ready") {
      steps.push({ stage: "ready", icon: "👆", at: p.created_at, title: "Ready — one tap to post", detail: null, cta: true });
    }
    // 4. Traction
    if (p.status === "posted" && (eng.upvotes != null || eng.comments != null)) {
      const bits = [];
      if (eng.upvotes != null) bits.push(`${eng.upvotes} upvotes`);
      if (eng.comments != null) bits.push(`${eng.comments} comments`);
      steps.push({
        stage: p.performance === "winning" ? "winning" : "traction", icon: p.performance === "winning" ? "📈" : "👀",
        at: eng.checked_at, title: p.performance === "winning" ? "This one is winning" : "Tracking engagement",
        detail: bits.join(" · "),
      });
    }
    // 5. Replies
    for (const r of replies.slice(0, 3)) {
      steps.push({
        stage: "reply", icon: "💬", at: r.created_at,
        title: r.title || "Someone replied",
        detail: r.body || null,
        draft: r.draft || null, cta: !!r.action_url, url: r.action_url,
      });
    }
    // 6. Watching
    if (p.status === "posted") {
      steps.push({ stage: "watching", icon: "🔁", at: null, title: "Genie is watching this thread for new replies", detail: null });
    }

    return {
      id: p.id, platform: p.platform, keyword: p.keyword,
      title: p.target_title || `${platformLabel(p.platform)} placement`,
      url: p.target_url, status: p.status, performance: p.performance,
      owned: p.owned, draft: p.draft,
      updatedAt: p.posted_at || p.created_at,
      replyCount: replies.length,
      steps,
    };
  });

  // Sort: live conversations (posted+replies) first, then ready, then rest.
  const rank = (s) => (s.replyCount > 0 ? 0 : s.status === "posted" ? 1 : s.status === "ready" ? 2 : 3);
  stories.sort((a, b) => rank(a) - rank(b) || new Date(b.updatedAt) - new Date(a.updatedAt));

  const summary = {
    total: stories.length,
    live: stories.filter((s) => s.status === "posted").length,
    ready: stories.filter((s) => s.status === "ready").length,
    replies: stories.reduce((n, s) => n + s.replyCount, 0),
    winning: stories.filter((s) => s.performance === "winning").length,
  };

  return json({ ok: true, stories, summary });
}

function platformLabel(p) {
  return { reddit: "Reddit", quora: "Quora", forum: "a forum", guest: "a guest site", x: "X", linkedin: "LinkedIn", medium: "Medium", wordpress: "your blog" }[p] || p;
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
