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

  // -- FIND THE SENTENCE HOWEVER THE CHECKER QUOTED IT --
  // This used to require the checker's quote to appear in the article character
  // for character. It rarely did: the checker writes "It’s" where the article has
  // "It's", an en dash for a hyphen, drops the **bold**, and quotes a three-
  // sentence case study as one claim. The match failed, the repair returned
  // "claims_not_found_verbatim" without a word, and the article went to the owner
  // as "edit this". Each claim is located sentence by sentence in the article's
  // own text, and it is the ARTICLE's words that are rewritten.
  const present = [];
  for (const c of list) {
    for (const span of locateClaim(body, c).spans) {
      const original = body.slice(span.start, span.end);
      if (!present.includes(original)) present.push(original);
    }
  }
  if (!present.length) return { ok: false, text: body, fixed: [], reason: "claims_not_found" };

  const whyOf = (sentence) => {
    const hit = (claims || []).find((x) => locateClaim(sentence, String(x?.claim || "")).spans.length);
    return String(hit?.why || "").trim();
  };
  const numbered = present.map((c, i) => {
    const why = whyOf(c);
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

// -- LOCATING A SENTENCE, AND TAKING IT OUT --

// Straight quotes, one kind of dash, no markdown emphasis or link syntax, single
// spaces, lower case: the differences a checker's quote and the article's text
// disagree on without meaning anything.
export function normalizeForMatch(text) {
  return String(text || "")
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|\*|`)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const tokensOf = (text) => normalizeForMatch(text).match(/[a-z0-9']+/g) || [];

/**
 * Every sentence in a text with its exact position, so it can be cut or replaced
 * in the original rather than in a normalised copy. A sentence ends at . ! or ?
 * followed by a space and a capital (so "3.5 metres" and "e.g. a sofa" are not
 * split), or at a line break (so list items and headings stand alone).
 */
export function sentenceSpans(text) {
  const t = String(text || "");
  const spans = [];
  // Closing marks after the full stop include markdown emphasis: in
  // "**We do this.** Then that." the sentence ends at "**", and without it the
  // two sentences were one and a bolded claim could never be matched on its own.
  const boundary = /(?<=[.!?]["'\u201d\u2019)\]*_]{0,3})[ \t]+(?=["'\u201c\u2018(\[*_]{0,3}[A-Z0-9])|\n+/g;
  let last = 0;
  const push = (a, b) => {
    const seg = t.slice(a, b);
    const lead = seg.length - seg.trimStart().length;
    const trimmed = seg.trim();
    if (trimmed) spans.push({ start: a + lead, end: a + lead + trimmed.length, text: trimmed });
  };
  let m;
  while ((m = boundary.exec(t))) { push(last, m.index); last = m.index + m[0].length; }
  push(last, t.length);
  return spans;
}

/**
 * Where a flagged claim sits in the article: the sentence (or sentences, when the
 * checker quoted several as one) that say it. A body sentence matches when it
 * holds almost all of the claim sentence's words and is mostly made of them.
 * @returns {{ spans: {start,end,text}[], found: boolean }}
 */
export function locateClaim(body, claim) {
  const all = sentenceSpans(claim).map((s) => tokensOf(s.text)).filter((w) => w.length);
  // A two-word sentence like "No coding." would match "No coding." anywhere in
  // the article, so short pieces are handled separately below.
  const parts = all.filter((w) => w.length >= 3);
  const short = all.filter((w) => w.length < 3);
  if (!parts.length && !short.length) return { spans: [], found: false };
  const candidates = sentenceSpans(body).map((s) => ({ ...s, words: tokensOf(s.text) }));
  const spans = [];
  let found = true;
  for (const want of parts) {
    let best = null;
    for (const c of candidates) {
      if (!c.words.length) continue;
      const have = new Set(c.words);
      let hit = 0;
      for (const w of want) if (have.has(w)) hit++;
      const cover = hit / want.length;        // how much of the claim is in this sentence
      const within = hit / c.words.length;    // how much of this sentence is the claim
      const score = Math.min(cover, within * 1.25);
      if (cover >= 0.75 && within >= 0.5 && (!best || score > best.score)) best = { ...c, score };
    }
    if (best) { if (!spans.some((x) => x.start === best.start)) spans.push({ start: best.start, end: best.end, text: best.text }); }
    else found = false;
  }
  // Short pieces: exact words only, and only within a few lines of the rest of
  // the claim — the "No coding." that opens the flagged list item, not one in
  // another section. A claim made only of short pieces takes the first exact one.
  const lo = spans.length ? Math.min(...spans.map((x) => x.start)) - 300 : -Infinity;
  const hi = spans.length ? Math.max(...spans.map((x) => x.end)) + 300 : Infinity;
  for (const want of short) {
    const key = want.join(" ");
    const hit = candidates.find((c) => c.words.join(" ") === key && c.start >= lo && c.end <= hi && !spans.some((x) => x.start === c.start));
    if (hit) spans.push({ start: hit.start, end: hit.end, text: hit.text });
    else found = false;
  }
  spans.sort((a, b) => a.start - b.start);
  return { spans, found: found && spans.length > 0 };
}

/**
 * The last resort that always finishes: take the flagged sentences out.
 *
 * A second AI reading of an 850-word article nearly always finds a new sentence to
 * question, so "rewrite, then check again with the AI" never settled, and when it
 * did not settle the article was handed to the owner. Removing a sentence cannot
 * fail and cannot add a new claim; the article loses a line, not its structure.
 * List items and headings emptied by a removal go with it.
 *
 * @returns {{ text, removed: string[], missing: string[] }}
 *   missing — claims that could not be located, so the caller knows the article
 *             is NOT known to be clean
 */
export function removeClaims(body, claims = []) {
  const text = String(body || "");
  const cut = [];
  const missing = [];
  for (const c of claims || []) {
    const claim = String(c?.claim || c || "").trim();
    if (!claim) continue;
    const at = locateClaim(text, claim);
    if (!at.found) { missing.push(claim); continue; }
    for (const sp of at.spans) if (!cut.some((x) => x.start === sp.start)) cut.push(sp);
  }
  if (!cut.length) return { text, removed: [], missing };

  let out = text;
  for (const sp of [...cut].sort((a, b) => b.start - a.start)) {
    let a = sp.start, b = sp.end;
    const piece = out.slice(a, b);
    // A sentence that opened or closed a **bold** run takes half of the pair
    // with it. Hand that half to the neighbour, so "**Cut. Kept.**" becomes
    // "**Kept.**" rather than "Kept.**" with two asterisks showing.
    const odd = ((piece.match(/\*\*/g) || []).length % 2) === 1;
    if (odd && piece.startsWith("**")) {
      if (out[b] === " ") b++;
      out = out.slice(0, a) + "**" + out.slice(b);
    } else if (odd && piece.endsWith("**")) {
      while (a > 0 && out[a - 1] === " ") a--;
      out = out.slice(0, a) + "**" + out.slice(b);
    } else {
      // Take one adjoining space with the sentence, so a cut at the start of a
      // paragraph does not leave the next sentence indented by a stray space.
      if (out[b] === " ") b++;
      else if (a > 0 && out[a - 1] === " ") a--;
      out = out.slice(0, a) + out.slice(b);
    }
  }
  out = out
    .split("\n")
    // A line left holding only a list marker or a heading marker had nothing else.
    .filter((line) => !/^\s*(?:[-*+]|\d+[.)]|#{1,6})\s*$/.test(line))
    .join("\n")
    // Runs of spaces INSIDE a line only: leading spaces are a nested list's
    // indentation, and collapsing them would un-nest it.
    .replace(/(\S)[ \t]{2,}/g, "$1 ")
    .replace(/(\S) +([,.!?;:])/g, "$1$2")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: out, removed: cut.map((x) => x.text), missing };
}
