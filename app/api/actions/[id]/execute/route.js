// app/api/actions/[id]/execute/route.js
// F3a — THE EXECUTION LAYER, v1. The first place "Approve" becomes a real DO.
// Publishes an article action to the user's connected WordPress site.
//
// Safety gates checked IN ORDER before anything executes:
//   1. User owns the action (RLS)
//   2. Kill switch is OFF
//   3. Action type is executable (article) and not already done
//   4. WordPress is connected
// On success: action.result = { url, postId }, status → done, outcome logged.
// On failure: status → failed with the reason saved, outcome logged.

import { createClient } from "@/lib/supabase/server";
import { markdownToHtml } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  // Load the action (RLS guarantees ownership).
  const { data: action } = await supabase
    .from("actions")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!action) return json({ ok: false, error: "Action not found." }, 404);

  // GATE 1 — kill switch.
  const { data: safety } = await supabase
    .from("safety_settings")
    .select("kill_switch")
    .eq("user_id", user.id)
    .maybeSingle();
  if (safety?.kill_switch) {
    return json({ ok: false, error: "Kill switch is on — Genie won't execute anything until you turn it off in Settings." }, 403);
  }

  // GATE 2 — executable type & state.
  const p = action.payload || {};
  const platform = String(p.platform || action.target?.channel || "").toLowerCase();
  const isX = action.type === "social_post" && (platform.includes("twitter") || platform.includes("x"))
    || (action.type === "distribution" && String(p.channel || "").toLowerCase().includes("twitter"));
  const isArticle = action.type === "article";

  if (!isArticle && !isX) {
    return json({ ok: false, error: "That action type can't auto-publish yet. More channels are coming." }, 400);
  }
  if (action.status === "done") {
    return json({ ok: true, alreadyDone: true, result: action.result });
  }
  if (action.status === "dismissed" || action.status === "rolled_back") {
    return json({ ok: false, error: `This action was ${action.status.replace("_", " ")} — reopen it before publishing.` }, 400);
  }

  // GATE 2.5 — brand safety + fact-check. Never publish toxic content or high-risk
  // claims under the user's name, even when they approved it.
  const guardChannel = isX ? "x" : "blog";
  const guardText = isX
    ? (Array.isArray(p.draft) ? p.draft.join("\n\n") : (p.text || p.draft || p.body || ""))
    : (p.body || "");
  const { guardContent } = await import("@/lib/publish-guard");
  const guard = await guardContent(supabase, { userId: user.id, host: action.target?.host || null, channel: guardChannel, content: guardText, deep: true });
  if (guard.decision === "block") {
    await supabase.from("actions").update({ status: "needs_review", result: { blocked: true, reasons: guard.reasons, flags: guard.flags }, updated_at: new Date().toISOString() }).eq("id", action.id);
    try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "blocked", meta: { reasons: guard.reasons, flags: guard.flags, confidence: guard.confidence } }); } catch {}
    return json({ ok: false, blocked: true, error: "Genie held this back to protect your brand: " + (guard.reasons[0] || "risky content detected") + ". Edit and re-approve.", guard }, 422);
  }

  // ── X / Twitter branch: real auto-post to the user's own account ──
  if (isX) {
    const { postToX } = await import("@/lib/x");
    // A tweet, or a thread (distribution draft may be an array).
    const content = Array.isArray(p.draft) ? p.draft : (p.text || p.draft || p.body || "");
    if (!content || (Array.isArray(content) && content.length === 0)) {
      return json({ ok: false, error: "Nothing to post." }, 400);
    }
    await supabase.from("actions").update({ status: "executing", updated_at: new Date().toISOString() }).eq("id", action.id);
    const r = await postToX(supabase, user.id, content);
    if (!r.ok) {
      await supabase.from("actions").update({ status: "failed", result: { error: r.error }, updated_at: new Date().toISOString() }).eq("id", action.id);
      try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "failed", meta: { error: r.error } }); } catch {}
      const needsConn = /not connected/i.test(r.error || "");
      return json({ ok: false, needsConnection: needsConn, error: r.error }, needsConn ? 400 : 502);
    }
    const result = { url: r.url, tweetId: r.id, publishedAt: new Date().toISOString(), channel: "x" };
    await supabase.from("actions").update({ status: "done", result, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", action.id);
    try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "executed", meta: result }); } catch {}
    return json({ ok: true, result });
  }

  // GATE 3 — WordPress connected.
  const { data: wp } = await supabase
    .from("connections")
    .select("access_token, meta")
    .eq("user_id", user.id)
    .eq("provider", "wordpress")
    .maybeSingle();
  if (!wp?.meta?.siteUrl || !wp?.access_token) {
    return json({ ok: false, needsConnection: true, error: "Connect your WordPress site first (Integrations)." }, 400);
  }

  // Mark executing.
  await supabase.from("actions").update({ status: "executing", updated_at: new Date().toISOString() }).eq("id", action.id);

  // Build the post.
  const html = markdownToHtml(p.body || "");
  const auth = "Basic " + Buffer.from(`${wp.meta.username}:${wp.access_token}`).toString("base64");

  let published;
  try {
    const res = await fetch(`${wp.meta.siteUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: p.title || action.title || "Untitled",
        content: html,
        status: "publish",
        excerpt: p.metaDescription || "",
        slug: p.slug || undefined,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`WordPress returned ${res.status}: ${detail}`);
    }
    published = await res.json();
  } catch (e) {
    const reason = String(e?.message || "Publish failed").slice(0, 300);
    await supabase.from("actions").update({
      status: "failed",
      result: { error: reason },
      updated_at: new Date().toISOString(),
    }).eq("id", action.id);
    try {
      await supabase.from("action_outcomes").insert({
        action_id: action.id, user_id: user.id, event: "failed", meta: { reason },
      });
    } catch {}
    return json({ ok: false, error: "Publishing failed: " + reason }, 502);
  }

  // Success — save the real result.
  const result = {
    url: published.link || null,
    postId: published.id || null,
    publishedAt: new Date().toISOString(),
    channel: "wordpress",
  };
  await supabase.from("actions").update({
    status: "done",
    result,
    executed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", action.id);
  try {
    await supabase.from("action_outcomes").insert({
      action_id: action.id, user_id: user.id, event: "executed", meta: result,
    });
  } catch {}

  return json({ ok: true, result });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
