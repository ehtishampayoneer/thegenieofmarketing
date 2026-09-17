// lib/business-brief.js
// ── WHAT GENIE KNOWS ABOUT THE BUSINESS ──
// The onboarding chat used to squeeze everything an owner said into fourteen
// one-sentence fields. An owner could spend twenty minutes explaining their
// packages, who to target and who not to, the decision-makers, the objections
// they hear and how to answer them — and none of it had anywhere to go. So Genie
// kept asking about decision-makers after being told, and every pitch it wrote
// afterwards was built on a homepage summary instead of the owner's strategy.
//
// The brief is the structure a good growth strategist would take away from that
// conversation. It is pure (no I/O) so the same rules decide what is known, what
// is missing and what every prompt downstream gets told, and they can be tested.
//
// Lives on scans.ai.brief. The legacy flat fields (whatTheySell, targetCustomer,
// avoid...) are still filled from it, so older readers keep working and get
// better answers without changing.

// Every section, the order they matter in, and how to ask about a missing one.
// `need` marks the ones a plan cannot be built without; the rest sharpen it.
export const TOPICS = [
  { key: "offer", label: "What you sell", need: true, kind: "text",
    ask: "what a customer actually gets from you, in their words rather than the technology behind it" },
  { key: "segments", label: "Who to target", need: true, kind: "list",
    ask: "the kinds of business or person you most want more of" },
  { key: "idealSignals", label: "Signs of a great fit", need: true, kind: "list",
    ask: "what separates a great prospect from a merely possible one, the signals you would look for" },
  { key: "problems", label: "Problems you solve", need: true, kind: "list",
    ask: "the problem or goal that makes someone actually buy" },
  { key: "cta", label: "What you want them to do", need: true, kind: "text",
    ask: "the one next step you want a good prospect to take" },
  { key: "pricing", label: "Prices and packages", need: false, kind: "text",
    ask: "your packages or prices, and where a new customer usually starts" },
  { key: "decisionMakers", label: "Who decides", need: false, kind: "list",
    ask: "who inside a customer's business makes the buying decision" },
  { key: "objections", label: "Objections", need: false, kind: "pairs",
    ask: "the hesitations you hear most, and how you answer them" },
  { key: "proof", label: "Proof you can use", need: false, kind: "text",
    ask: "any real results, clients or numbers you are allowed to mention, or that there are none yet" },
  { key: "disqualifiers", label: "Who not to target", need: false, kind: "list",
    ask: "who looks like a customer but is not worth chasing" },
  { key: "leadWith", label: "Lead with", need: false, kind: "list",
    ask: "the message that lands best with buyers" },
  { key: "neverSay", label: "Never say", need: false, kind: "list",
    ask: "anything I must never say, claim or promise" },
  { key: "salesMotion", label: "How a sale happens", need: false, kind: "text",
    ask: "how a sale usually goes, from first contact to paying" },
  { key: "channels", label: "Where to find them", need: false, kind: "list",
    ask: "where your best customers can be found" },
  { key: "tone", label: "Tone", need: false, kind: "text",
    ask: "how you want to sound" },
];

const KEYS = new Set(TOPICS.map((t) => t.key));
const MAX_TEXT = 1200;
const MAX_ITEMS = 14;
const MAX_ITEM = 220;

function clip(s, n) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}
const keyOf = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function cleanList(v) {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n|;|•/) : [];
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const s = clip(typeof raw === "string" ? raw : raw?.text || "", MAX_ITEM).replace(/^[-*\d.)\s]+/, "");
    const k = keyOf(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function cleanPairs(v) {
  const arr = Array.isArray(v) ? v : [];
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const objection = clip(typeof raw === "string" ? raw : raw?.objection, MAX_ITEM);
    const answer = clip(typeof raw === "string" ? "" : raw?.answer, 400);
    const k = keyOf(objection);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ objection, answer });
    if (out.length >= 10) break;
  }
  return out;
}

/** A clean brief from anything shaped roughly like one. Unknown keys are dropped. */
export function normalizeBrief(b = {}) {
  const src = b && typeof b === "object" ? b : {};
  const out = {};
  for (const t of TOPICS) {
    const v = src[t.key];
    if (t.kind === "list") { const l = cleanList(v); if (l.length) out[t.key] = l; }
    else if (t.kind === "pairs") { const p = cleanPairs(v); if (p.length) out[t.key] = p; }
    else { const s = clip(v, MAX_TEXT); if (s) out[t.key] = s; }
  }
  return out;
}

/**
 * Apply what the model extracted from one owner message.
 * Text sections are replaced (the owner's latest word wins). Lists and
 * objections are merged, because owners add to them across several messages and
 * a later "also restaurants" must not wipe the furniture retailers. A section the
 * owner explicitly wants rewritten arrives in `replace`.
 */
