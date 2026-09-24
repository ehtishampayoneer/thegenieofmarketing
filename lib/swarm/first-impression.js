// lib/swarm/first-impression.js
// ── THE FIRST FEW THINGS AN OWNER EVER READS ──
//
// The whole product turns on one moment. A new owner opens Approvals on day two,
// reads email number one, and either thinks "send it" or "I could write better
// than this". If it is the second, nothing else in the product gets a chance —
// the engines are fine, the targeting is fine, and the account is already over.
//
// The crowd and the seven improvers already run on every draft. But improvement
// was conditional: it only fired when the first read came back weak enough to
// trip needsImprovement(). That is the right economy for the hundredth draft and
// the wrong one for the first, where a merely-adequate email costs more than the
// AI call that would have sharpened it.
//
// SO THIS DOES NOT HIDE ANYTHING. The obvious design was a gate — hold a weak
// draft back until it passes. This codebase already learned why that is wrong:
// an article once vanished for a fortnight into a status no screen displayed, and
// the rule since is that a new terminal state needs a surface in the same change.
// Holding the first email would also risk the worst possible day two, which is an
// empty queue and no explanation.
//
// It does two smaller things instead, and neither can make work disappear:
//   · For the first few items on an account, improvement is forced rather than
//     conditional. The best version the machinery can produce is the one that
//     reaches the owner.
//   · If it still comes back under the bar, the card says so, so the owner reads
//     that one properly instead of approving it on trust.

// How many of an owner's very first items get this treatment. Small on purpose:
// it costs extra AI calls, and by the tenth draft an owner has their own opinion
// about whether Genie writes well.
export const FIRST_ITEMS = 4;

// Under this, a draft is worth a second look before it goes out with the owner's
// name on it. It is not a pass mark for the product — plenty of good copy scores
// here — it is the line below which "read this one properly" is honest advice.
export const WEAK_SCORE = 55;

/**
 * Is this account still inside its first impression?
 * Counts what the crowd has already tested for this owner. Never throws; on any
 * doubt it returns true, because the cost of being wrong is one extra AI call and
 * the cost of the other mistake is the account.
 */
export async function isFirstImpression(admin, userId, { limit = FIRST_ITEMS } = {}) {
  if (!admin || !userId) return true;
  try {
    const { count } = await admin.from("events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("type", "swarm.tested");
    return (count ?? 0) < limit;
  } catch {
    return true;
  }
}

/**
 * What to tell the owner about a draft that came back weak. Empty string when
 * there is nothing worth saying, so a card never carries a warning it did not
 * earn.
 */
export function weakNote(crowd, { first = false } = {}) {
  const score = Number(crowd?.score);
  if (!Number.isFinite(score) || score >= WEAK_SCORE) return "";
  const worst = crowd?.objections?.[0]?.text || crowd?.top?.[0]?.text || "";
  const lead = first
    ? "Genie rewrote this and the crowd still scored it low."
    : "The crowd scored this one low.";
  return worst
    ? `${lead} Read it properly before you send it — the objection that spread was: "${String(worst).slice(0, 140)}"`
    : `${lead} Read it properly before you send it.`;
}
