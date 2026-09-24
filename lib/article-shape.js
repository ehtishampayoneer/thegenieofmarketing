// lib/article-shape.js
// ── HOW LONG THIS ONE SHOULD BE, AND WHY ──
//
// Every article was 600 to 900 words. That is the right length for exactly one
// of the four jobs Genie writes for, and too thin for the other three.
//
// A question page wants to be short. AI assistants quote the clearest answer, not
// the longest one, and padding an answer page actively hurts it — the quotable
// sentence gets buried.
//
// A competitive commercial search wants the opposite. The pages already on page
// one for "best AR app for Shopify" are 1,500 to 2,500 words because the reader
// has real questions and the competition has answered them. Nine hundred words
// there is not a lean article, it is an incomplete one, and it will not rank.
//
// The information to tell them apart was already being computed and thrown away:
// selectTargets returns the buyer stage and the competition score for every
// keyword it picks, and the content engine used only a single `aeo` boolean.
//
// THE RULE THAT MATTERS MOST. Length is a ceiling, never a quota. A padded
// two-thousand words is worse than an honest nine hundred, so every shape below
// carries an instruction to stop when the useful material runs out. Word counts
// make models pad; this is the one place that has to be said out loud.

/**
 * @param {object} pick  a keyword from selectTargets: { stage, competition, source, aeo }
 * @returns {{shape, min, max, maxTokens, timeoutMs, brief}}
 */
export function articleShape(pick = {}) {
  const stage = String(pick?.stage || "learn");
  const competition = Number.isFinite(Number(pick?.competition)) ? Number(pick.competition) : 50;
  const isAnswer = pick?.source === "aeo" || stage === "problem";

  // ── AN ANSWER. Short on purpose.
  if (isAnswer) {
    return {
      shape: "answer",
      min: 700, max: 1000,
      maxTokens: 3400, timeoutMs: 45000,
      brief:
        "LENGTH: 700 to 1,000 words. Short deliberately. This is a question people ask an assistant, and assistants quote the clearest answer rather than the longest one — padding buries the sentence that would have been quoted. If the honest answer is shorter, write shorter.",
    };
  }

  // ── A COMPARISON. Two sides properly covered, or it is not a comparison.
  if (stage === "compare") {
    return {
      shape: "comparison",
      min: 1200, max: 1800,
      maxTokens: 5200, timeoutMs: 60000,
      brief:
        "LENGTH: 1,200 to 1,800 words. A comparison that covers one side properly and waves at the other is not a comparison, and readers can tell instantly. Give each option its real strengths and its real limits, including where a competitor is genuinely the better choice. Stop when the comparison is complete — do not pad to reach a number.",
    };
  }

  // ── A COMPETITIVE SEARCH. The pages already ranking are thorough.
  if (competition >= 60) {
    return {
      shape: "deep",
      min: 1500, max: 2200,
      // 70s, not more. The route's whole budget is 120s and the social pass that
      // follows this one takes up to 40, so anything above 70 here leaves no room
      // for a cold start. (That 120 also means this route needs Vercel Pro — on
      // Hobby the function is stopped at 60 whatever it declares.)
      maxTokens: 6200, timeoutMs: 70000,
      brief:
        "LENGTH: 1,500 to 2,200 words. This search is competitive, and the pages already on page one are thorough — a short piece here will not rank, however well written. Cover the reader's real follow-up questions, include specifics, numbers and worked examples. But depth means more genuinely useful material, NOT more words: if you run out of things worth saying at 1,400, stop there rather than padding.",
    };
  }

  // ── EVERYTHING ELSE. Enough to be complete, no more.
  return {
    shape: "guide",
    min: 1000, max: 1400,
    maxTokens: 4400, timeoutMs: 55000,
    brief:
      "LENGTH: 1,000 to 1,400 words. Long enough to answer the question completely, short enough that every paragraph earns its place. Stop when it is complete rather than padding to a number.",
  };
}

/** One line for the log and the approval card, so the choice is never a mystery. */
export function shapeReason(shape, pick = {}) {
  const c = Number(pick?.competition ?? 50);
  switch (shape) {
    case "answer": return "Written short and answer-first, because this is a question AI assistants get asked.";
    case "comparison": return "Written long enough to cover both sides, because a one-sided comparison convinces nobody.";
    case "deep": return `Written in depth, because this search is competitive (${c}/100) and the pages already ranking are thorough.`;
    default: return "Written to answer the question completely, and no longer.";
  }
}
