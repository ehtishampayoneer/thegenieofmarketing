// lib/queue-count.js
// ── ONE NUMBER, COUNTED ONCE ──
//
// The menu said 36. The page said "3 for you today, 74 lined up behind them". Three
// numbers on one screen and no two of them agreed, because each was worked out
// separately: the queue counted its own rows, and the menu counted the length of a
// list that a `.limit(20)` had already cut short, then added at most twenty pitches
// to it. So the badge could never exceed forty however much work was waiting, and
// on a busy account it was simply a different number from the one on the page.
//
// Every figure has to count the thing its label names. This is that count, in one
// place, so the menu and the queue cannot drift apart again.

import { MEDIA_TYPE, isPendingPitch } from "@/lib/media-store";

// How many decisions a morning asks for. Three, and it lives here because both the
// queue and the badge beside it have to agree on the number.
export const DAILY_CARDS = 3;

// The action types Approvals deliberately never shows.
const HIDDEN = ["media_outreach", "foundation", "recovery", "local_services", "sprint"];

/**
 * A win-back email still waiting for the owner. Its status stays "proposed" for
 * good — sending and the outcome are recorded in the payload — so "waiting" is a
 * judgement about the payload, exactly like a Get featured pitch.
 */
export function isPendingWinback(payload) {
  return !!payload && !payload.sent && !payload.outcome && !!payload.email;
}

/**
 * How many pieces of work are waiting for this owner: drafts, pitches and
 * community replies, exactly as the Approvals queue counts them.
 * Never throws; a failure returns 0 rather than a wrong number.
 */
export async function countWaiting(supabase, userId) {
  if (!supabase || !userId) return 0;
  let total = 0;

  // Drafts: proposed, plus the two states that still need the owner — held back by
  // the brand guard, and failed part-way through. Both appear in the queue, so both
  // belong in the number beside it.
  try {
    let q = supabase.from("actions").select("id", { count: "exact", head: true })
      .eq("user_id", userId).in("status", ["proposed", "needs_review", "failed"]);
    for (const t of HIDDEN) q = q.neq("type", t);
    const { count } = await q;
    total += count || 0;
  } catch {}

  // Win-back emails the owner has not sent yet. They live on Revenue Recovery and
  // are also on the approvals page, so they belong in the number beside it.
  try {
    const { data } = await supabase.from("actions").select("payload")
      .eq("user_id", userId).eq("type", "recovery").eq("status", "proposed").limit(1000);
    total += (data || []).filter((a) => isPendingWinback(a.payload)).length;
  } catch {}

  // Get featured pitches are counted by reading them, because "still pending" is a
  // judgement about the payload rather than a column.
  try {
    const { data } = await supabase.from("actions").select("payload")
      .eq("user_id", userId).eq("type", MEDIA_TYPE)
      .order("created_at", { ascending: false }).limit(60);
    total += (data || []).filter(isPendingPitch).length;
  } catch {}

  // Community replies waiting to be posted.
  try {
    const { count } = await supabase.from("placements").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "ready");
    total += count || 0;
  } catch {}

  return total;
}
