// lib/swarm/improve.js
// ── THE IMPROVERS ──
// Every complaint the crowd raised becomes a ticket. The improvers write three
// new versions that answer the biggest tickets, a small panel of the crowd's most
// common people (plus its gatekeepers) scores all of them side by side, and only
// a version that clearly beats the original replaces it. Then the full crowd is
// run again on the winner, so what the owner sees has been tested twice.
//
// Guard rails: facts may not be invented, the platform's rules still apply, and
// one improver's whole job is to keep the owner's plain human voice, so versions
// do not drift into bland committee writing.

import { KINDS } from "@/lib/swarm/crowd";
import { meanOf } from "@/lib/swarm/judge";

export const IMPROVE_BELOW = 65;   // crowd score under this gets improvers
export const MIN_GAIN = 0.25;      // a version must beat the original by this much (1..5 scale)

export function needsImprovement(result) {
  return !!result && (result.score < IMPROVE_BELOW || result.gate?.blocked || result.backlash > 0.08);
}

/** Tickets: the crowd's complaints, biggest first, each with how many people raised it. */
export function ticketsFrom(result) {
  return (result?.objections || []).filter((o) => o.count >= 3).slice(0, 4);
}

export function improvePrompt({ text, kind, title, business, tickets, quotes, isArticle }) {
  const k = KINDS[kind] || KINDS.social;
  const shape = isArticle
    ? `{"variants":[{"title":"","meta":"","changed":"one line: what you changed and why"}]}`
    : `{"variants":[{"text":"","changed":"one line: what you changed and why"}]}`;
  return `A crowd of 1,000 simulated people reacted to this ${k.label} from ${business}. Rewrite it three different ways so fewer of them object.

WHAT IT IS: ${k.context}
${isArticle ? `TITLE: ${title}\nDESCRIPTION: ${text}` : `TEXT:\n"""\n${String(text).slice(0, 2200)}\n"""`}

WHAT THE CROWD OBJECTED TO (tickets, biggest first):
${tickets.map((t) => `- ${t.tag} (${t.count} people)`).join("\n") || "- nothing specific; it just did not land"}
${quotes.length ? `\nWHAT THEY SAID:\n${quotes.slice(0, 6).map((q) => `- ${q.who}: "${q.q}"`).join("\n")}` : ""}

RULES FOR EVERY VERSION
- Never invent facts, numbers, customers, awards or prices that are not in the original.
- Keep the owner's plain, human voice. No hype words, no marketing clichés.
- Obey the place it is going: on Reddit or Quora lead with genuine help; in email be brief and specific to the reader.
- Version 1 fixes the biggest ticket. Version 2 fixes the top two. Version 3 is bolder: a different opening or angle, still honest.
- On every version, make the FIRST line impossible to scroll past: a real hook (curiosity, a surprising true number, a tiny true moment, an honest contrarian take, or the reader's exact pain in their words). Never clickbait, never a promise the piece doesn't keep, no "Imagine if" or "in today's world".
${isArticle ? "- Title under 60 characters, description under 155 characters." : "- Keep roughly the same length unless the crowd said it was too long."}

Return ONLY:
${shape}`;
}

export function readVariants(json, isArticle) {
  const list = Array.isArray(json?.variants) ? json.variants : [];
  return list.slice(0, 3).map((v) => isArticle
    ? { title: String(v?.title || "").trim().slice(0, 90), meta: String(v?.meta || "").trim().slice(0, 200), changed: String(v?.changed || "").slice(0, 200) }
    : { text: String(v?.text || "").trim(), changed: String(v?.changed || "").slice(0, 200) })
    .filter((v) => (isArticle ? v.title : v.text && v.text.length > 20));
}

/** The panel: the crowd's most common people plus every gatekeeper, up to 12. */
export function panelOf(people) {
  const gates = people.filter((p) => p.gate);
  const rest = people.filter((p) => !p.gate).sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return [...gates, ...rest].slice(0, 12);
}

export function screenPrompt({ kind, business, original, variants, panel }) {
  const k = KINDS[kind] || KINDS.social;
  const all = [original, ...variants];
  return `YOU ARE PLAYING ${panel.length} DIFFERENT PEOPLE. Each reads ${all.length} versions of the same ${k.label} from ${business} and rates each version 1-5 (1 annoyed, 3 indifferent, 5 would act). Be as honest and sceptical as real people are.

WHAT IT IS: ${k.context}

${all.map((v, i) => `VERSION ${i}:\n"""\n${String(v).slice(0, 1400)}\n"""`).join("\n\n")}

THE PEOPLE:
${panel.map((p) => `${p.id}: ${p.name} - ${p.who}`).join("\n")}

Return ONLY:
{"s":[{"id":"a1","v":[r0,r1${variants.length > 1 ? ",r2" : ""}${variants.length > 2 ? ",r3" : ""}]}]}`;
}

/**
 * Pick the winner from the panel's ratings. Returns { index, gain, deltas } where
 * index is the variant (0-based among variants) or -1 if none beats the original.
 */
export function pickWinner(json, panel, nVariants) {
  const rows = Array.isArray(json?.s) ? json.s : [];
  const byId = Object.fromEntries(rows.map((r) => [String(r?.id || ""), r?.v]));
  const scores = Array.from({ length: nVariants + 1 }, () => []);
  for (const p of panel) {
    const v = byId[p.id];
    if (!Array.isArray(v)) continue;
    for (let i = 0; i <= nVariants; i++) { const n = Number(v[i]); if (Number.isFinite(n)) scores[i].push({ id: p.id, n, gate: p.gate }); }
  }
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x.n, 0) / xs.length : 0);
  const base = mean(scores[0]);
  let best = -1, bestMean = base;
  for (let i = 1; i <= nVariants; i++) {
    const m = mean(scores[i]);
    // A version the gatekeepers like less than the original never wins.
    const gateWorse = scores[i].some((x) => x.gate && x.n < (scores[0].find((o) => o.id === x.id)?.n ?? 0));
    if (m > bestMean && !gateWorse) { best = i; bestMean = m; }
  }
  if (best < 0 || bestMean - base < MIN_GAIN) return { index: -1, gain: bestMean - base, deltas: {} };
  const deltas = {};
  for (const x of scores[best]) { const o = scores[0].find((y) => y.id === x.id); if (o) deltas[x.id] = x.n - o.n; }
  return { index: best - 1, gain: Math.round((bestMean - base) * 100) / 100, deltas };
}

/**
 * Move a person's spread of reactions by the panel's verdict (on the 1..5 scale).
 * People who were not on the panel move by the panel's average.
 */
export function shiftReactions(reactions, deltas) {
  const vals = Object.values(deltas);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const out = {};
  for (const [id, r] of Object.entries(reactions)) {
    const d = Math.max(-2, Math.min(2, deltas[id] ?? avg));
    out[id] = { ...r, dist: shiftDist(r.dist, d), objections: d > 0.3 ? r.objections.slice(1) : r.objections };
  }
  return out;
}

export function shiftDist(dist, delta) {
  let d = dist.slice();
  let left = Math.abs(delta);
  const up = delta > 0;
  while (left > 1e-6) {
    const f = Math.min(1, left);
    const next = d.slice();
    if (up) for (let i = 3; i >= 0; i--) { const m = d[i] * f; next[i] -= m; next[i + 1] += m; }
    else for (let i = 1; i <= 4; i++) { const m = d[i] * f; next[i] -= m; next[i - 1] += m; }
    d = next; left -= f;
  }
  return d;
}

export { meanOf };
