// app/api/approvals/act/route.js
// ── APPROVAL WRITE PATH ──
// One endpoint the queue calls for approve / edit / skip on either an action or a
// placement. Updates status safely (RLS scopes to the owner), persists edits, sets
// placement cooldowns, and records the approval as a DECISION so the Learning Loop
// learns which channels/actions the user actually approves. Real external
// publishing (WordPress/X) stays with the gated /api/actions/[id]/execute route,
// which the queue calls directly for owned/executable actions.

import { createClient } from "@/lib/supabase/server";
import { recordDecision } from "@/lib/growth-memory";
import { nextEligible } from "@/lib/cadence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { id, source, act, draft } = body || {};
  if (!id || !source || !act) return json({ ok: false, error: "id, source and act are required." }, 400);

  try {
    if (source === "placement") {
      if (act === "edit") {
        await supabase.from("placements").update({ draft }).eq("id", id).eq("user_id", user.id);
        return json({ ok: true });
      }
      if (act === "skip") {
        await supabase.from("placements").update({ status: "skipped" }).eq("id", id).eq("user_id", user.id);
        return json({ ok: true });
      }
      // approve → posted (+ cooldown), and learn from it.
      const { data: p } = await supabase.from("placements").select("host, platform, keyword, target_title, meta").eq("id", id).eq("user_id", user.id).maybeSingle();
      const patch = { status: "posted", posted_at: new Date().toISOString() };
      if (p?.platform) patch.next_eligible_at = nextEligible(p.platform);
      if (typeof draft === "string" && draft) patch.draft = draft;
      await supabase.from("placements").update(patch).eq("id", id).eq("user_id", user.id);
      await recordDecision(supabase, {
        userId: user.id, host: p?.host || null, kind: "approval",
        choice: p?.target_title || p?.platform || "placement",
        rationale: `You approved a ${p?.platform || "community"} post${p?.keyword ? ` for "${p.keyword}"` : ""}.`,
        confidence: 1, meta: { source: "placement", platform: p?.platform, keyword: p?.keyword, buyer_intent: !!p?.meta?.buyer_intent },
      });
      return json({ ok: true });
    }

    // source === "action"
    if (act === "edit") {
      const { data: a } = await supabase.from("actions").select("payload").eq("id", id).eq("user_id", user.id).maybeSingle();
      const payload = { ...(a?.payload || {}) };
      if (payload.body != null || payload.text == null) payload.body = draft; else payload.text = draft;
      await supabase.from("actions").update({ payload }).eq("id", id).eq("user_id", user.id);
      return json({ ok: true });
    }
    if (act === "skip") {
      await supabase.from("actions").update({ status: "dismissed" }).eq("id", id).eq("user_id", user.id);
      return json({ ok: true });
    }
    // approve → approved (enters publish queue; owned/executable are published by
    // the queue via the execute route). Learn from the approval.
    const { data: a } = await supabase.from("actions").select("type, title, target").eq("id", id).eq("user_id", user.id).maybeSingle();
    await supabase.from("actions").update({ status: "approved", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
    await recordDecision(supabase, {
      userId: user.id, host: a?.target?.host || null, kind: "approval",
      choice: a?.title || a?.type || "action",
      rationale: `You approved a ${String(a?.type || "action").replace(/_/g, " ")}.`,
      confidence: 1, meta: { source: "action", type: a?.type },
    });
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "Couldn't update. Try again." }, 500);
  }
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
