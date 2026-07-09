// app/api/notifications/route.js
// STAGE 8 — REPLY & NOTIFICATION ENGINE.
// GET  → the organized notification center (unread first, by priority).
// POST → scan posted placements for NEW replies; for each, draft Genie's
//        response and create a high-priority "reply" notification so the user
//        never misses one. Also surfaces traction + cooling notifications.
// PATCH→ mark read / actioned / dismissed.
// Runs on demand and from the overnight cron. Everything inside Genie.

import { callAI } from "@/lib/ai-router";
import { resolveRadarUser } from "@/lib/radar-auth";
import { findNewReplies } from "@/lib/replies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------- GET: the inbox ----------
export async function GET(request) {
  const { supabase, userId } = await resolveRadarUser(request, {});
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  let q = supabase.from("notifications").select("*").eq("user_id", userId)
    .neq("status", "dismissed").order("status", { ascending: true })
    .order("priority", { ascending: true }).order("created_at", { ascending: false }).limit(100);
  if (host) q = q.eq("host", host);
  const { data } = await q;

  const items = data || [];
  const counts = {
    unread: items.filter((n) => n.status === "unread").length,
    replies: items.filter((n) => n.kind === "reply" && n.status !== "actioned").length,
    opportunities: items.filter((n) => n.kind === "opportunity" && n.status === "unread").length,
    traction: items.filter((n) => n.kind === "traction" && n.status === "unread").length,
  };
  return json({ ok: true, notifications: items, counts });
}

// ---------- POST: scan for replies + traction, draft answers ----------
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { host, ai } = body || {};
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  // Posted placements we can check for replies (readable platforms first).
  let q = supabase.from("placements").select("*").eq("user_id", userId).eq("status", "posted").limit(40);
  if (host) q = q.eq("host", host);
  const { data: posted } = await q;
  if (!posted?.length) return json({ ok: true, scanned: 0, newReplies: 0, drafted: 0 });

  let scanned = 0, newReplyCount = 0, drafted = 0;

  for (const p of posted) {
    const result = await findNewReplies(p);
    scanned++;
    if (!result) continue;

    // Update reply count + seen ids.
    const seen = new Set(p.seen_reply_ids || []);
    let addedIds = [];
    for (const r of result.newReplies || []) { seen.add(r.id); addedIds.push(r.id); }
    await supabase.from("placements").update({
      reply_count: result.total ?? p.reply_count,
      seen_reply_ids: Array.from(seen).slice(-200),
    }).eq("id", p.id);

    // For each NEW reply we could read → draft an answer + notify.
    for (const reply of result.newReplies || []) {
      newReplyCount++;
      const draft = await draftAnswer(p, reply, ai, host);
      await supabase.from("notifications").insert({
        user_id: userId, host: p.host, kind: "reply", priority: 1,
        title: `${reply.author} replied on ${p.platform}`,
        body: reply.text?.slice(0, 200) || "",
        placement_id: p.id, action_url: reply.permalink || p.target_url,
        draft: draft || null, status: "unread",
      });
      if (draft) drafted++;
    }

    // Best-effort platforms that only tell us the count grew → soft notify.
    if (result.grew && (!result.newReplies || result.newReplies.length === 0)) {
      await supabase.from("notifications").insert({
        user_id: userId, host: p.host, kind: "reply", priority: 2,
        title: `New activity on your ${p.platform} post`,
        body: "Someone replied — open the thread to respond.",
        placement_id: p.id, action_url: p.target_url, status: "unread",
      });
      newReplyCount++;
    }
  }

  return json({ ok: true, scanned, newReplies: newReplyCount, drafted });
}

// ---------- PATCH: update a notification ----------
export async function PATCH(request) {
  const { supabase, userId } = await resolveRadarUser(request, {});
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { id, status, all } = body || {};

  if (all === "read") {
    await supabase.from("notifications").update({ status: "read" }).eq("user_id", userId).eq("status", "unread");
    return json({ ok: true });
  }
  if (!id || !status) return json({ ok: false, error: "Missing id or status." }, 400);
  const { error } = await supabase.from("notifications").update({ status }).eq("id", id).eq("user_id", userId);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

async function draftAnswer(placement, reply, ai, host) {
  try {
    const result = await callAI({
      system: "You are Genie. Someone replied to a post you made in a community. Write a genuinely helpful, natural, human response that continues the conversation. Never salesy, never repeat the original post. If they asked a question, answer it. Keep it concise and authentic. Return ONLY the reply text.",
      maxTokens: 500, temperature: 0.7,
      prompt: `Product context: ${ai?.businessName || host} — ${ai?.whatTheySell || ""}
Your original ${placement.platform} post:
${(placement.draft || "").slice(0, 500)}

They replied:
"${reply.text}"

Write your helpful, natural response:`,
    });
    return (result.text || "").trim() || null;
  } catch {
    return null;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
