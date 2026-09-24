// lib/owner-signal.js
// ── WHAT THE OWNER'S SKIPS AND REWRITES CHANGE ──
//
// Three things happen in the morning queue: approve, skip, edit. Approving was
// recorded from the start. Skipping and editing were not, so two of the three —
// and by far the two more informative — taught Genie nothing. That is now fixed
// in the write path (app/api/approvals/act): a skip and an edit each record a
// decision, and an edit keeps the owner's own words.
//
// This is the read side, and it exists because a recorded signal nothing consumes
// is not learning, it is a log. Two consumers, both real and both checkable:
//
//   · SKIPS LOWER THE QUEUE. The queue shows three cards and ranks by impact. A
//     kind of work the owner has skipped three times should not keep taking one
//     of those three slots from work they would have done. So skips become a
//     multiplier on impact — never a block. The item stays in the backlog, still
//     reachable, because deciding for the owner is not this module's job.
//
//   · REWRITES RAISE THE BAR. An edit is the owner saying "not in those words".
//     If they have rewritten a kind of draft twice, the improvers stop waiting to
//     be asked and run on every one of that kind from then on — the same thing
//     lib/swarm/first-impression.js does for a brand-new account, for the same
//     reason: the extra AI call is cheaper than the owner's patience.
//
// Both read one aggregate written by the nightly learning run (lib/learning.js),
// not the raw ledger, so neither consumer pays for three hundred rows.

// A skip is ambiguous — wrong moment, busy morning, fair enough. Three of the
// same kind is a preference.
export const MIN_SKIPS = 3;

// An edit is not ambiguous. Two is a pattern.
export const MIN_EDITS = 2;

// How far a skipped kind can fall. It has to be enough to lose a slot to
// something the owner actually wants, and not so much that a kind of work
// disappears from the top three for good after one bad week.
const FLOOR = 0.45;

/** The impact multiplier for a kind of work, from how often it was skipped. */
export function skipPenalty(skips = 0) {
  const n = Number(skips) || 0;
  if (n < MIN_SKIPS) return 1;
  return Math.max(FLOOR, 1 - n * 0.15);
}

/**
 * The learnings a skip/edit history is worth. Called by synthesizeLearnings, so
 * they land in Growth Memory where the /learning page shows them and the two
 * consumers below read them. Pure.
 *
 * @param decisions rows of { kind, choice, meta } from the decisions ledger
 */
export function ownerSignalLearnings(decisions = []) {
  const skips = {}, edits = {};
  for (const d of decisions || []) {
    const type = String(d?.meta?.type || "").trim();
    if (!type) continue;
    if (d.kind === "skipped") skips[type] = (skips[type] || 0) + 1;
    else if (d.kind === "edited") edits[type] = (edits[type] || 0) + 1;
  }

  const out = [];
  for (const [type, n] of Object.entries(skips).sort((a, b) => b[1] - a[1])) {
    if (n < MIN_SKIPS) continue;
    const label = pretty(type);
    out.push({
      key: `owner_skips:${type}`,
      insight: `You have skipped ${n} ${label} ${plural(n, "card")}. Genie is ranking them lower, so they stop taking one of your three slots — they are still in the backlog if you want them.`,
      weight: 1 + n * 0.2,
      changed: `Ranking ${label} lower in the queue`,
      meta: { dimension: "owner_signal", type, skips: n, weight: skipPenalty(n) },
    });
  }
  for (const [type, n] of Object.entries(edits).sort((a, b) => b[1] - a[1])) {
    if (n < MIN_EDITS) continue;
    const label = pretty(type);
    out.push({
      key: `owner_edits:${type}`,
      insight: `You rewrote ${n} ${label} ${plural(n, "draft")} before approving. Genie now runs its improvers on every ${label} draft instead of only the weak ones, so fewer reach you needing your pen.`,
      weight: 1 + n * 0.4,
      changed: `Always improving ${label} drafts before you see them`,
      meta: { dimension: "owner_signal", type, edits: n },
    });
  }
  return out;
}

/**
 * The read side: { skips: {type: multiplier}, edits: Set<type> }. Never throws;
 * an empty answer means nothing changes, which is the right default.
 *
 * `host` is optional, and left out on purpose by the approvals queue: "I never do
 * Reddit posts" is a fact about the owner, not about one of their websites. Across
 * several sites the strongest signal wins.
 */
export async function ownerSignal(supabase, userId, host = null) {
  const out = { skips: {}, edits: new Set() };
  if (!supabase || !userId) return out;
  try {
    // One prefix, filtered apart below: a PostgREST `or` of two LIKEs with colons
    // in the values is a needless thing to be clever about.
    let q = supabase.from("growth_memory").select("mkey, meta").eq("user_id", userId);
    if (host) q = q.eq("host", host);
    const { data } = await q.like("mkey", "owner_%");
    for (const r of data || []) {
      const key = String(r?.mkey || "");
      const type = String(r?.meta?.type || key.split(":").slice(1).join(":") || "").trim();
      if (!type) continue;
      if (key.startsWith("owner_skips:")) {
        const w = typeof r.meta?.weight === "number" ? r.meta.weight : skipPenalty(r.meta?.skips);
        out.skips[type] = Math.min(out.skips[type] ?? 1, w);
      } else if (key.startsWith("owner_edits:")) out.edits.add(type);
    }
  } catch {}
  return out;
}

/** The multiplier for one item, tolerant about what the caller calls its kind. */
export function penaltyFor(signal, ...types) {
  for (const t of types) {
    const key = String(t || "").trim();
    if (key && signal?.skips?.[key] != null) return signal.skips[key];
  }
  return 1;
}

/** Has the owner rewritten this kind enough that it always gets the improvers? */
export function alwaysImprove(signal, ...types) {
  for (const t of types) {
    const key = String(t || "").trim();
    if (key && signal?.edits?.has?.(key)) return true;
  }
  return false;
}

function pretty(t) { return String(t || "item").replace(/_/g, " "); }
function plural(n, w) { return n === 1 ? w : w + "s"; }
