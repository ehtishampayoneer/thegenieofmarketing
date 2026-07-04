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
  if (action.type !== "article") {
    return json({ ok: false, error: "Only articles publish to WordPress right now. More channels are coming." }, 400);
  }
  if (action.status === "done") {
    return json({ ok: true, alreadyDone: true, result: action.result });
  }
  if (action.status === "dismissed" || action.status === "rolled_back") {
    return json({ ok: false, error: `This action was ${action.status.replace("_", " ")} — reopen it before publishing.` }, 400);
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
  const p = action.payload || {};
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
