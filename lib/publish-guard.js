// lib/publish-guard.js
// ── THE PUBLISH GATE ──
// One function every publish/execute path calls before content leaves the system.
// Combines platform policy + brand safety + claim/fact-checking into a single
// CONFIDENCE (0-100) and a decision: publish | review | block. Fails safe.
//   deep=true → runs the AI fact-check (for high-stakes owned auto-publish)

import { checkPolicy } from "@/lib/platform-policy";
import { verifyClaims, scanClaims } from "@/lib/factcheck";
import { swallow } from "@/lib/log";

// ── SCALED-CONTENT GUARD ──
// Google's spam policy targets "scaled content abuse": mass-produced pages made
// mainly to rank rather than to help. A product whose core loop is "publish an
// article every day, forever" is precisely that shape, so the protection has to be
// designed in — if a client's site gets deindexed, Genie actively harmed the person
// paying for it. Two objective checks, no AI needed: is this piece substantial, and
// is it meaningfully different from what we already published for them?
const MIN_WORDS = 300;
const NEAR_DUPLICATE = 0.5; // Jaccard over 3-word shingles

export async function checkScaledContent(supabase, { userId, host, title, body } = {}) {
  const text = String(body || "");
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out = { thin: false, duplicateOf: null, similarity: 0, words: words.length };

  if (words.length < MIN_WORDS) out.thin = true;
  if (!supabase || !userId) return out;

  try {
    const { data: prior } = await supabase
      .from("actions").select("title, payload")
      .eq("user_id", userId).eq("type", "article")
      .order("created_at", { ascending: false }).limit(25);

    const mine = shingles(text);
    if (mine.size === 0) return out;
    for (const a of prior || []) {
      const otherBody = a?.payload?.body;
      if (!otherBody) continue;
      const otherTitle = a?.payload?.title || a?.title || "";
      if (otherTitle && title && otherTitle === title) { out.duplicateOf = otherTitle; out.similarity = 1; return out; }
      const sim = jaccard(mine, shingles(String(otherBody)));
      if (sim > out.similarity) { out.similarity = sim; if (sim >= NEAR_DUPLICATE) out.duplicateOf = otherTitle || "an earlier article"; }
    }
  } catch (e) {
    swallow("publishGuard.scaledContent", e, { userId, host });
  }
  return out;
}

function shingles(s, n = 3) {
  const w = String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(" "));
  return set;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// Brand safety — never publish these under a user's name.
// Match the stem + any suffix so inflected forms ("fucking", "shitty") are caught.
const TOXIC = [/\b(fuck|shit|bitch|asshole|bastard|cunt)\w*/i, /\b(nazi|racist|slur)\w*/i, /\b(kill|murder) (yourself|them)\b/i];

export async function guardContent(supabase, { userId, host, channel, content, entity, title, deep = false } = {}) {
  const text = String(content || "");
  const flags = [];
  const reasons = [];

  const policy = checkPolicy(channel, text);
  if (policy.flags.length) { flags.push(...policy.flags); if (policy.note) reasons.push(policy.note); }

  // Long-form on the client's OWN site is what Google's scaled-content policy
  // judges, so gate it here. Social/replies are short by nature and exempt.
  let scaled = null;
  if (["blog", "article", "answer", "website", "wordpress"].includes(channel)) {
    scaled = await checkScaledContent(supabase, { userId, host, title, body: text });
    if (scaled.thin) { flags.push("thin_content"); reasons.push(`Only ${scaled.words} words — too thin to be genuinely useful, and the kind of page Google treats as scaled content.`); }
    if (scaled.duplicateOf) { flags.push("near_duplicate"); reasons.push(`Too similar (${Math.round(scaled.similarity * 100)}%) to “${scaled.duplicateOf}”. Publishing near-copies is what gets a site penalised.`); }
  }

  let toxic = false;
  for (const re of TOXIC) if (re.test(text)) { toxic = true; break; }
  if (toxic) { flags.push("toxic_language"); reasons.push("Contains language that could damage the brand."); }

  const claim = deep
    ? await verifyClaims(text, { entity, ctx: { supabase, userId, host } })
    : (() => { const h = scanClaims(text); return { confidence: h.length ? 70 : 92, risky: h.map((x) => ({ claim: x, severity: "medium" })), safe: h.length === 0 }; })();
  if (claim.risky?.length) reasons.push(`${claim.risky.length} claim(s) need verification.`);

  let confidence = 100;
  confidence -= policy.risk * 0.4;
  if (toxic) confidence -= 70;
  if (scaled?.thin) confidence -= 25;
  if (scaled?.duplicateOf) confidence -= 40;
  confidence = Math.min(confidence, claim.confidence ?? 100);
  confidence = Math.max(0, Math.round(confidence));

  const highRiskClaim = (claim.risky || []).some((r) => r.severity === "high");
  // A near-duplicate is never auto-published: that's the exact pattern that gets a
  // client's whole site penalised, and it's not something to risk on a confidence score.
  const decision = (toxic || highRiskClaim || scaled?.duplicateOf) ? "block" : confidence < 80 ? "review" : "publish";

  return { confidence, decision, flags, reasons, claims: claim.risky || [], scaled };
}
