// lib/keyword-plan.js
// ── THE KEYWORD CAMPAIGN BRAIN ──
// Turns a flat keyword list into a ranking CAMPAIGN: each keyword gets a difficulty
// tier, a target position + realistic deadline, a live status vs that target (from
// real Search Console history), and the next move Genie should make for it. This is
// what makes Genie plan per-scenario each day — quick wins for fast traffic now, and
// hard keywords worked on a 1–2 month clock so they eventually get their spot too —
// instead of running the same way regardless of where each keyword actually stands.
//
// Pure + deterministic (no I/O), so it's testable and cheap to run every night.

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

// Easy / Medium / Hard from the best signals available. Real volume + competition
// when present; otherwise a heuristic (long-tail is easier, head terms harder).
export function difficultyTier(k = {}) {
  const comp = num(k.competition, 50);                 // 0..100 (higher = harder)
  const vol = num(k.volume, num(k.traffic_potential, 40));
  const words = String(k.keyword || "").trim().split(/\s+/).filter(Boolean).length;

  let score = comp;                                    // start from competition
  if (words >= 4) score -= 18;                         // long-tail ranks far easier
  else if (words <= 2) score += 10;                    // head terms are brutal
  if (vol >= 70) score += 8;                           // high demand draws strong rivals
  else if (vol <= 20) score -= 6;

  if (score <= 34) return "easy";
  if (score <= 64) return "medium";
  return "hard";
}

// Target position + realistic days-to-target per tier. Honest timelines: Google is
// slow, and a new/low-authority site is slower — these are goals, not guarantees.
export const TIER_TARGET = {
  easy:   { position: 10, days: 30, label: "Quick win" },
  medium: { position: 10, days: 60, label: "1–2 months" },
  hard:   { position: 20, days: 90, label: "2–3 months" },
};
export function targetFor(k) { return TIER_TARGET[difficultyTier(k)] || TIER_TARGET.medium; }

// Where a keyword stands vs its target, from its real rank history (oldest→newest
// [{date, position, clicks}]). Positions: lower is better; null = not ranking yet.
export function campaignStatus(k = {}, history = []) {
  const tier = difficultyTier(k);
  const target = TIER_TARGET[tier];
  const pts = (history || []).filter((h) => h && h.position != null).map((h) => Number(h.position));
  const current = pts.length ? pts[pts.length - 1] : null;
  const first = pts.length ? pts[0] : null;
  const trend = (first != null && current != null) ? Math.round((first - current) * 10) / 10 : 0; // + = climbed
  const covered = num(k.coverage, 0);

  let state;
  if (current != null && current <= target.position) state = "achieved";     // on page 1 (or 1–2 for hard)
  else if (current == null && covered === 0) state = "not_started";           // no content yet
  else if (current == null) state = "indexing";                              // published, no rank data yet
  else if (trend >= 3) state = "climbing";                                   // meaningfully moving up (3+ spots)
  else if (covered >= 3) state = "stalled";                                  // real effort, barely moving → needs authority
  else state = "working";                                                    // early, give it content + time

  return { tier, target, current, first, trend, state, covered };
}

// The next move for a keyword, given its status. This is the escalation ladder:
// write → let it index → support it → if stalled, escalate to authority-building
// (cluster + internal links + get listed on the pages Google/AI already trust) →
// defend once won.
export function nextMove(status = {}) {
  switch (status.state) {
    case "not_started": return { action: "write", effort: "start", why: "No content yet — publish the answer page that targets this." };
    case "indexing":    return { action: "wait", effort: "none", why: "Published. Waiting for Google to index and place it (usually days to weeks)." };
    case "working":     return { action: "support", effort: "add", why: "Early days. Add a supporting piece and internal links to build topical strength." };
    case "climbing":    return { action: "maintain", effort: "keep", why: `Climbing (+${status.trend} spots). Keep internal links flowing; don't touch what's working.` };
    case "stalled":     return { action: "escalate", effort: "authority", why: "Stuck despite content — this needs authority: a cluster of supporting posts, more internal links, and getting listed on the buying-guides/review pages Google and AI already trust." };
    case "achieved":    return { action: "defend", effort: "refresh", why: `Won — position ${current(status)}. Refresh it periodically and watch for slippage.` };
    default:            return { action: "support", effort: "add", why: "Keep feeding it content and links." };
  }
}
function current(s) { return s.current != null ? Math.round(s.current) : "?"; }

// Plan the whole portfolio: per-keyword campaign + today's focus, ordered so quick
// wins and stalled-needing-escalation rise, and hard keywords aren't starved.
export function planPortfolio(keywords = [], historyBySeries = {}) {
  const plan = keywords.map((k) => {
    const status = campaignStatus(k, historyBySeries[k.keyword] || []);
    return { keyword: k.keyword, tier: status.tier, target: status.target, status, move: nextMove(status) };
  });

  const rank = { escalate: 0, write: 1, support: 2, maintain: 3, wait: 4, defend: 5 };
  const tierRank = { easy: 0, medium: 1, hard: 2 };
  const todayFocus = [...plan].sort((a, b) => {
    const ma = rank[a.move.action] ?? 9, mb = rank[b.move.action] ?? 9;
    if (ma !== mb) return ma - mb;                                  // escalate + write first
    return (tierRank[a.tier] ?? 1) - (tierRank[b.tier] ?? 1);       // then easiest first (fast traffic)
  });

  const counts = plan.reduce((a, p) => { a[p.status.state] = (a[p.status.state] || 0) + 1; return a; }, {});
  const tiers = plan.reduce((a, p) => { a[p.tier] = (a[p.tier] || 0) + 1; return a; }, {});
  return { plan, todayFocus, counts, tiers };
}
