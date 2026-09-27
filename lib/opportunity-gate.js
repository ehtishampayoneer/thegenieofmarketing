// lib/opportunity-gate.js
// ── IS THIS A REAL, OPEN, CURRENT BUYER — OR JUST A PAGE THAT MENTIONS THE TOPIC? ──
//
// Reported by the owner from Buyer Hunt, 27 Sep: nine-year-old Reddit threads, and
// "buyers" who were mostly developers selling their own thing.
//
// WHY THE OLD POSTS. Every Reddit path set createdUtc to 0 — including the RSS
// feed, which carries each post's date and was simply never read — so Genie had
// never known how old a single Reddit thread was. Age was used to SORT, never to
// REJECT, and with no dates the sort did nothing. Reddit archives threads after six
// months by default: a nine-year-old suggestion was not just stale, it could not
// be replied to at all.
//
// WHY THE SELLERS. The intent scorer only has positive signals — words that sound
// like a buyer. "I built an AR catalogue for furniture shops, anyone want to try
// it?" matches "anyone want" and "furniture" and passes. Nothing recognised a
// seller, and the AI judge downstream only saw a title and a snippet.
//
// Every radar asks this module the same two questions, so the rules cannot drift
// apart between Buyer Hunt, Reddit and Quora.

const DAY = 86400000;

// Reddit archives a thread after 180 days unless the subreddit has switched it
// off; an archived thread takes no new comments, so nothing past this is usable.
export const REDDIT_ARCHIVE_DAYS = 180;
// A buyer asking for help is a perishable thing. Past three months they have
// bought something or given up.
export const BUYER_MAX_AGE_DAYS = 90;

const UNITS = { minute: 1 / 1440, min: 1 / 1440, hour: 1 / 24, hr: 1 / 24, h: 1 / 24, day: 1, d: 1, week: 7, wk: 7, w: 7, month: 30, mo: 30, year: 365, yr: 365, y: 365 };
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/**
 * An age in days read from text a search engine shows beside a result:
 * "3 days ago", "2 yr. ago", "Answered 5y", "Updated Mar 12, 2019", "2019-03-12".
 * Null when the text gives no date — which is common and must not be guessed at.
 */
export function ageFromText(text, now = Date.now()) {
  const t = String(text || "");
  if (!t) return null;
  // "3 days ago", "2 yr. ago", "5 months ago"
  const rel = t.match(/\b(\d{1,3})\s*(minute|min|hour|hr|day|week|wk|month|mo|year|yr)s?\.?\s+ago\b/i);
  if (rel) return Number(rel[1]) * UNITS[rel[2].toLowerCase()];
  // Quora's "Answered 5y" / "Updated 3mo" / "Asked 2w"
  const quora = t.match(/\b(?:answered|updated|asked|posted)\s+(\d{1,3})\s*(y|mo|w|d|h)\b/i);
  if (quora) return Number(quora[1]) * UNITS[quora[2].toLowerCase()];
  // "Mar 12, 2019" / "12 March 2019"
  const mdy = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2}|19\d{2})\b/i);
  if (mdy) return days(now, Date.UTC(Number(mdy[3]), MONTHS[mdy[1].toLowerCase()], Number(mdy[2])));
  const dmy = t.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s+(20\d{2}|19\d{2})\b/i);
  if (dmy) return days(now, Date.UTC(Number(dmy[3]), MONTHS[dmy[2].toLowerCase()], Number(dmy[1])));
  // ISO "2019-03-12"
  const iso = t.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return days(now, Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return null;
}

