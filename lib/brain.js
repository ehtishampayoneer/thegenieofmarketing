// lib/brain.js
// ── THE ONE BRAIN EVERY ENGINE WORKS FROM ──
//
// lib/strategy.js holds the decision. This is how the rest of the product READS
// it, in one call, with everything a writing engine needs attached: the plan,
// the countries worth winning, the keyword it is writing for, and the name of
// the business. One import, one await, one string to paste into a prompt.
//
// WHY THIS EXISTS. The strategy layer was wired into eight engines. Fifteen more
// kept their own private read of the business: three radars pasted the owner's
// raw prose and re-decided what the business was, and nine — the pillar builder,
// the page refresher, the per-platform spreader, the reply drafter, the AI-search
// radar, the listing writer, the sharpener, the niche suggester and Market
// Testing itself — wrote customer-facing text with no business context at all
// beyond a scan field or two. Each was reasonable alone. Together they were
// fifteen separate programs sharing a logo.
//
// The failure that follows is not a crash, which is why it survived: the article
// argues one thing, the Reddit reply argues another, the pitch a third, and every
// one of them reads fine on its own.
//
// So: engines do not read the strategy, the brief, or the scan directly any more.
// They read the brain. When the strategy is not ready yet the brain falls back to
// the owner's brief, exactly as those engines did before, so wiring one up can
// never make it worse than it was.
//
// It never throws and never blocks. An engine that cannot reach the brain still
// runs — with the floor, not with a guess.

import { strategyBlock, strategyReady, normalizeStrategy } from "@/lib/strategy";
import { getStrategy, saveStrategy, marketsFor } from "@/lib/strategy-store";
import { briefBlock } from "@/lib/business-brief";
import { selectTargets } from "@/lib/keyword-usage";

// Market Testing keeps ranking countries as Search Console data grows. A plan
// that took its countries once, months ago, is working from a smaller sample
// than the product already has. Refresh them when they are older than this.
const MARKETS_STALE_DAYS = 14;

/**
 * The business's name, from the scan, falling back to the host. Every engine
 * needed this and several derived it differently.
 */
export function businessNameFrom(ai = {}, host = "") {
  const n = String(ai?.businessName || "").trim();
  if (n) return n;
  return String(host || "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\..*$/, "") || "the business";
}

/**
 * The prompt text an engine pastes in. Pure, so a test can assert what a given
 * plan produces without a database.
 *
 * Order matters: the plan first (it overrides everything), then the specific job
 * this piece is doing, so the model reads the constraint before the task.
 */
export function brainBlock({ strategy = null, ai = null, targets = null } = {}) {
  const parts = [];

  const s = strategy ? normalizeStrategy(strategy) : null;
  if (s && strategyReady(s)) parts.push(strategyBlock(s));
  else if (ai) parts.push(briefBlock(ai)); // the floor, never a guess

  if (targets?.primary) {
    const related = Array.isArray(targets.related) ? targets.related.filter(Boolean) : [];
    const lines = [
      `\nWHAT THIS PIECE IS FOR — the keyword strategy picked this, so write for it and not around it.`,
      `Target: "${targets.primary}".`,
    ];
    if (related.length) lines.push(`Related terms in the same cluster, use where they fit naturally: ${related.join(", ")}.`);
    if (targets.aeo) {
      lines.push(
        `This one is for AI search: answer the question directly in the first two sentences, use the question itself as a heading, and keep every claim checkable.`
      );
    }
    parts.push(`${lines.join("\n")}\n`);
  }

  return parts.join("");
}

/**
 * Everything one engine needs to write as part of the same business.
 *
 * @param {object}  supabase            owner-scoped or admin client
 * @param {string}  opts.userId
 * @param {string}  opts.host
 * @param {object}  [opts.ai]           the scan's read, when the caller already has it
 * @param {boolean} [opts.draft=false]  may spend an AI call to draft a missing plan
 * @param {number}  [opts.targets=0]    ask the keyword strategy what to write for
 * @returns {Promise<{ready, strategy, ai, host, businessName, markets, targets, block}>}
 */
export async function genieBrain(supabase, { userId, host = null, ai = null, draft = false, targets = 0 } = {}) {
  const base = {
    ready: false, strategy: null, ai: ai || null, host,
    businessName: businessNameFrom(ai || {}, host),
    markets: [], targets: null, block: "",
  };
  if (!supabase || !userId) return base;

  // The scan, when the caller did not already have it. Engines used to each do
  // this query their own way; several forgot the host filter and read whichever
  // site the owner scanned last.
  let scanAi = ai;
  if (!scanAi) {
    try {
      let q = supabase.from("scans").select("ai").eq("user_id", userId);
      if (host) q = q.or(`final_url.ilike.%${host}%,url.ilike.%${host}%`);
      const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      scanAi = data?.ai || null;
    } catch {}
  }

  let strategy = null;
  try { strategy = await getStrategy(supabase, { userId, host, ai: scanAi, draft }); } catch {}

  // Keep the countries current. getStrategy only ever fills an EMPTY list, so a
  // plan saved before Search Console had data kept those first countries for
  // good. Owner-set countries are never touched.
  // Countries the owner chose are theirs: only Genie's own are refreshed.
  if (strategy && strategy.source !== "owner") {
    const checked = Date.parse(strategy.marketsAt || 0);
    if (!checked || Date.now() - checked > MARKETS_STALE_DAYS * 864e5) {
      try {
        const fresh = await marketsFor(supabase, { userId, host, ai: scanAi });
        // Record the check either way, so an unchanged answer is not re-asked of
        // Search Console by the next engine tonight and every night after.
        strategy = normalizeStrategy({
          ...strategy,
          markets: fresh.length ? fresh : strategy.markets,
          marketsAt: new Date().toISOString(),
        });
        await saveStrategy(supabase, userId, host, strategy, "genie");
      } catch {}
    }
  }

  // selectTargets names the chosen term `keyword`; the brain exposes it as
  // `primary` so an engine reads one shape whatever picked it.
  let picked = null;
  if (targets > 0) {
    try {
      const t = await selectTargets(supabase, userId, host, { count: targets });
      const first = Array.isArray(t) ? t[0] : t;
      const primary = first?.primary || first?.keyword;
      if (primary) {
        picked = {
          primary,
          related: Array.isArray(first.related) ? first.related : [],
          aeo: !!first.aeo,
          stage: first.stage || null,
          intent: first.intent || null,
        };
      }
    } catch {}
  }

  const norm = strategy ? normalizeStrategy(strategy) : null;
  return {
    ready: !!(norm && strategyReady(norm)),
    strategy: norm,
    ai: scanAi,
    host,
    businessName: businessNameFrom(scanAi || {}, host),
    markets: norm?.markets || [],
    targets: picked,
    block: brainBlock({ strategy: norm, ai: scanAi, targets: picked }),
  };
}

/**
 * The block alone, for the many engines that only need the prompt text. Same
 * shape as strategyPromptBlock(), so converting a caller is a one-line change.
 */
export async function brainPromptBlock(supabase, opts = {}) {
  const b = await genieBrain(supabase, opts);
  return b.block;
}
