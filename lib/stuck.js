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