function days(now, then) {
  const d = (now - then) / DAY;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

// -- A REDDIT POST'S DATE, FROM ITS ID ALONE --
// Reddit ids count upward in base 36, so an id is a timestamp in disguise. These
// anchors were read from Reddit's own feeds on 27 Sep 2026 (the id and the
// <published> date of real posts), not remembered. Between two anchors the date
// is interpolated; past the newest it is extrapolated at the recent rate of about
// 1.5 million ids a day. The anchors are densest over the last six months because
// that is the only window where precision matters: everything before it is past
// Reddit's archive limit whatever its exact date.
const REDDIT_ANCHORS = [
  ["kpempl", "2021-01-03"], ["npji9j", "2021-06-01"], ["t0j5bm", "2022-02-24"],
  ["ucm1vt", "2022-04-26"], ["1rfl4xd", "2026-02-26"], ["1sjwtfy", "2026-04-13"],
  ["1tv60bk", "2026-06-02"], ["1v4fmoi", "2026-07-23"], ["1waegmh", "2026-09-08"],
  ["1wrljb3", "2026-09-27"],
].map(([id, d]) => [parseInt(id, 36), Date.parse(`${d}T12:00:00Z`)]);

/**
 * Estimated age in days of a Reddit post, from its id. Null for anything that
 * is not a Reddit id. Older than the first anchor returns that anchor's age,
 * which is already years past anything usable.
 */
export function redditIdAge(threadId, now = Date.now()) {
  const id = String(threadId || "").trim().toLowerCase();
  if (!/^[a-z0-9]{5,8}$/.test(id)) return null;
  const n = parseInt(id, 36);
  if (!Number.isFinite(n)) return null;
  const A = REDDIT_ANCHORS;
  let at;
  if (n <= A[0][0]) at = A[0][1];
  else if (n >= A[A.length - 1][0]) {
    const [n1, t1] = A[A.length - 2], [n2, t2] = A[A.length - 1];
    at = t2 + (n - n2) * ((t2 - t1) / (n2 - n1));
  } else {
    for (let i = 1; i < A.length; i++) {
      if (n <= A[i][0]) {
        const [n1, t1] = A[i - 1], [n2, t2] = A[i];
        at = t1 + (n - n1) * ((t2 - t1) / (n2 - n1));
        break;
      }
    }
  }
  return days(now, at) ?? 0;
}

// ── SELLERS ──
// Someone offering the thing, not asking for it. Deliberately narrow: "our store
// needs AR" is a BUYER, so shops and stores never appear here, and a post that
// also asks a genuine question is left for the AI judge rather than dropped.
const SELLER = [
  { re: /\b(i|we)\s+(just\s+)?(built|made|created|developed|launched|designed|released|shipped)\b/i, why: "announces something they built" },
  { re: /\b(i|we)('m| am|'re| are)\s+(building|launching|developing|making)\b/i, why: "is building their own" },
  { re: /\b(my|our)\s+(startup|saas|app|tool|platform|agency|studio|side project|plugin|extension)\b/i, why: "promotes their own product" },
  { re: /\b(launching|introducing|announcing|show hn|check out my|check out our)\b/i, why: "is a launch or promotion" },
  { re: /\[(for hire|hiring|offer|promo)\]|\bfor hire\b|\b(dm|pm) me\b/i, why: "is offering a service" },
  { re: /\b(i|we)\s+offer\b|\blooking for (beta )?(testers|feedback|clients|customers|users)\b/i, why: "is looking for customers, not a solution" },
  { re: /\b(roast|rate|feedback on) my\b/i, why: "is asking for feedback on their own product" },
];
const ASKING = /\?|^\s*(how|what|which|where|who|can|does|is|are|should|anyone|any\s|recommend|looking for (a|an|some)\b|need (a|an|help)\b|best\b|help\b)/i;

/**
 * True when the post is someone selling rather than someone looking.
 * @returns {{ seller: boolean, why: string|null }}
 */
export function sellerPost(title = "", snippet = "") {
  const text = `${title} ${snippet}`;
  const hit = SELLER.find((s) => s.re.test(text));
  if (!hit) return { seller: false, why: null };
  // Selling words AND a real question — "we built our own and it failed, what
  // do you use?" — is exactly the kind of post the judge exists to read.
  if (ASKING.test(String(title || ""))) return { seller: false, why: null };
  return { seller: true, why: hit.why };
}

/**
 * The single verdict every radar asks for.
 *
 * @param c           { title, snippet, url, platform, createdUtc, threadId, ageDays }
 * @param maxAgeDays  older than this is not a live opening
 * @param unknownAge  "drop" | "keep" — what to do when no date could be found
 * @returns {{ ok: boolean, reason: string|null, ageDays: number|null }}
 */
export function gateOpportunity(c, { maxAgeDays = BUYER_MAX_AGE_DAYS, unknownAge = "drop", now = Date.now() } = {}) {
  const s = sellerPost(c?.title, c?.snippet);
  if (s.seller) return { ok: false, reason: `seller: ${s.why}`, ageDays: null };

  let age = Number.isFinite(c?.ageDays) ? c.ageDays : null;
  if (age === null && c?.createdUtc > 0) age = days(now, c.createdUtc * 1000);
  if (age === null) age = ageFromText(`${c?.snippet || ""} ${c?.title || ""}`, now);
  if (age === null && (c?.platform === "reddit" || /reddit\.com\//i.test(c?.url || ""))) {
    age = redditIdAge(c?.threadId || String(c?.url || "").match(/comments\/([A-Za-z0-9]+)/)?.[1], now);
  }

  if (age === null) return unknownAge === "keep" ? { ok: true, reason: null, ageDays: null } : { ok: false, reason: "no visible date", ageDays: null };
  if (age > maxAgeDays) return { ok: false, reason: `${Math.round(age)} days old`, ageDays: age };
  return { ok: true, reason: null, ageDays: age };
}
