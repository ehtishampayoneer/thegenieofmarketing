// lib/swarm/judge.js
// ── HOW EACH KIND OF PERSON REACTS ──
// The AI plays each kind of person in the crowd and says, in their own words, how
// they react to the draft, as a SPREAD of likely reactions (1 hostile .. 5 would
// act or share) rather than a single score. Asking for a spread is what keeps the
// crowd varied: research on synthetic panels shows single AI scores bunch up in
// the agreeable middle, while spreads keep the real range (PyMC Labs, 2026).
//
// There is also a judge that needs no AI at all: plain rules for what gets posts
// removed, emails binned and pitches ignored. It always runs, is blended into the
// AI's view so spam signals can never be talked away, and carries testing on its
// own when every free AI is busy, so the testers never stop.

import { checkPolicy } from "@/lib/platform-policy";
import { KINDS } from "@/lib/swarm/crowd";

const HYPE = /\b(revolutionary|game[- ]?chang\w*|cutting[- ]edge|best[- ]in[- ]class|world[- ]class|unbeatable|amazing|incredible|guaranteed|100%|act now|limited time|don'?t miss|once in a lifetime|skyrocket|10x)\b/gi;
const PUSHY = /\b(buy now|sign up (now|today)|click here|dm me|check out my|use my (code|link)|book a call today)\b/gi;

// Short labels the crowd's complaints are grouped under.
const OBJECTION_RULES = [
  [/advert|promo|sales|selling|spam|marketing speak|pitch/i, "sounds like an advert"],
  [/proof|evidence|results?|case stud|numbers|claim/i, "no proof"],
  [/price|cost|expensive|afford|cheap/i, "price unclear or too high"],
  [/unclear|confus|vague|what (is|does)|don'?t understand|generic/i, "unclear what it is"],
  [/relevan|not for me|doesn'?t apply|wrong audience/i, "not relevant to me"],
  [/long|wall of text|too much/i, "too long"],
  [/trust|legit|scam|who are (you|they)|never heard/i, "don't trust it yet"],
  [/competitor|already (use|have)|switch/i, "happy with what I use"],
  [/pushy|aggressive|desperate/i, "too pushy"],
  [/rule|removed|ban|violat/i, "breaks the community rules"],
  [/personal|template|mass|generic email|copy.?paste/i, "feels mass-sent"],
];

export function normalizeObjection(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  for (const [re, tag] of OBJECTION_RULES) if (re.test(t)) return tag;
  return t.toLowerCase().replace(/[^a-z0-9 '-]/g, "").split(/\s+/).slice(0, 5).join(" ") || null;
}

// ── The judge with no AI ─────────────────────────────────────────────────────
const CHANNEL = { reddit: "reddit", quora: "quora", reply: "reddit", email: "email", winback: "email", pitch: "email", social: "x", article: "blog", listing: "blog", ad: "x", launch: "linkedin", offer: "blog", landing: "blog", product: "blog" };
const IDEAL = { reddit: [60, 260], quora: [120, 400], reply: [40, 220], email: [40, 160], winback: [40, 170], pitch: [35, 200], social: [8, 70], article: [600, 3000], listing: [30, 250], ad: [5, 70], launch: [30, 350], offer: [12, 400], landing: [60, 2500], product: [30, 350] };

/**
 * Plain-rule reading of a draft. Returns a base reaction (1..5), the complaints
 * the rules are sure of, and the signals behind them.
 */
export function rulesJudge(text, kind) {
  const t = String(text || "");
  const words = t.split(/\s+/).filter(Boolean).length;
  const signals = [];
  let base = 3.1;
  const hype = (t.match(HYPE) || []).length;
  const pushy = (t.match(PUSHY) || []).length;
  const bangs = (t.match(/!/g) || []).length;
  const caps = (t.match(/\b[A-Z]{4,}\b/g) || []).length;
  const policy = checkPolicy(CHANNEL[kind] || "blog", t);
  const [lo, hi] = IDEAL[kind] || [20, 400];
  const objections = [];

  if (hype) { base -= Math.min(1, hype * 0.3); signals.push(`hype words (${hype})`); objections.push("sounds like an advert"); }
  if (pushy) { base -= Math.min(1.2, pushy * 0.45); signals.push("pushy call to action"); objections.push("too pushy"); }
  if (bangs > 2) { base -= 0.3; signals.push("many exclamation marks"); }
  if (caps > 1) { base -= 0.2; signals.push("shouting in capitals"); }
  if (policy.flags.length) { base -= 0.5 * policy.flags.length; signals.push(...policy.flags); objections.push("breaks the community rules"); }
  if (words < lo) { base -= 0.3; signals.push("too short to be useful"); objections.push("unclear what it is"); }
  if (words > hi * 1.4) { base -= 0.4; signals.push("too long for where it goes"); objections.push("too long"); }
  if (/\d/.test(t)) { base += 0.15; signals.push("specific numbers"); }
  if (["reply", "reddit", "quora", "social"].includes(kind) && /\?/.test(t)) base += 0.1;
  if (["email", "pitch", "winback"].includes(kind)) {
    if (/^\s*(?:[Hh]i|[Hh]ello|[Hh]ey|[Dd]ear)\s+[A-Z][a-z]+/m.test(t)) { base += 0.2; signals.push("addressed to a person"); }
    else { base -= 0.3; objections.push("feels mass-sent"); }
  }
  return { base: Math.max(1, Math.min(5, base)), objections: [...new Set(objections)], signals };
}

/** A spread of reactions around a base, leaning worse for sceptical people. */
export function distAround(base, skeptic = 0.5) {
  const c = Math.max(1, Math.min(5, base - (skeptic - 0.5) * 1.2));
  const w = [1, 2, 3, 4, 5].map((k) => Math.exp(-((k - c) ** 2) / 1.3));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}

// ── The AI judge ─────────────────────────────────────────────────────────────
export function judgePrompt({ text, kind, title, business, people, question = "", market = "" }) {
  const k = KINDS[kind] || KINDS.social;
  return `YOU ARE PLAYING ${people.length} DIFFERENT PEOPLE reacting to one piece of marketing. React as each of them honestly would, not as a helpful assistant. Real people are mostly busy, indifferent or sceptical; enthusiasm must be earned by the text itself.

WHAT IT IS: ${k.context}
FROM: ${business}${market ? `\nTHE PEOPLE ARE IN: ${market}` : ""}${question ? `\nTHE OWNER WANTS TO KNOW: ${String(question).slice(0, 300)} (answer this in each person's sentence)` : ""}
${title ? `TITLE: ${title}\n` : ""}THE TEXT:
"""
${String(text).slice(0, 2200)}
"""

THE PEOPLE:
${people.map((p) => `${p.id}: ${p.name} - ${p.who}${p.fears ? ` Put off by: ${p.fears}` : ""}`).join("\n")}

For each person give the probability of each reaction:
1 = annoyed, would report, remove or complain
2 = negative, ignores it with a bad impression
3 = indifferent, scrolls past
4 = interested, would read on or reply
5 = would act: click, reply yes, buy, share or approve
Plus their main objection (short, or "" if none) and one sentence in their own words.

Return ONLY:
{"r":[{"id":"a1","d":[p1,p2,p3,p4,p5],"o":"objection","q":"their words"}]}`;
}

/** Turn the AI's answer into reactions per person, blended with the rules. */
export function readJudgement(json, people, rules) {
  const rows = Array.isArray(json?.r) ? json.r : [];
  const byId = Object.fromEntries(rows.map((x) => [String(x?.id || ""), x]));
  const reactions = {};
  const quotes = [];
  for (const p of people) {
    const x = byId[p.id];
    const ruleDist = distAround(rules.base, p.skeptic);
    let dist = ruleDist;
    const objections = [...rules.objections];
    if (x && Array.isArray(x.d)) {
      const d = x.d.map((v) => Math.max(0, Number(v) || 0));
      const s = d.reduce((a, b) => a + b, 0) || 1;
      // The AI speaks for the person; the rules keep spam signals in the room.
      dist = d.map((v, i) => 0.85 * (v / s) + 0.15 * ruleDist[i]);
      const o = normalizeObjection(x.o);
      if (o) objections.unshift(o);
      if (x.q) quotes.push({ id: p.id, who: p.name, q: String(x.q).slice(0, 200), mean: meanOf(dist) });
    }
    reactions[p.id] = { dist, objections: [...new Set(objections)].slice(0, 3) };
  }
  return { reactions, quotes, answered: rows.length };
}

/** Reactions from the rules alone, for when no AI is free. */
export function rulesReactions(people, rules) {
  const reactions = {};
  for (const p of people) reactions[p.id] = { dist: distAround(rules.base, p.skeptic), objections: rules.objections.slice(0, 3) };
  return reactions;
}

export function meanOf(dist) { return dist.reduce((s, p, i) => s + p * (i + 1), 0); }
