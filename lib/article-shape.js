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
//
// ── AND HOW LONG THE HOST WILL ALLOW ──
//
// The four shapes below are what each job actually wants. What the serverless host
// permits is a separate fact, and the two have to be reconciled somewhere.
//
// Vercel Hobby stops any function at 60 seconds whatever `maxDuration` declares.
// A deep article asked the model for 70, so on Hobby the function was killed
// mid-sentence and the article was lost — after the writer-grade model had already
// been paid for it. No amount of splitting or reordering fixes that: one AI call
// that needs 70 seconds cannot run inside a 60-second function.
//
// So the ceiling is read from the environment rather than assumed, and the shapes
// are clamped to fit it. On Hobby the long ones come out shorter, which is a real
// cost paid deliberately: a 1,300-word article that exists beats a 2,200-word one
// that was killed at 60 seconds. Raise FUNCTION_MAX_SECONDS to 300 the day the
// plan allows it and every shape returns to its full length with no code change.

// The host's limit lives in one place, because more than this module has to respect
// it. Re-exported so callers that only care about article length need one import.
import { functionLimitMs, DEFAULT_FUNCTION_SECONDS } from "@/lib/function-limit";
export { functionLimitMs, DEFAULT_FUNCTION_SECONDS };

// What else has to happen inside the same invocation before and after the writing
// call: a cold start, the caller's auth, the scan read, the keyword pick, the
// prompt build, and the insert that saves the article. Measured generously,
// because the cost of being wrong is a lost article.
const OVERHEAD_MS = 12000;

/** The most the writing call itself may take on this host. */
export function writeBudgetMs() {
  return Math.max(20000, functionLimitMs() - OVERHEAD_MS);
}

// Roughly how many tokens a model gets through per second, used only to scale a
// word range down when the budget will not fit it. Deliberately conservative: too
// low means a slightly shorter article, too high means a lost one.
const TOKENS_PER_SEC = 90;

/**
 * Fit one shape inside what the host allows. When the budget is generous the shape
 * is returned exactly as written. When it is not, the time, the token ceiling and
 * the word range come down together — a shorter deadline with the same word count
 * asked for would just produce a truncated article.
 */
function fit(shape) {
  const budget = writeBudgetMs();
  if (shape.timeoutMs <= budget) return { ...shape, clamped: false };

  const ratio = budget / shape.timeoutMs;
  const min = Math.max(600, Math.round((shape.min * ratio) / 50) * 50);
  const max = Math.max(min + 200, Math.round((shape.max * ratio) / 50) * 50);
  const maxTokens = Math.max(2400, Math.min(shape.maxTokens, Math.round((budget / 1000) * TOKENS_PER_SEC)));

  return {
    ...shape,
    min, max, maxTokens, timeoutMs: budget, clamped: true,
    // The brief is rewritten rather than patched, so the model is never handed two
    // different word counts and left to choose.
    brief: `${shape.brief.replace(/^LENGTH: [^.]+\. ?/, "")}`.trim()
      ? `LENGTH: ${min.toLocaleString()} to ${max.toLocaleString()} words. ${shape.brief.replace(/^LENGTH: [^.]+\. ?/, "")}`
      : `LENGTH: ${min.toLocaleString()} to ${max.toLocaleString()} words.`,
  };
}

/**
 * @param {object} pick  a keyword from selectTargets: { stage, competition, source, aeo }
 * @returns {{shape, min, max, maxTokens, timeoutMs, brief, clamped}}
 */
export function articleShape(pick = {}) {
  const stage = String(pick?.stage || "learn");
  const competition = Number.isFinite(Number(pick?.competition)) ? Number(pick.competition) : 50;
  const isAnswer = pick?.source === "aeo" || stage === "problem";

  // ── AN ANSWER. Short on purpose.
  if (isAnswer) {
    return fit({
      shape: "answer",
      min: 700, max: 1000,
      maxTokens: 3400, timeoutMs: 45000,
      brief:
        "LENGTH: 700 to 1,000 words. Short deliberately. This is a question people ask an assistant, and assistants quote the clearest answer rather than the longest one — padding buries the sentence that would have been quoted. If the honest answer is shorter, write shorter.",
    });
  }

  // ── A COMPARISON. Two sides properly covered, or it is not a comparison.
  if (stage === "compare") {
    return fit({
      shape: "comparison",
      min: 1200, max: 1800,
      maxTokens: 5200, timeoutMs: 60000,
      brief:
        "LENGTH: 1,200 to 1,800 words. A comparison that covers one side properly and waves at the other is not a comparison, and readers can tell instantly. Give each option its real strengths and its real limits, including where a competitor is genuinely the better choice. Stop when the comparison is complete — do not pad to reach a number.",
    });
  }

  // ── A COMPETITIVE SEARCH. The pages already ranking are thorough.
  if (competition >= 60) {
    return fit({
      shape: "deep",
      min: 1500, max: 2200,
      maxTokens: 6200, timeoutMs: 70000,
      brief:
        "LENGTH: 1,500 to 2,200 words. This search is competitive, and the pages already on page one are thorough — a short piece here will not rank, however well written. Cover the reader's real follow-up questions, include specifics, numbers and worked examples. But depth means more genuinely useful material, NOT more words: if you run out of things worth saying before the lower end of that range, stop there rather than padding.",
    });
  }

  // ── EVERYTHING ELSE. Enough to be complete, no more.
  return fit({
    shape: "guide",
    min: 1000, max: 1400,
    maxTokens: 4400, timeoutMs: 55000,
    brief:
      "LENGTH: 1,000 to 1,400 words. Long enough to answer the question completely, short enough that every paragraph earns its place. Stop when it is complete rather than padding to a number.",
  });
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

/**
 * Why this one came out shorter than its kind normally would. Empty when nothing
 * was cut, so a card never carries an excuse it did not need.
 */
export function clampReason(shape) {
  if (!shape?.clamped) return "";
  return `Shortened to fit this hosting plan: a function here is stopped at ${Math.round(functionLimitMs() / 1000)} seconds, and an article that gets cut off mid-sentence is worth less than a shorter one that finishes.`;
}
