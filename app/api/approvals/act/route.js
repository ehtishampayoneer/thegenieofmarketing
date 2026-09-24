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
  const { id, source, act, draft, image, imageRaw, hook, imageSource, imageCredit, branded, imageFocus } = body || {};
  if (!id || !source || !act) return json({ ok: false, error: "id, source and act are required." }, 400);

  try {
    if (source === "placement") {
      if (act === "edit") {
        const { data: before } = await supabase.from("placements").select("host, platform, draft").eq("id", id).eq("user_id", user.id).maybeSingle();
        await supabase.from("placements").update({ draft }).eq("id", id).eq("user_id", user.id);
        await learnFromEdit(supabase, user.id, before?.host, { what: before?.platform || "post", before: before?.draft, after: draft });
        return json({ ok: true });
      }
      if (act === "skip") {
        const { data: before } = await supabase.from("placements").select("host, platform, target_title").eq("id", id).eq("user_id", user.id).maybeSingle();
        await supabase.from("placements").update({ status: "skipped" }).eq("id", id).eq("user_id", user.id);
        await learnFromSkip(supabase, user.id, before?.host, { what: before?.platform || "post", title: before?.target_title });
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

    // source === "action" — persist edited text AND (new) the image + hook, so what
    // the owner tweaked in the approval editor is exactly what gets published.
    if (act === "edit") {
      const { data: a } = await supabase.from("actions").select("type, payload, target").eq("id", id).eq("user_id", user.id).maybeSingle();
      const payload = { ...(a?.payload || {}) };
      // Remember which field the text went into, so the learning below compares
      // the new words against the words they replaced and not against nothing.
      let field = null;
      if (typeof draft === "string") { field = (a?.type === "article" || payload.body != null || payload.text == null) ? "body" : "text"; payload[field] = draft; }
      if (image !== undefined) { if (a?.type === "article") payload.heroImage = image || null; else payload.image = image || null; }
      if (imageRaw !== undefined) payload.imageRaw = imageRaw || null;
      if (typeof hook === "string") payload.cardHeadline = hook;
      if (imageSource !== undefined) payload.imageSource = imageSource || null;
      if (imageCredit !== undefined) payload.imageCredit = imageCredit || null;
      if (branded !== undefined) payload.branded = !!branded;
      if (imageFocus !== undefined) { const f = Math.max(0, Math.min(100, parseInt(imageFocus, 10))); payload.imageFocus = Number.isFinite(f) ? f : 50; }
      await supabase.from("actions").update({ payload }).eq("id", id).eq("user_id", user.id);
      await learnFromEdit(supabase, user.id, a?.target?.host, { what: a?.type || "action", before: field ? a?.payload?.[field] : "", after: field ? draft : "" });
      return json({ ok: true });
    }
    if (act === "skip") {
      const { data: before } = await supabase.from("actions").select("type, title, target").eq("id", id).eq("user_id", user.id).maybeSingle();
      await supabase.from("actions").update({ status: "dismissed" }).eq("id", id).eq("user_id", user.id);
      await learnFromSkip(supabase, user.id, before?.target?.host, { what: before?.type || "action", title: before?.title });
      return json({ ok: true });
    }
    // approve → approved (enters publish queue; owned/executable are published by
    // the queue via the execute route). Learn from the approval.
    const { data: a } = await supabase.from("actions").select("type, title, target, payload").eq("id", id).eq("user_id", user.id).maybeSingle();
    // A listing approved = the owner opened the page to submit it. Recorded so
    // the self-test and reports can count listings; the action itself already
    // stops the place being offered again.
    if (a?.type === "directory_submission" && a?.payload?.placeId) {
      try {
        const { recordEvent } = await import("@/lib/events");
        await recordEvent(supabase, {
          userId: user.id, host: a.target?.host || null, type: "launch.place", actor: "human", subject: a.payload.place || a.title,
          data: { placeId: a.payload.placeId, state: "submitted", kind: a.payload.kind || null }, dedupeKey: `launch:${a.target?.host || ""}:${a.payload.placeId}`,
        });
      } catch {}
    }
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

// ── THE TWO SIGNALS THAT WERE BEING THROWN AWAY ──
// Approving already recorded a decision. Skipping set a status and recorded
// nothing; editing saved the text and recorded nothing. So two of the three
// things an owner does every single morning taught Genie precisely nothing —
// and they are the informative two. A skip says "not this"; an edit is the owner
// demonstrating the correct answer, which is the single most valuable piece of
// feedback the product can receive and it was being discarded.
//
// Best-effort throughout: a learning that fails to record must never stop the
// owner clearing their queue.
async function learnFromSkip(supabase, userId, host, { what, title }) {
  try {
    await recordDecision(supabase, {
      userId, host: host || null, kind: "skipped",
      choice: title || what || "item",
      rationale: `You skipped a ${String(what || "item").replace(/_/g, " ")}.`,
      confidence: 1, meta: { source: "approvals", type: what },
    });
  } catch {}
}

async function learnFromEdit(supabase, userId, host, { what, before, after }) {
  try {
    const from = String(before || ""), to = String(after || "");
    // An edit that changed nothing is a save, not a correction.
    if (!to || from.trim() === to.trim()) return;
    await recordDecision(supabase, {
      userId, host: host || null, kind: "edited",
      choice: String(what || "item"),
      rationale: `You rewrote a ${String(what || "item").replace(/_/g, " ")} before approving it. What you wrote is what Genie should have written.`,
      confidence: 1,
      // The owner's own words, kept so the learning loop can read what they
      // actually changed rather than only that they changed something.
      meta: { source: "approvals", type: what, before: from.slice(0, 1200), after: to.slice(0, 1200) },
    });
  } catch {}
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
