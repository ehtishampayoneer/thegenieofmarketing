// lib/citations.js
// ── THE CITATION GAP ENGINE ("get into the lists") ──
// When a buyer asks an AI assistant for a recommendation, it almost never cites the
// vendor's own website. It cites THIRD PARTIES: "12 Best X" buying guides, review
// platforms, comparison posts, community threads. So writing more of your own pages
// has a ceiling — the way into the answer is to be inside the sources it already reads.
//
// This finds those sources for the client's real buyer questions and checks whether
// the client appears in them. A source they're missing from is the opportunity:
// get included there, and the AI starts naming them.
//
//   classifySource(url, title)      → what kind of placement this is
//   detectMention(html, business)   → is this business already in it?
//   analyzeCitations(...)           → find + classify + check + store the gaps

import { safeFetch } from "@/lib/ssrf";
import { swallow } from "@/lib/log";

const REVIEW_SITES = ["g2.com", "capterra.com", "trustpilot.com", "producthunt.com", "getapp.com", "softwareadvice.com", "trustradius.com", "sitejabber.com"];
const COMMUNITY = ["reddit.com", "quora.com", "stackexchange.com", "stackoverflow.com", "news.ycombinator.com"];
const NEWS = ["techcrunch.com", "theverge.com", "forbes.com", "wired.com", "businessinsider.com", "mashable.com"];
// Titles that signal a roundup someone can be ADDED to — the highest-leverage target.
const LISTICLE_RE = /\b(\d+\s+best|best\s+\d+|top\s+\d+|\d+\s+top|best\s+\w+\s+(apps|tools|software|platforms|services|sites|companies|brands|stores)|alternatives?\s+to|vs\.?\s|comparison|buying\s+guide|reviewed|roundup)\b/i;

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

// What kind of placement is this, and can we realistically get into it?
export function classifySource(url, title = "", ownHost = "") {
  const d = domainOf(url);
  if (!d) return { kind: "unknown", authority: 20, actionable: false };
  if (ownHost && d === String(ownHost).replace(/^www\./, "").toLowerCase()) {
    return { kind: "own", authority: 0, actionable: false };
  }
  if (REVIEW_SITES.some((s) => d === s || d.endsWith(`.${s}`))) return { kind: "review", authority: 85, actionable: true };
  if (COMMUNITY.some((s) => d === s || d.endsWith(`.${s}`))) return { kind: "community", authority: 70, actionable: true };
  if (NEWS.some((s) => d === s || d.endsWith(`.${s}`))) return { kind: "news", authority: 80, actionable: false };
  if (LISTICLE_RE.test(title)) return { kind: "listicle", authority: 75, actionable: true };
  if (/\b(directory|marketplace|catalog)\b/i.test(title)) return { kind: "directory", authority: 45, actionable: true };
  return { kind: "unknown", authority: 35, actionable: false };
}

// Is this business already on the page? Checks brand name and bare domain, since a
// listicle may link the site without naming the brand exactly (or vice versa).
export function detectMention(html, { name, host } = {}) {
  const text = String(html || "").toLowerCase();
  if (!text) return false;
  const bare = String(host || "").replace(/^www\./, "").toLowerCase();
  if (bare && text.includes(bare)) return true;
  const n = String(name || "").trim().toLowerCase();
  if (n.length >= 3 && text.includes(n)) return true;
  return false;
}

// Which known rivals appear on the page (so the owner sees who took the slot).
export function findCompetitors(html, competitors = []) {
  const text = String(html || "").toLowerCase();
  return competitors
    .map((c) => String(c || "").trim())
    .filter((c) => c.length >= 3 && text.includes(c.toLowerCase()))
    .slice(0, 6);
}

// Sponsored / affiliate roundups need money, not a pitch. Flag rather than pitch blindly.
export function looksPayToPlay(html) {
  const t = String(html || "").toLowerCase();
  return /\b(sponsored (post|content)|paid placement|affiliate (link|disclosure)|advertorial|in partnership with)\b/.test(t);
}

// Strip tags so mention-matching runs on visible text, not markup/URLs in scripts.
function visibleText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

async function fetchPage(url) {
  const { res } = await safeFetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketingGenie/1.0; +https://marketinggenie.app/bot)" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`http_${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml/i.test(type)) throw new Error("not_html");
  const raw = await res.text();
  return raw.slice(0, 400_000); // bound memory on huge pages
}

/**
 * Turn the sources AI cites into a stored gap report.
 * @param sources [{ url, title, question }] — from the AI-search radar
 * Returns { checked, gaps, alreadyIn, targets }
 */
export async function analyzeCitations(supabase, { userId, host, businessName, competitors = [], sources = [] } = {}) {
  const seen = new Set();
  const candidates = [];
  for (const s of sources) {
    const url = String(s?.url || "").split("#")[0];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const cls = classifySource(url, s.title || "", host);
    if (cls.kind === "own") continue; // their own site can't be a placement
    candidates.push({ ...s, url, ...cls });
  }
  if (!candidates.length) return { checked: 0, gaps: 0, alreadyIn: 0, targets: [] };

  // Bounded concurrency — we are crawling other people's sites, politely.
  const targets = [];
  const batchSize = 4;
  for (let i = 0; i < candidates.length && i < 24; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const done = await Promise.allSettled(batch.map(async (c) => {
      let mentioned = null, comps = [], pay = false;
      try {
        const html = await fetchPage(c.url);
        const text = visibleText(html);
        mentioned = detectMention(text, { name: businessName, host });
        comps = findCompetitors(text, competitors);
        pay = looksPayToPlay(text);
      } catch (e) {
        // Unreachable/blocked page: record it as unknown rather than guessing.
        swallow("citations.fetch", e, { url: c.url });
      }
      return {
        user_id: userId, host, url: c.url, domain: domainOf(c.url),
        title: c.title || null, kind: c.kind, question: c.question || null,
        mentioned, competitors_found: comps, pay_to_play: pay,
        authority: c.authority, status: mentioned ? "landed" : "gap",
        last_checked_at: new Date().toISOString(),
        meta: { actionable: c.actionable },
      };
    }));
    for (const r of done) if (r.status === "fulfilled") targets.push(r.value);
  }

  try {
    const { error } = await supabase.from("citation_targets").upsert(targets, { onConflict: "user_id,host,url" });
    if (error) throw error;
  } catch (e) {
    swallow("citations.save", e, { userId, host, hint: "run db/setup.sql for citation_targets" });
  }

  const alreadyIn = targets.filter((t) => t.mentioned === true).length;
  const gaps = targets.filter((t) => t.mentioned === false).length;
  return { checked: targets.length, gaps, alreadyIn, targets };
}
