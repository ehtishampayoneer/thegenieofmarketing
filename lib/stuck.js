// lib/stuck.js
// ── WORK THAT STOPPED HALFWAY ──
// Publishing sets an action to "executing" and then does the slow part: writing
// to WordPress, building a hosted page, pinging the indexers. If that request
// dies in the middle — a serverless timeout, a provider stall, a dropped
// connection — nothing ever sets the status again. The row sits in "executing"
// for good.
//
// Which means it vanishes. The Approvals queue lists "proposed" and
// "needs_review", so a half-published article is in no list, has no error, and
// is never retried. The owner approved something and it evaporated. That is the
// same failure that hid their first article for a fortnight, and it deserved a
// fix at the level of the class, not the instance.
//
// This looks for rows that have been executing longer than anything legitimately
// takes, and puts each one back where a human can see it:
//   • the page did get published -> mark it done, with its real URL
//   • it did not                 -> back to proposed, and say what happened
//
// Checking for the published page first is what makes this safe to run on a
// schedule: a publish that finished but failed to record itself is completed,
// not repeated, so nobody gets two copies of the same article.

import { logActivity } from "@/lib/activity";
import { recordEvent } from "@/lib/events";

// Publishing is capped at 300s by the platform, so anything still executing a
// quarter of an hour later is not slow, it is gone.
export const STUCK_AFTER_MS = 15 * 60 * 1000;

/**
 * Put half-finished work back in front of the owner.
 * Best-effort and never throws: it runs inside the nightly job and on the
 * Approvals list, and must never be the reason either one fails.
 * @returns {{recovered:number, completed:number}}
 */
export async function recoverStuckActions(admin, { userId, olderThanMs = STUCK_AFTER_MS } = {}) {
  const out = { recovered: 0, completed: 0 };
  if (!admin || !userId) return out;

  let stuck = [];
  try {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const { data } = await admin.from("actions")
      .select("id, type, title, target, updated_at")
      .eq("user_id", userId).eq("status", "executing").lt("updated_at", cutoff)
      .limit(25);
    stuck = data || [];
  } catch { return out; }
  if (!stuck.length) return out;

  for (const a of stuck) {
    // Did it actually finish? A published page carrying this action's id means
    // the work landed and only the status update was lost.
    let page = null;
    try {
      const { data } = await admin.from("published_pages")
        .select("id, handle, slug, status")
        .eq("user_id", userId).eq("action_id", a.id).limit(1).maybeSingle();
      page = data || null;
    } catch {}

    if (page) {
      try {
        await admin.from("actions").update({
          status: "done",
          result: { pageId: page.id, handle: page.handle, slug: page.slug, recovered: true },
          executed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("id", a.id).eq("user_id", userId);
        out.completed++;
      } catch {}
      continue;
    }

    try {
      await admin.from("actions").update({ status: "proposed", updated_at: new Date().toISOString() }).eq("id", a.id).eq("user_id", userId);
      out.recovered++;
      await logActivity(admin, userId, {
        host: a.target?.host || null, verb: "staged", icon: "↩️",
        message: `Publishing didn't finish — ${a.title || "a draft"} is back in Approvals`,
        detail: "Genie started publishing this and the run stopped before it completed. Nothing was posted. Approve it again to retry.",
        meta: { actionId: a.id, recovered: true },
      });
      await recordEvent(admin, {
        userId, host: a.target?.host || null, type: "action.recovered", actor: "genie",
        subject: a.title || a.type, data: { actionId: a.id, was: "executing" },
        dedupeKey: `recovered:${a.id}`,
      });
    } catch {}
  }
  return out;
}

// ── WORK THAT WAS NEVER GOING TO BE DONE ──
//
// Genie writes every night and the queue only ever asks for three. On a real
// account that arithmetic runs one way: seventy-eight things waiting, three of
// them reachable, and a social post drafted three weeks ago sitting behind
// seventy-five others that will never be reached either.
//
// None of it is useful by then. A post promoting an article published a fortnight
// ago is late; an email written from a plan the owner has since corrected argues
// the wrong thing; a reply to a forum thread from last month arrives after the
// conversation ended. Keeping them is not caution, it is a growing pile that makes
// the queue look like a debt.
//
// So a draft nobody reached in two weeks is retired. Not deleted quietly — it is
// recorded, it appears on the work log, and the reason says plainly that Genie
// wrote more than the owner had time for, which is Genie's problem to solve and
// not something the owner should feel behind on.
export const STALE_AFTER_DAYS = 14;

export async function expireStaleDrafts(admin, { userId, host = null, days = STALE_AFTER_DAYS } = {}) {
  const out = { expired: 0 };
  if (!admin || !userId) return out;
  const cutoff = new Date(Date.now() - days * 864e5).toISOString();

  let rows = [];
  try {
    const { data } = await admin.from("actions")
      .select("id, type, title, payload, created_at")
      .eq("user_id", userId).eq("status", "proposed").lt("created_at", cutoff)
      // An article is the one thing worth keeping: it does not go off in the same
      // way, it is the slowest to produce, and it is the only kind an owner might
      // deliberately be saving.
      .neq("type", "article")
      .limit(200);
    rows = data || [];
  } catch { return out; }
  if (!rows.length) return out;

  try {
    await admin.from("actions")
      .update({ status: "expired", result: { expired: true, afterDays: days }, updated_at: new Date().toISOString() })
      .in("id", rows.map((r) => r.id)).eq("user_id", userId);
    out.expired = rows.length;
  } catch { return out; }

  try {
    const { recordEvent } = await import("@/lib/events");
    await recordEvent(admin, {
      userId, host, type: "content.expired", actor: "genie",
      subject: `${rows.length} draft${rows.length === 1 ? "" : "s"}`,
      data: { count: rows.length, days, kinds: [...new Set(rows.map((r) => r.type))] },
      dedupeKey: `expired:${userId}:${new Date().toISOString().slice(0, 10)}`,
    });
  } catch {}
  return out;
}
