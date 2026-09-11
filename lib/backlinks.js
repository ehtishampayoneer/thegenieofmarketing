// lib/backlinks.js
// ── DID ANY OF THE OUTREACH ACTUALLY EARN A LINK? ──
// Genie runs seven earned-media plays and had no way to know whether a single
// one worked. It could count Reddit upvotes but not a link, which meant the
// learning loop was blind to the entire point of link building, and the owner
// spent their daily sends with no idea which pitch angle was worth repeating.
//
// WHY NOT A BACKLINK INDEX
// The Google Search Console API does not expose the Links report at all: it is
// UI-only, and no amount of OAuth changes that. Bing Webmaster Tools does have
// backlink data for free, but it needs a separate account, a verified site and
// its own API key before it returns anything, and their legacy API retired on
// 31 August 2026.
//
// So this does something narrower and more useful instead: it checks the sites
// Genie ACTUALLY PITCHED. That needs no account, no key and no setup, and it
// answers the question that matters, which is not "who links to me" but "did
// what Genie did work". It is also the only version that can feed the learning
// loop, because every result is tied to a specific play and a specific pitch.
//
// It will not find links Genie had nothing to do with. That is a real limit and
// the UI says so rather than implying this is a full backlink audit.

import { recordEvent, getEvents } from "@/lib/events";

const UA = "GenieBot/1.0 (link check)";

// Pages worth checking on a site that agreed to feature you. A link usually
// lands either on the page that was pitched or somewhere obvious like a
// resources or partners page. This is a targeted look, not a site crawl.
const LIKELY_PATHS = ["", "/resources", "/links", "/partners", "/tools", "/blog"];

const domainOf = (u) => {
  try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return String(u || "").toLowerCase(); }
};

/**
 * Look for a link to `target` on `siteUrl`.
 * Returns { found, page, anchor, nofollow } or { found: false }.
 *
 * rel is reported honestly: a nofollow link is real referral traffic and a real
 * brand mention, but it is not the ranking signal a dofollow link is, and
 * quietly counting them the same would make the numbers a lie.
 */
export async function findLinkTo(siteUrl, target, { paths = LIKELY_PATHS } = {}) {
  const { safeFetch } = await import("@/lib/ssrf");
  const targetDomain = domainOf(target);
  if (!targetDomain) return { found: false };

  let origin;
  try { origin = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).origin; }
  catch { return { found: false }; }

  for (const path of paths) {
    let html = "";
    try {
      const r = await safeFetch(origin + path, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
      if (!r?.ok) continue;
      html = await r.text();
    } catch { continue; }

    // Find an anchor whose href points at the target domain, and keep the rel
    // and the anchor text so the owner can see the actual link, not just a tick.
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
      const attrs = m[1] || "";
      const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1] || "";
      if (!href || !href.includes(targetDomain)) continue;
      // Guard against matching a domain that merely contains ours as a substring.
      if (domainOf(href) !== targetDomain) continue;
      const rel = (/rel=["']([^"']*)["']/i.exec(attrs)?.[1] || "").toLowerCase();
      return {
        found: true,
        page: origin + path,
        href,
        anchor: String(m[2] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
        nofollow: /nofollow|ugc|sponsored/.test(rel),
      };
    }
  }
  return { found: false };
}

/**
 * Check every site this user pitched and marked as applied, and record what is
 * now live. Best-effort and bounded: it runs inside the nightly job.
 *
 * Idempotent by dedupe key, so a link found on three consecutive nights is one
 * event, not three, and the counts never inflate themselves.
 */
export async function scanEarnedLinks(admin, { userId, host, limit = 12 } = {}) {
  if (!admin || !userId || !host) return { checked: 0, found: 0 };

  let applied = [];
  try {
    const { data } = await admin.from("actions")
      .select("id, payload, created_at")
      .eq("user_id", userId).eq("type", "media_outreach").limit(300);
    applied = (data || [])
      .filter((a) => a.payload?.applied && a.payload?.domain)
      // Oldest applied first: a site that agreed three weeks ago is likelier to
      // have published by now than one pitched yesterday.
      .sort((a, b) => new Date(a.payload.appliedAt || a.created_at) - new Date(b.payload.appliedAt || b.created_at));
  } catch { return { checked: 0, found: 0 }; }
  if (!applied.length) return { checked: 0, found: 0 };

  // Skip anything already confirmed: a found link does not need re-finding, and
  // this keeps each night's work proportional to what is still outstanding.
  let known = new Set();
  try {
    const prior = await getEvents(admin, { userId, host, types: ["link.earned"], limit: 500 });
    known = new Set(prior.map((e) => e.data?.domain).filter(Boolean));
  } catch {}

  const todo = applied.filter((a) => !known.has(a.payload.domain)).slice(0, limit);
  let found = 0;

  for (const a of todo) {
    const p = a.payload;
    // Check the exact page pitched first, then the usual places.
    const paths = p.url && p.url !== `https://${p.domain}` ? ["", ...LIKELY_PATHS] : LIKELY_PATHS;
    const hit = await findLinkTo(p.url || `https://${p.domain}`, host, { paths });
    if (!hit.found) continue;
    found++;
    try {
      await recordEvent(admin, {
        userId, host,
        type: "link.earned",
        actor: "genie",
        subject: p.domain,
        data: {
          domain: p.domain, company: p.company || p.domain, play: p.play || null,
          page: hit.page, href: hit.href, anchor: hit.anchor, nofollow: !!hit.nofollow,
        },
        // One event per domain, forever. Re-checking must never double-count.
        dedupeKey: `link:${host}:${p.domain}`,
      });
    } catch {}
  }
  return { checked: todo.length, found };
}

/**
 * What has been earned so far, for the UI. Split by rel, because presenting a
 * nofollow profile link beside an editorial dofollow link as the same thing is
 * exactly the kind of flattery this product refuses elsewhere.
 */
export async function earnedLinks(supabase, { userId, host, limit = 100 } = {}) {
  const rows = await getEvents(supabase, { userId, host, types: ["link.earned"], limit });
  const links = rows.map((r) => ({
    domain: r.data?.domain || r.subject,
    company: r.data?.company || r.data?.domain,
    play: r.data?.play || null,
    page: r.data?.page || null,
    href: r.data?.href || null,
    anchor: r.data?.anchor || null,
    nofollow: !!r.data?.nofollow,
    at: r.created_at,
  })).filter((l) => l.domain);

  // Which plays are actually earning links. This is the number that should
  // decide where the next batch of daily sends goes.
  const byPlay = {};
  for (const l of links) {
    const k = l.play || "other";
    byPlay[k] = byPlay[k] || { total: 0, follow: 0 };
    byPlay[k].total++;
    if (!l.nofollow) byPlay[k].follow++;
  }

  return {
    links,
    total: links.length,
    follow: links.filter((l) => !l.nofollow).length,
    nofollow: links.filter((l) => l.nofollow).length,
    byPlay,
  };
}
