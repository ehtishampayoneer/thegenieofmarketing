// lib/news-signals.js
// ── TIMING, WHICH IS THE ONE THING NO LIST CAN GIVE YOU ──
//
// Genie is good at finding the right companies and has no idea which of them is
// about to spend money. A furniture chain that opened ten stores last week and one
// that has done nothing for three years look identical in every list, and they are
// not the same prospect at all. News is the difference: funding, an expansion, a
// new country, a new managing director. Somebody who has just raised money or just
// opened is buying now.
//
// It is also the strongest opening line in cold email, and the hardest to fake.
// "Saw you opened in Hamburg last month" cannot be written by anyone who did not
// look, and the reader knows that.
//
// HOW IT IS USED. Not as a source of companies — the noise is enormous and the
// filtering would cost more than it returns. It runs on companies Genie has ALREADY
// chosen, a handful a night, and only to find whether there is something true and
// recent worth mentioning in the first line.
//
// WHETHER IT WORKS AT ALL IS A HOST QUESTION. GDELT is free and needs no key, and
// it refuses requests from shared cloud addresses: three attempts from this
// project's own machine, thirteen seconds apart, were all rejected with 429. This
// codebase has met that before — unauthenticated Reddit is blocked from Vercel for
// the same reason. So everything here is written to return nothing quietly, the
// self-test has a row that says plainly whether the deployed app can reach it, and
// no engine depends on the answer.

import { logger } from "@/lib/log";

const API = "https://api.gdeltproject.org/api/v2/doc/doc";
const TIMEOUT_MS = 9000;

// Their documented floor is one request every five seconds. This is a nightly job
// asking about a handful of companies, so the gap is kept comfortably wider.
const GAP_MS = 6000;
let lastCall = 0;

// The same company is asked about every night until it replies. One cache spares
// them the request and makes a re-run instant.
const CACHE = new Map();
const CACHE_MS = 12 * 3600 * 1000;

// What "they are spending money right now" looks like in a headline. Deliberately
// about events rather than sentiment: an opening is a fact, a mood is not.
const SIGNALS = [
  { id: "funding", words: /\b(raises?|raised|funding|seed round|series [a-d]\b|investment|backed by)\b/i, why: "just raised money" },
  { id: "expansion", words: /\b(opens?|opened|opening|new (store|branch|showroom|location|warehouse)|expands?|expansion|launches? in)\b/i, why: "is opening somewhere new" },
  { id: "leadership", words: /\b(appoints?|appointed|names? new|new (ceo|managing director|cmo|head of)|joins as)\b/i, why: "has someone new in charge" },
  { id: "launch", words: /\b(launch(es|ed)?|unveils?|introduces?|rebrand(s|ed|ing)?)\b/i, why: "has just launched something" },
  { id: "growth", words: /\b(record (sales|year|quarter)|growth of|profits? (up|rise|jump)|acquires?|acquisition)\b/i, why: "is growing" },
];

function classify(title) {
  for (const s of SIGNALS) if (s.words.test(title)) return s;
  return null;
}

async function paced(url) {
  const wait = GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const res = await fetch(url, {
    headers: { "User-Agent": "MarketingGenie/1.0 (+https://thegenieofmarketing.vercel.app)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  // A refusal comes back as prose with a 429, and sometimes as prose with a 200.
  // Either way it is not JSON, so parsing is the honest test of whether this
  // worked rather than trusting the status line.
  if (!res.ok || !text.trim().startsWith("{")) {
    const err = new Error(res.status === 429 || /limit requests/i.test(text) ? "gdelt_rate_limited" : `gdelt_${res.status}`);
    err.blocked = true;
    throw err;
  }
  return JSON.parse(text);
}

/**
 * Is there something recent and true worth mentioning to this company?
 *
 * @param company  the company's name, as it would appear in a headline
 * @param days     how far back to look. Beyond a couple of months it stops being
 *                 an opener and starts sounding like homework.
 * @returns {{ headline, url, when, signal, why }|null} — null far more often than
 *          not, which is fine: an email with no opener is the normal case.
 */
export async function recentSignal(company, { days = 45 } = {}) {
  const name = String(company || "").trim();
  if (name.length < 3) return null;

  const key = name.toLowerCase();
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;

  const remember = (v) => { CACHE.set(key, { at: Date.now(), v }); if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value); return v; };

  let arts = [];
  try {
    const url = `${API}?query=${encodeURIComponent(`"${name}"`)}&mode=artlist&maxrecords=20&format=json&timespan=${Math.max(1, Math.min(90, days))}d&sort=datedesc`;
    const j = await paced(url);
    arts = Array.isArray(j?.articles) ? j.articles : [];
  } catch (e) {
    if (e?.blocked) logger.warn("news.unreachable", { error: String(e.message) });
    return remember(null);
  }

  for (const a of arts) {
    const title = String(a?.title || "").trim();
    // The company has to actually be named in the headline. A story that merely
    // mentions them in the body produces an opener that reads as a non-sequitur.
    if (!title || !title.toLowerCase().includes(name.toLowerCase())) continue;
    const signal = classify(title);
    if (!signal) continue;
    return remember({
      headline: title.slice(0, 200),
      url: a?.url || null,
      when: a?.seendate || null,
      signal: signal.id,
      why: signal.why,
    });
  }
  return remember(null);
}

/**
 * The instruction that goes into the email prompt. Empty when there is nothing,
 * which is most of the time — and an invented opener is worse than none.
 */
export function signalNote(sig) {
  if (!sig?.headline) return "";
  return `RECENT NEWS about this company, published in the last few weeks: "${sig.headline}". They ${sig.why}. Open by referring to this naturally, in your own words, as something you noticed — never quote the headline back at them and never say you read the news. If it does not connect honestly to what you are offering, ignore it entirely and open normally.`;
}

/** Can this deployment reach GDELT at all? Used by the self-test, not by engines. */
export async function newsReachable() {
  try {
    await paced(`${API}?query=%22IKEA%22&mode=artlist&maxrecords=1&format=json&timespan=7d`);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
}
