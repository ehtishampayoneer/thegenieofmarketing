// lib/hooks.js
// ── THE HOOK ──
// The first line and the first image decide whether anything else gets read.
// This is the "purple cow" layer: a rotating set of honest attention styles the
// writer opens with, so Genie's content isn't a wall of the same competent-but-
// grey opening every time. Sometimes surprising, sometimes funny, sometimes a
// tiny story, sometimes a blunt contrarian take.
//
// The hard rule everywhere: a hook may be bold, but it must be TRUE and it must
// pay off. Clickbait that oversells and underdelivers is the fastest way to lose
// a reader's trust and, for a real business, a sale. The crowd (lib/swarm) tests
// openings and the improvers rewrite weak ones, so which style wins is measured,
// not guessed.

// Each style: what it is, and a concrete instruction the model can act on.
export const HOOK_STYLES = [
  { id: "curiosity", name: "Curiosity gap", how: "Open with a specific, real detail that raises a question the reader needs answered — then answer it in the piece. Never withhold the payoff dishonestly." },
  { id: "surprise", name: "Surprising fact or number", how: "Lead with a genuinely counterintuitive fact or a real, specific number from the business or its field. It must be true and checkable." },
  { id: "story", name: "Tiny true story", how: "Open mid-scene with a 1-2 sentence real situation a customer actually faces — a moment, not a summary — then widen out to the point." },
  { id: "contrarian", name: "Honest contrarian take", how: "Start by naming a common belief in this field and saying plainly why it's wrong or incomplete, then back it up. Confident, not rude." },
  { id: "problem", name: "Name the exact pain", how: "Open on the precise, uncomfortable problem the reader is living with, in their own words, so they think 'that's me' by the end of line one." },
  { id: "vivid", name: "Vivid picture", how: "Paint one concrete, sensory image of the before or after, so the reader sees it. Specific objects and moments, no abstractions." },
  { id: "playful", name: "Playful / funny", how: "Open with a light, human, genuinely funny line that fits the brand — a wry observation, not a forced joke or a pun. Skip entirely if the brand is serious (health, legal, finance, grief)." },
  { id: "stakes", name: "What's at stake", how: "Open with what it really costs the reader to keep doing it the current way — time, money or missed customers — concretely, no fear-mongering." },
];

const BAN = "Never use a fake-shock opener, a rhetorical 'Imagine if…', 'In today's fast-paced world', 'Are you tired of…', an em-dash cliché, or any promise the piece doesn't keep. If the hook is not TRUE, it is wrong.";

/** Pick a style deterministically, so a business doesn't get the same opener daily. */
export function hookFor(seed = "", offset = 0) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HOOK_STYLES[(h + offset) % HOOK_STYLES.length];
}

/**
 * Instruction block for a writing prompt. `serious` drops humour for sensitive
 * businesses. `seed` (a keyword/topic) rotates the suggested style so openings
 * stay varied; the model may pick a better-fitting style, it just may not be dull.
 */
export function hookBlock({ seed = "", serious = false, forImage = false } = {}) {
  if (forImage) {
    return `HERO IMAGE — it has to stop the scroll, not decorate. Describe a single, specific, slightly unexpected scene tied to the real subject (a telling object, a real moment, an honest before/after), not a generic stock metaphor (no handshakes, lightbulbs, arrows-up, "team pointing at a screen"). One clear focal point, real and on-brand.`;
  }
  const pick = hookFor(seed);
  const styles = HOOK_STYLES.filter((s) => !(serious && s.id === "playful"));
  return `THE HOOK — the first 1-2 lines decide if the rest is read, so make the opening impossible to scroll past. ${BAN}
Open with a genuine attention style that fits this piece. A good one to try here: ${pick.name} — ${pick.how}
Other honest styles you may use instead if they fit better: ${styles.filter((s) => s.id !== pick.id).map((s) => s.name).join(", ")}.
Then deliver on it immediately — the hook sets up the value, the next lines pay it off.`;
}

/** Prompt to write several competing hooks for one piece (the crowd picks). */
export function hookVariantsPrompt({ subject, audience, business, serious = false }) {
  const styles = HOOK_STYLES.filter((s) => !(serious && s.id === "playful"));
  return `Write ${styles.length} different opening hooks (first 1-2 lines only) for this, each in a distinct style, each TRUE and each paying off in the piece. No clickbait, no invented facts, no clichés.

SUBJECT: ${subject}
AUDIENCE: ${audience || "the business's customers"}
BUSINESS: ${business || ""}

One hook per style:
${styles.map((s) => `- ${s.name}: ${s.how}`).join("\n")}

Return ONLY: {"hooks":[{"style":"${styles[0].id}","text":"the opening line(s)"}]}`;
}

export function normalizeHooks(json = {}) {
  const list = Array.isArray(json?.hooks) ? json.hooks : [];
  return list.map((h) => ({ style: String(h?.style || "").slice(0, 24), text: String(h?.text || "").trim() }))
    .filter((h) => h.text && h.text.length >= 8).slice(0, HOOK_STYLES.length);
}

/** Businesses where a playful hook is a liability, so humour is dropped. */
export function isSeriousBusiness(ai = {}) {
  const t = [ai.industry, ai.subCategory, ai.whatTheySell, ai.category].filter(Boolean).join(" ").toLowerCase();
  return /health|medical|clinic|therapy|mental|legal|law|lawyer|attorney|funeral|grief|insurance|tax|finance|debt|loan|mortgage|security|safety|emergency/.test(t);
}
