// lib/swarm/sim.js
// ── THE CROWD, ARGUING ──
// 1,000 individual people reacting to one draft and to each other, in plain code.
// No AI call happens here. The AI (lib/swarm/judge.js) has already said how each
// KIND of person reacts, as a spread of likely reactions; this file turns that
// into a crowd of individuals with their own trust, stubbornness and reach,
// places them in a social network, and lets opinions and objections travel for a
// number of rounds, the way a comment section does.
//
// Why this shape: asking an AI separately for every person in every round is what
// makes tools like MiroFish cost ~$5 a run. Research on large simulations
// (TopoSim, 2026) shows people in similar roles can share one "brain" with 50-90%
// fewer tokens and the same or better fidelity. The crowd dynamics themselves
// (who influences whom, how an objection snowballs) are classic opinion-dynamics
// maths and cost nothing to run, so they run for as many rounds as we like.
//
// Deterministic for a given seed, so a result can be reproduced and tested.

export const CROWD_SIZE = 1000;
const ROUNDS = 12;

// ── Seeded randomness ────────────────────────────────────────────────────────
export function seedFrom(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) { h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function sampleDist(dist, r) {
  let x = r(), acc = 0;
  for (let i = 0; i < 5; i++) { acc += dist[i]; if (x <= acc) return i + 1; }
  return 5;
}

/** Make any five numbers into a proper spread of reactions (sums to 1). */
export function normDist(d) {
  const v = Array.from({ length: 5 }, (_, i) => Math.max(0, Number(d?.[i]) || 0));
  const s = v.reduce((a, b) => a + b, 0);
  return s > 0 ? v.map((x) => x / s) : [0.2, 0.2, 0.2, 0.2, 0.2];
}

// ── The crowd ────────────────────────────────────────────────────────────────
/**
 * Build the individuals. Each person belongs to one archetype (in proportion to
 * its weight) and gets their own traits. Gatekeepers (a moderator, an editor, a
 * spam filter) are few in number but decide whether the thing is seen at all.
 */
export function buildCrowd(archetypes, { size = CROWD_SIZE, seed = 1 } = {}) {
  const r = rng(seed);
  const list = archetypes.filter(Boolean);
  const total = list.reduce((s, a) => s + Math.max(0.1, Number(a.weight) || 1), 0);
  const people = [];
  for (const a of list) {
    const n = Math.max(a.gate ? 3 : 1, Math.round((Math.max(0.1, Number(a.weight) || 1) / total) * size));
    for (let i = 0; i < n && people.length < size; i++) {
      people.push({
        a: a.id,
        gate: !!a.gate,
        trust: clamp(0.5 + (r() - 0.5) * 0.8 - (Number(a.skeptic) || 0.3) * 0.4, 0.02, 0.98),
        stubborn: clamp(0.2 + r() * 0.6 + (a.gate ? 0.2 : 0), 0, 0.95),
        // A few people are heard by many; most by few (a power law, like real feeds).
        reach: Math.pow(r(), 3),
      });
    }
  }
  while (people.length < size && list.length) {
    const a = list[Math.floor(r() * list.length)];
    people.push({ a: a.id, gate: !!a.gate, trust: 0.5, stubborn: 0.5, reach: Math.pow(r(), 3) });
  }
  return people.slice(0, size);
}

/** A small-world network: mostly local circles, with a few long-range links. */
export function network(n, { k = 6, rewire = 0.1, seed = 2 } = {}) {
  const r = rng(seed);
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) {
    for (let j = 1; j <= k / 2; j++) {
      let t = (i + j) % n;
      if (r() < rewire) t = Math.floor(r() * n);
      if (t !== i) { adj[i].add(t); adj[t].add(i); }
    }
  }
  return adj.map((s) => [...s]);
}

// ── The run ──────────────────────────────────────────────────────────────────
/**
 * Run the crowd. `reactions` maps archetype id -> { dist:[5], objections:[tags] }.
 * Returns what happened, in numbers a person can read.
 */
export function simulate(archetypes, reactions, { size = CROWD_SIZE, seed = 1, rounds = ROUNDS } = {}) {
  const r = rng(seed ^ 0x9e3779b9);
  const people = buildCrowd(archetypes, { size, seed });
  const adj = network(people.length, { seed: seed + 7 });

  // Opening reaction, 1 (hostile) .. 5 (would act or share), with a personal nudge:
  // low-trust people read everything a little worse.
  const op = people.map((p) => {
    const re = reactions[p.a];
    const base = sampleDist(normDist(re?.dist), r);
    return clamp(base + (r() - 0.5) * 0.8 - (0.5 - p.trust) * 0.9, 1, 5);
  });
  const objection = people.map((p, i) => {
    const re = reactions[p.a];
    const list = Array.isArray(re?.objections) ? re.objections : [];
    return op[i] < 3 && list.length ? list[Math.floor(r() * list.length)] : null;
  });

  const series = [share(op)];
  for (let round = 0; round < rounds; round++) {
    const next = op.slice();
    for (let i = 0; i < people.length; i++) {
      const nb = adj[i];
      if (!nb.length) continue;
      // Hear from one neighbour this round, likelier the louder they are.
      const j = nb[Math.floor(r() * nb.length)];
      if (r() > 0.25 + people[j].reach * 0.75) continue;
      const diff = op[j] - op[i];
      // Bounded confidence: people only move toward views not too far from theirs.
      if (Math.abs(diff) > 2.2) continue;
      // Complaints travel further than praise, as they do online.
      const pull = (diff < 0 ? 0.32 : 0.22) * (1 - people[i].stubborn);
      next[i] = clamp(op[i] + diff * pull, 1, 5);
      if (diff < 0 && objection[j] && !objection[i] && r() < 0.35) objection[i] = objection[j];
    }
    for (let i = 0; i < op.length; i++) op[i] = next[i];
    series.push(share(op));
  }

  // ── What it adds up to ──
  const n = op.length;
  const positive = op.filter((x) => x >= 3.5).length / n;
  const negative = op.filter((x) => x < 2.5).length / n;
  const act = op.filter((x) => x >= 4.2).length / n;
  const backlash = Math.max(0, series[series.length - 1].neg - series[0].neg);

  const counts = {};
  for (let i = 0; i < n; i++) if (objection[i] && op[i] < 3) counts[objection[i]] = (counts[objection[i]] || 0) + 1;
  const objections = Object.entries(counts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 6);

  // Gatekeepers: if the people who decide whether it is seen at all mostly say no,
  // nothing else matters.
  const gates = {};
  people.forEach((p, i) => { if (p.gate) (gates[p.a] ||= []).push(op[i]); });
  const gate = Object.entries(gates).map(([id, xs]) => ({ id, mean: avg(xs) })).sort((a, b) => a.mean - b.mean)[0] || null;
  const blocked = !!gate && gate.mean < 2.6;

  const mean = avg(op);
  const score = Math.round(clamp(((mean - 1) / 4) * 70 + act * 30 - backlash * 40 - (blocked ? 25 : 0), 0, 100));

  return {
    size: n, score, mean: round2(mean),
    positive: round2(positive), negative: round2(negative), act: round2(act), backlash: round2(backlash),
    objections, gate: gate ? { id: gate.id, mean: round2(gate.mean), blocked } : null,
    series: series.map((s) => [round2(s.pos), round2(s.neg)]),
  };
}

function share(op) {
  const n = op.length || 1;
  return { pos: op.filter((x) => x >= 3.5).length / n, neg: op.filter((x) => x < 2.5).length / n };
}
function avg(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round2(x) { return Math.round(x * 100) / 100; }
