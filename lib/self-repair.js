// lib/self-repair.js
// ── GENIE FIXES ITS OWN WRITING, INSTEAD OF ASKING THE OWNER TO ──
//
// The publish guard was doing its job and the result was still wrong. It blocked
// an article, listed seven sentences and, for each, a paragraph explaining why the
// wording was a problem — and handed the whole thing to a furniture retailer who
// had not written a word of it and had no idea which of the two Genies to believe.
//
// The owner's job is to say yes or no. Deciding whether "the best online retailers"
// is an unverifiable superlative is Genie's job, and Genie already knows the answer:
// the checker returns the exact sentence and the exact reason. Everything needed to
// fix it is in hand at the moment it decides to refuse.
//
// So it repairs, then re-checks, and only then — if the writing is still wrong
// after a second attempt — does the owner hear about it at all.
//
// WHAT THIS WILL NOT DO.
//   · It does not touch anything that was not flagged. The rewrite is verified
//     sentence by sentence and thrown away whole if the model rewrote the article.
//   · It does not try twice. A second failed repair means something is wrong that
//     rewording cannot fix, and that IS worth the owner's attention.
//   · It never repairs a near-duplicate. Two articles saying the same thing is not
//     a wording problem, and rewording it would be Genie hiding its own mistake
//     from the person whose site carries it.

import { callAI } from "@/lib/ai-router";
import { CLAIM_RULES, scanClaims } from "@/lib/claim-rules";
import { logger } from "@/lib/log";

// One attempt. Deliberately.
export const MAX_ATTEMPTS = 1;

// A repair that changes the length this much has rewritten the piece rather than
// the sentences, whatever it claims. Below is a rewrite, not a repair.
const MAX_LENGTH_DRIFT = 0.25;

/**
 * Rewrite only the flagged sentences.
 *
 * @param text    the article body
 * @param claims  [{ claim, why }] from the guard — the sentence and the reason
 * @returns { ok, text, fixed: [{ from, to }], reason }  never throws
 */
export async function repairClaims(text, claims, { entity = null, ctx = null } = {}) {
  const body = String(text || "");
  const list = (claims || []).map((c) => String(c?.claim || "").trim()).filter(Boolean);
  if (!body || !list.length) return { ok: false, text: body, fixed: [], reason: "nothing_to_repair" };

  // Only the ones actually present. A claim the checker paraphrased cannot be
  // found and replaced, and pretending otherwise produces a silent no-op.
  const present = list.filter((c) => body.includes(c));
  if (!present.length) return { ok: false, text: body, fixed: [], reason: "claims_not_found_verbatim" };

  const numbered = present.map((c, i) => {
    const why = String((claims || []).find((x) => String(x?.claim || "").trim() === c)?.why || "").trim();
    return `${i + 1}. "${c}"${why ? `\n   Why it cannot stay: ${why}` : ""}`;
  }).join("\n\n");

  let out;
  try {
    const r = await callAI({
      system:
        "You rewrite individual sentences so they make the same point without claiming anything that cannot be shown. " +
        "You return the replacement sentences only. You never add a preamble, never renumber, never merge two into one, " +
        "and never make a sentence longer than it needs to be. Return ONLY valid JSON.",
      json: true, maxTokens: 1200, temperature: 0.3, timeoutMs: 25000, deadlineMs: 25000, ctx,
      prompt:
`${CLAIM_RULES}

This is for ${entity?.label || "a business"}.

Below are sentences from an article that cannot be published as written. Rewrite each one so it keeps
its place in the paragraph and its point, and says something specific and checkable instead of the
claim it currently makes. Keep the same voice and roughly the same length. Do not add a new fact — if
you cannot say anything specific, say less.

${numbered}

Return {"fixed":[{"n":1,"to":"the replacement sentence"}, ...]} with one entry per number above.`,
    });
    out = r.json;
  } catch (e) {
    logger.warn("selfRepair.ai_failed", { error: String(e?.message || e).slice(0, 160) });
    return { ok: false, text: body, fixed: [], reason: "ai_unavailable" };
  }

  const fixes = Array.isArray(out?.fixed) ? out.fixed : [];
  if (!fixes.length) return { ok: false, text: body, fixed: [], reason: "no_replacements" };

  let repaired = body;
  const fixed = [];
  for (const f of fixes) {
    const i = Number(f?.n) - 1;
    const from = present[i];
    const to = String(f?.to || "").trim();
    if (!from || !to || to === from) continue;
    // A replacement that trips the same rules is not a repair.
    if (scanClaims(to).length) continue;
    if (!repaired.includes(from)) continue;
    repaired = repaired.replace(from, to);
    fixed.push({ from, to });
  }

  if (!fixed.length) return { ok: false, text: body, fixed: [], reason: "nothing_replaced_cleanly" };

  // Did it rewrite the article instead of the sentences? Then none of it is trusted.
  const drift = Math.abs(repaired.length - body.length) / Math.max(1, body.length);
  if (drift > MAX_LENGTH_DRIFT) {
    logger.warn("selfRepair.rewrote_too_much", { drift: Number(drift.toFixed(3)) });
    return { ok: false, text: body, fixed: [], reason: "rewrote_too_much" };
  }

  return { ok: true, text: repaired, fixed, reason: null };
}

/**
 * Is this something rewording could fix? A near-duplicate or toxic language is
 * not, and trying would only delay telling the owner something true.
 */
export function repairable(guard) {
  if (!guard) return false;
  if (guard.scaled?.duplicateOf) return false;
  if ((guard.flags || []).includes("toxic_language")) return false;
  if ((guard.flags || []).includes("thin_content")) return false;
  return (guard.claims || []).length > 0;
}

/** What to tell the owner once Genie has fixed its own writing. Plain, and short. */
export function repairNote(fixed = []) {
  const n = fixed.length;
  if (!n) return "";
  return `Genie rewrote ${n} ${n === 1 ? "sentence" : "sentences"} that claimed more than it could show, then published.`;
}
