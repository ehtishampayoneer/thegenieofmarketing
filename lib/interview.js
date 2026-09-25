// lib/interview.js
// ── ONE TURN OF THE ONBOARDING INTERVIEW ──
// Why this was rebuilt. The old turn re-sent the last eight messages verbatim and
// asked the model to rewrite fourteen one-sentence fields inside 900 tokens. An
// owner pasting their real strategy (thousands of words, which is exactly what we
// want from them) blew that budget: Gemini 2.5 spends output tokens thinking, so
// the JSON came back cut off; Groq's free tier refused a prompt that size; the
// OpenRouter free model was rate limited. Every provider failed, the owner saw
// "I'm a little busy", pasted it again, and it failed again. When a turn did work
// there was nowhere to put packages, decision-makers or objections, so Genie
// kept asking for things it had just been told.
//
// Now the brief IS the memory, so no history is re-sent. The model's only job is
// to extract what this one message adds, as a patch. Deciding what is still
// missing is done in code (lib/business-brief.js), so Genie cannot ask about a
// section that is already filled, however the model phrases things.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { normalizeBrief, mergeBrief, flattenBrief, coverage, nextTopic, briefText } from "@/lib/business-brief";

export const MAX_MESSAGE = 16000;
const SKIP_RX = /^\s*(skip|pass|next|no idea|not sure|don'?t know|n\/?a|none|nothing to add)\s*[.!]?\s*$/i;
const DONE_RX = /\b(that'?s (it|all|everything)|build (it|my plan|the plan)|go ahead and build|you have (enough|everything)|nothing else)\b/i;

export class InterviewUnavailable extends Error {}

/**
 * @returns the response body for the client. Throws InterviewUnavailable when no
 * model could read the message, so the route can offer a retry without losing it.
 */
export async function interviewTurn({ ai = {}, message = "", lastQuestion = "", lastTopic = "", skipped = [], describe = () => "" }) {
  const text = String(message).trim().slice(0, MAX_MESSAGE);
  const skip = new Set(Array.isArray(skipped) ? skipped.filter((k) => typeof k === "string") : []);
  const brief = normalizeBrief(ai.brief);

  // "skip" / "not sure" answers the question without adding facts. Handled in
  // code, so a one-word reply costs no model call and is never read as a fact.
  if (lastTopic && SKIP_RX.test(text)) {
    skip.add(lastTopic);
    return respond({ ai: flattenBrief(ai, brief), changed: [], learned: "No problem, I will work without that.", asks: {}, skipped: [...skip], done: false });
  }

  const open = coverage(brief, ai).missing.filter((k) => !skip.has(k));
  let r;
  try {
    r = await callAI({
      system:
        "You are Genie, a senior growth strategist interviewing a business owner before building their customer-acquisition plan. " +
        "You extract facts precisely. The owner is the source of truth and overrides anything guessed from their website. " +
        "Never invent a fact, number, client, result or price the owner did not state. Keep their own numbers and names exactly. " +
        "Return ONLY valid JSON.",
      json: true,
      temperature: 0.2,
      // Generous on purpose: long answers produce long lists, and Gemini 2.5
      // spends part of this budget thinking before it writes a word. 900 was what
      // cut the JSON off.
      maxTokens: 7000,
      timeoutMs: 40000,
      prompt: buildPrompt({ ai, brief, text, lastQuestion, open, describe }),
    });
  } catch (e) {
    if (e instanceof AllProvidersFailedError) throw new InterviewUnavailable("all providers failed");
    throw e;
  }

  const j = r.json || {};
  const { brief: merged, changed } = mergeBrief(brief, j.patch || {}, j.replace || []);
  const next = flattenBrief(ai, merged);
  const prof = j.profile && typeof j.profile === "object" ? j.profile : {};
  for (const f of ["businessName", "businessType", "industry", "subCategory", "differentiator", "keyProducts"]) {
    if (prof[f] != null && String(prof[f]).trim()) next[f] = String(prof[f]).trim().slice(0, 300);
  }
  const done = !!j.done || DONE_RX.test(text);
  return respond({ ai: next, changed, learned: j.learned, asks: j.asks || {}, skipped: [...skip], done });
}

function buildPrompt({ ai, brief, text, lastQuestion, open, describe }) {
  return `WHAT I ALREADY KNOW (from their website and earlier answers):
${describe(ai)}
${briefText({ brief }) || "(no strategy captured yet)"}

${lastQuestion ? `MY LAST QUESTION TO THEM: "${String(lastQuestion).slice(0, 500)}"\n\n` : ""}THE OWNER'S REPLY (it may be long, read all of it):
"""
${text}
"""

Extract ONLY what this reply adds or corrects, into these sections. Leave out any section the reply says nothing about.
- offer: what customers actually get, in outcome terms, 1-3 sentences
- pricing: packages, prices and where a new customer starts, keeping exact figures
- segments: list of the kinds of customer to target, most important first, in the words that customer would use about themselves (for example a payroll tool would say "accountancy practices", a kitchen fitter would say "independent restaurants")
- idealSignals: list of signals that mark a great-fit prospect (e.g. "Sells medium-to-high-ticket products online")
- disqualifiers: list of who NOT to target
- decisionMakers: list of roles to contact
- problems: list of buyer problems or goals that make them buy
- objections: list of {"objection": "...", "answer": "how to respond, if the owner said"}
- proof: what proof exists, and what may or may not be claimed
- leadWith: list of messages or angles to lead with
- neverSay: list of things never to say, claim or promise
- cta: the next step they want prospects to take
- salesMotion: how a sale happens, first contact to paid, 1-4 sentences
- channels: list of places or methods to find customers
- tone: how they want to sound

Lists: short items, one idea each, nothing already in what I know.
"replace": section keys where the owner clearly REPLACES what I had rather than adding to it.
"profile": only fields this reply changes: businessName, businessType (E-commerce, Local service, SaaS, Content/Media, Marketplace, Agency, Other), industry, subCategory, differentiator, keyProducts.
"learned": ONE sentence to the owner saying what you took from this, using their real details. Never generic ("thanks for the details").
"asks": for each of these still-open sections, one short, natural question tailored to this business that does not re-ask anything known: ${open.join(", ") || "(none)"}
"done": true only if the owner says they are finished.

Return ONLY:
{"patch":{},"replace":[],"profile":{},"learned":"","asks":{},"done":false}`;
}

/**
 * Decide what Genie says next. The question is chosen in code from what is still
 * missing; the model only supplies the wording. Exported for tests.
 */
export function respond({ ai, changed = [], learned = "", asks = {}, skipped = [], done = false }) {
  const cov = coverage(ai.brief, ai);
  const topic = done ? null : nextTopic(ai.brief, ai, skipped);
  const ack = String(learned || "").trim() || (changed.length ? "Got it, I have added that." : "");
  let question;
  if (topic) {
    const q = String(asks?.[topic.key] || "").trim() || `Tell me ${topic.ask}.`;
    question = cov.ready ? `I have enough to build your plan. If you want it sharper: ${lowerFirst(q)}` : q;
  } else {
    question = "I have a clear picture now. Add anything else you like, or press the button below and I will build your plan on this.";
  }
  return {
    ok: true,
    ai,
    changed,
    reply: [ack, question].filter(Boolean).join("\n\n"),
    topic: topic?.key || null,
    skipped,
    coverage: cov,
    resolved: cov.ready && (done || !topic),
  };
}

function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
