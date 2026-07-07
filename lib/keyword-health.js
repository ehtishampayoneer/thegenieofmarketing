// lib/keyword-health.js
// The living keyword portfolio brain. Genie doesn't pick keywords once — he
// manages them: grades each on potential vs. competition vs. real performance,
// keeps winners, retires losers, and keeps the roster fresh so only strong
// keywords get pushed into blogs / Reddit / Quora over time.
//
// Health tiers:
//   strong   — high potential, ranking or coverage paying off → push hard
//   growing  — decent potential, gaining coverage → keep feeding
//   new      — just added, unproven → give it a chance
//   weak     — low potential OR lots of coverage with no traction → deprioritize
//   retired  — proven loser → stop using (kept for history)

// Compute a 0-100 opportunity score. Higher = better keyword to invest in.
// Blends Genie's estimates (potential, competition) with REAL signals
// (GSC clicks/impressions) once they exist — real data dominates when present.
export function scoreKeyword(k) {
  const potential = clamp(k.traffic_potential ?? 50);
  const competition = clamp(k.competition ?? 50);
  const estBase = potential * 0.7 + (100 - competition) * 0.3; // easy + high-traffic = best

  const hasReal = (k.gsc_impressions || 0) > 0;
  if (!hasReal) return Math.round(estBase);

  // Real performance: impressions show reach, clicks show conversion of interest.
  const imprScore = clamp(Math.log10((k.gsc_impressions || 0) + 1) * 25); // ~log scale
  const ctr = k.gsc_impressions ? (k.gsc_clicks || 0) / k.gsc_impressions : 0;
  const ctrScore = clamp(ctr * 400); // 25% CTR → maxed
  const realScore = imprScore * 0.6 + ctrScore * 0.4;

  // Once real data exists, weight it 65% over the estimate.
  return Math.round(estBase * 0.35 + realScore * 0.65);
}

export function gradeKeyword(k) {
  const score = scoreKeyword(k);
  const coverage = k.coverage || 0;
  const hasReal = (k.gsc_impressions || 0) > 0;

  // Proven loser: lots of coverage, real data, still nothing.
  if (hasReal && coverage >= 4 && (k.gsc_clicks || 0) === 0 && score < 35) return "retired";
  // Weak: low score, or heavily covered with no payoff.
  if (score < 40 || (coverage >= 6 && score < 55)) return "weak";
  // Strong: high score (real or estimated).
  if (score >= 68) return "strong";
  // Growing: middling but moving.
  if (score >= 40) return "growing";
  return "new";
}

// Grade the whole portfolio and return summary + per-keyword grades.
export function gradePortfolio(keywords) {
  const graded = keywords.map((k) => {
    const score = scoreKeyword(k);
    const health = gradeKeyword(k);
    return { ...k, score, health };
  });

  const counts = graded.reduce((acc, k) => { acc[k.health] = (acc[k.health] || 0) + 1; return acc; }, {});
  const active = graded.filter((k) => k.health !== "retired");
  const avg = active.length ? Math.round(active.reduce((s, k) => s + k.score, 0) / active.length) : 0;

  // How many fresh keywords Genie should add to keep the roster healthy.
  const strongCount = counts.strong || 0;
  const needsFresh = strongCount < 8; // always want a bench of strong performers

  return {
    graded: graded.sort((a, b) => b.score - a.score),
    counts,
    portfolioScore: avg,
    needsFresh,
    retiredCount: counts.retired || 0,
  };
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}
