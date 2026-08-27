// lib/paa.js
// ── PEOPLE ALSO ASK (free) ──
// Real questions people type into Google about a topic, harvested from Google's
// public Autocomplete endpoint by probing it with question-word prefixes. This is
// the AnswerThePublic play without the paywall: we feed these verbatim questions
// into the article's FAQ, which gets FAQPage schema on publish — and FAQs are what
// AI answer engines cite most. Best-effort and cached (autocompleteSuggestions caches
// 6h); if Google throttles the server, we simply return fewer questions.

import { autocompleteSuggestions } from "@/lib/autocomplete";

const QWORDS = ["how", "what", "why", "when", "where", "which", "who", "can", "does", "do", "is", "are", "should", "will"];
// Words that describe the *shape* of a search, not its subject — dropped so the
// on-topic check keys on the real subject nouns.
const NOISE = new Set(["best", "cheap", "cheapest", "near", "online", "guide", "tips", "review", "reviews", "vs", "top", "with", "your", "from", "that", "this", "for", "and", "the"]);

function coreTokens(seed) {
  return String(seed || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !NOISE.has(w));
}

// Return up to `limit` real, distinct, on-topic questions (each Capitalised + "?").
export async function peopleAlsoAsk(seed, { limit = 6 } = {}) {
  const s = String(seed || "").trim().toLowerCase();
  if (!s) return [];
  const core = coreTokens(s);

  // The probe shapes most likely to surface genuine questions from Autocomplete.
  const probes = [`how to ${s}`, `what is ${s}`, `why ${s}`, `is ${s}`, `does ${s}`, `how does ${s}`, `can ${s}`, s];

  const probeSet = new Set(probes.map((p) => p.toLowerCase().replace(/\s+/g, " ")));
  const seen = new Set();
  const questions = [];
  const results = await Promise.all(probes.map((p) => autocompleteSuggestions(p).catch(() => [])));

  // Round-robin across the probe shapes so the mix is varied (what / why / does / can),
  // not eight flavours of "how to". Drop the bare probe echo ("how to {seed}"), which
  // is grammatically broken, and anything that isn't a real on-topic question.
  const maxLen = Math.max(0, ...results.map((a) => a.length));
  for (let i = 0; i < maxLen && questions.length < limit; i++) {
    for (const arr of results) {
      const raw = arr[i];
      if (!raw) continue;
      const q = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
      if (!q || seen.has(q)) continue;
      seen.add(q);
      if (probeSet.has(q)) continue; // echoed probe — skip
      const startsQ = QWORDS.some((w) => q.startsWith(w + " "));
      const onTopic = core.length === 0 || core.some((t) => q.includes(t));
      if (!startsQ || !onTopic) continue;
      questions.push(q.charAt(0).toUpperCase() + q.slice(1) + (q.endsWith("?") ? "" : "?"));
      if (questions.length >= limit) break;
    }
  }
  return questions;
}
