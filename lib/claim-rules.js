// lib/claim-rules.js
// ── ONE LIST OF WHAT GENIE MAY NOT WRITE ──
//
// The fact-checker refused an article for seven claims: "best buy", "perfectly
// complements", "ensuring your purchase feels right at home", "it happens more
// often than we'd like to admit". Every one of those was written by Genie, and
// every one was then caught by Genie — and the owner was handed the argument
// between the two halves and asked to settle it, on a 780-word article they did
// not write.
//
// That is the bug. Not the checker, which was right, and not the writer, which was
// never told. The writer's brief said "expert SEO content writer, no generic
// filler" and said nothing at all about superlatives, absolutes or unsourced
// frequency claims — the exact things the checker refuses. Two halves of one
// product working to different standards, with the owner paying the difference.
//
// So the rules live here, once, and both halves read them: the writer is told them
// before it writes, and the repair pass is told them when something slips through.
// A rule added here reaches both, which is the only way they stay in step.

/**
 * What the writer is told, in the words a writer needs. Deliberately about HOW to
 * say the true thing rather than a list of banned words — a model given only a
 * blocklist writes around it and means the same thing.
 */
export const CLAIM_RULES = `WHAT YOU MAY NOT CLAIM. Everything here publishes under the owner's name and their
reputation carries it, so every sentence has to survive a stranger asking "how do you know that?".

- No superlatives you cannot show: "the best", "#1", "the leading", "world's finest", "the best online
  retailers". Say what is specifically true instead — "measures to the centimetre", "arrives in four days".
- No absolutes or guarantees: "ensures", "guarantees", "always", "never fails", "perfectly", "risk-free",
  "100%". Write what usually happens and say plainly when it does not.
- No frequency claims without a source: "most people", "it happens more often than you'd think",
  "nine times out of ten". Either cite where the number comes from, or drop the number and describe
  the situation.
- No invented statistics, percentages or prices. Use only figures the brief actually gives you.
- No medical, legal or financial promises of any kind.
- No claim about what a competitor does, unless it is stated as publicly checkable fact.

Write the specific true thing rather than the impressive vague one. "A 3ft doorway will not take a
2.1m sofa" is worth more than "the perfect fit, guaranteed", and it is the sentence a buyer believes.`;

/**
 * The fast pattern scan. The checker's first tier and the repair pass's own
 * verification both use this, so "did the rewrite actually fix it" is judged by
 * the same rule that flagged it.
 */
export const RISKY = [
  { re: /\b(guarantee[ds]?|100%|risk[- ]free|no risk|always works)\b/i, label: "absolute guarantee" },
  { re: /\b(#1|number one|world'?s (best|leading|#1)|the best (in|on|online|way))\b/i, label: "unverifiable superlative" },
  { re: /\b(perfectly|flawless(ly)?|ensur(es|ing)|never fails)\b/i, label: "absolute" },
  { re: /\b(most people|more often than|nine times out of ten|everyone knows)\b/i, label: "unsourced frequency claim" },
  { re: /\b(cure|cures|treat|treats|prevents?|diagnos\w+)\b/i, label: "medical claim" },
  { re: /\b(fda[- ]approved|clinically proven|scientifically proven|doctor recommended)\b/i, label: "authority claim" },
  { re: /\b(guaranteed (roi|returns|income|profit)|double your|get rich)\b/i, label: "financial claim" },
  { re: /(\b\d{2,}%|\$\d[\d,]{2,})/, label: "specific statistic" },
];

/** Which rules a piece of text trips. Names only, deduped. */
export function scanClaims(text) {
  const t = String(text || "");
  const flags = [];
  for (const r of RISKY) if (r.re.test(t)) flags.push(r.label);
  return [...new Set(flags)];
}