export function mergeBrief(current = {}, patch = {}, replace = []) {
  const base = normalizeBrief(current);
  const p = normalizeBrief(patch);
  const rep = new Set((Array.isArray(replace) ? replace : []).filter((k) => KEYS.has(k)));
  const next = { ...base };
  const changed = [];
  for (const t of TOPICS) {
    if (!(t.key in p)) continue;
    const before = JSON.stringify(base[t.key] ?? null);
    if (t.kind === "text" || rep.has(t.key)) next[t.key] = p[t.key];
    else if (t.kind === "list") next[t.key] = cleanList([...(base[t.key] || []), ...p[t.key]]);
    else next[t.key] = cleanPairs([...(p[t.key] || []), ...(base[t.key] || [])]);
    if (JSON.stringify(next[t.key]) !== before) changed.push(t.key);
  }
  return { brief: next, changed };
}

/** What is known, what is missing, and how complete the picture is. */
export function coverage(brief = {}, ai = {}) {
  const b = normalizeBrief(brief);
  // The scan already answers some of these; do not ask for what it found.
  const fromScan = {
    offer: ai.whatTheySell,
    segments: ai.targetCustomer,
    cta: ai.conversionGoal,
    proof: ai.proof,
    neverSay: ai.avoid,
    tone: ai.tone,
  };
  const known = [];
  const missing = [];
  for (const t of TOPICS) {
    const v = b[t.key];
    const has = Array.isArray(v) ? v.length > 0 : !!v || !!String(fromScan[t.key] || "").trim();
    (has ? known : missing).push(t);
  }
  const weight = (t) => (t.need ? 2 : 1);
  const total = TOPICS.reduce((n, t) => n + weight(t), 0);
  const got = known.reduce((n, t) => n + weight(t), 0);
  return {
    known: known.map((t) => t.key),
    missing: missing.map((t) => t.key),
    missingNeeded: missing.filter((t) => t.need).map((t) => t.key),
    score: Math.round((got / total) * 100),
    ready: missing.every((t) => !t.need),
  };
}

/** The next topic worth asking about, or null when nothing important is left. */
export function nextTopic(brief = {}, ai = {}, skipped = []) {
  const skip = new Set(skipped);
  const c = coverage(brief, ai);
  const order = [...c.missingNeeded, ...c.missing.filter((k) => !c.missingNeeded.includes(k))];
  const key = order.find((k) => !skip.has(k));
  return key ? TOPICS.find((t) => t.key === key) : null;
}

/**
 * Keep the flat fields in step with the brief, so every older reader
 * (keywords, content, pitch writers) gets the owner's answer rather than the
 * homepage guess. Never blanks a field the brief has nothing for.
 */
export function flattenBrief(ai = {}, brief = {}) {
  const b = normalizeBrief(brief);
  const out = { ...ai, brief: b };
  const join = (l, n = 6) => (Array.isArray(l) ? l.slice(0, n).join("; ") : "");
  if (b.offer) out.whatTheySell = clip(b.offer, 300);
  if (b.segments?.length) out.targetCustomer = join(b.segments);
  if (b.idealSignals?.length) out.idealCustomer = join(b.idealSignals, 5);
  if (b.problems?.length) out.painPoints = join(b.problems, 5);
  if (b.cta) out.conversionGoal = clip(b.cta, 200);
  if (b.proof) out.proof = clip(b.proof, 400);
  if (b.neverSay?.length) out.avoid = join(b.neverSay, 8);
  if (b.leadWith?.length) out.whyChooseYou = join(b.leadWith, 4);
  if (b.tone) out.tone = clip(b.tone, 200);
  return out;
}

/**
 * The brief as prompt text. Every prompt that writes to or about a prospect gets
 * this, so the owner's strategy is followed everywhere instead of only in the
 * chat where they typed it.
 */
export function briefText(ai = {}, { max = 3500 } = {}) {
  const b = normalizeBrief(ai?.brief);
  const lines = [];
  for (const t of TOPICS) {
    const v = b[t.key];
    if (!v || (Array.isArray(v) && !v.length)) continue;
    if (t.kind === "pairs") {
      lines.push(`${t.label}:`);
      for (const o of v) lines.push(`  - "${o.objection}"${o.answer ? ` → ${o.answer}` : ""}`);
    } else if (Array.isArray(v)) {
      lines.push(`${t.label}: ${v.join("; ")}`);
    } else {
      lines.push(`${t.label}: ${v}`);
    }
  }
  const text = lines.join("\n");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A labelled block for a prompt, or "" when the owner has not told Genie anything. */
export function briefBlock(ai = {}, opts) {
  const t = briefText(ai, opts);
  return t
    ? `\nWHAT THE OWNER TOLD GENIE — their own strategy. Follow it exactly, it overrides anything guessed from the website:\n${t}\n`
    : "";
}
