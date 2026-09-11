// lib/earned-media.js
// ── EARNED MEDIA — get OTHERS to feature you (free, real, verified) ──
// Discovery uses TWO independent sources so one failing can't zero out results:
//   1. Real web search for the play's natural queries ("best {niche}", "{niche}
//      write for us", "{niche} directory") — returns ACTUAL roundup/guest/press pages.
//   2. The AI naming real sites (robust groq->openrouter-paid path).
// Both feed one deduped pool; each site is VERIFIED by crawling for a real contact,
// then Genie drafts the play-specific pitch. You review + send from your own email.
// Nothing fake — only genuine coverage you earn by asking real sites the right way.

import { aiList, mapCompanies, profileCompany } from "@/lib/prospects";
import { webSearch } from "@/lib/search";
import { callAI } from "@/lib/ai-router";

const firstArray = (j) => Array.isArray(j) ? j : Array.isArray(j?.companies) ? j.companies : Array.isArray(j?.results) ? j.results : (Object.values(j || {}).find(Array.isArray) || []);

const originOf = (u) => { try { return new URL(u).origin; } catch { return null; } };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } };
const cleanName = (title, host) => { const t = String(title || "").split(/[|\-–—:·]/)[0].trim(); return t && t.length <= 45 ? t : String(host || "").split(".")[0].replace(/\b\w/g, (c) => c.toUpperCase()); };
// Not pitchable as a media/site to feature you (socials, marketplaces, search engines).
const MEDIA_SKIP = /(facebook|instagram|twitter|x\.com|t\.co|linkedin|youtube|tiktok|pinterest|reddit|quora|amazon|ebay|etsy|aliexpress|walmart|target\.com|google\.|bing\.|duckduckgo|yahoo|wikipedia|\.gov|w3\.org|vimeo|dailymotion|rumble|odysee|bitchute|veoh|metacafe|vidlii)/i;

// The four plays. `find` = AI prompt for sites, `queries` = real search queries,
// `angle` = how the pitch is written.
export const PLAYS = {
  backlinks: {
    label: "Get listed in roundups",
    blurb: "Blogs & guides that publish “best of / top” lists you could be added to.",
    find: (niche) => `Real blogs, magazines and websites that publish "best ${niche}", "top ${niche}", buying guides and resource/roundup articles that could ADD a brand to an existing list. Favour independent blogs and niche publications, not giant marketplaces.`,
    queries: (n) => [`best ${n}`, `top ${n} brands`, `${n} buying guide`, `best ${n} 2025`],
    angle: "Politely ask to be considered for inclusion in their relevant roundup or resource article. Note that they cover this space, and give one clear reason we'd genuinely fit their readers. No demand, no link-scheme language.",
  },
  guest: {
    label: "Publish a guest post",
    blurb: "Sites in your space that accept guest contributors / “write for us”.",
    find: (niche) => `Real blogs and online publications in the "${niche}" space that accept guest contributors or have a "write for us" / "contribute" page. Favour active independent blogs and niche industry sites.`,
    queries: (n) => [`${n} "write for us"`, `${n} guest post`, `${n} become a contributor`, `${n} blog write for us`],
    angle: "Offer to write a genuinely useful, original guest article for their audience — suggest 1-2 specific topic ideas relevant to their readers. Lead with value to their readers, not a sales pitch.",
  },
  press: {
    label: "Earn press coverage",
    blurb: "Publications, newsletters & journalists who cover your niche.",
    find: (niche) => `Real online publications, industry magazines, trade newsletters and journalists that cover "${niche}" news, trends and products. Favour niche/trade publications and independent newsletters over huge national outlets.`,
    queries: (n) => [`${n} magazine`, `${n} news blog`, `best ${n} blogs`, `${n} newsletter`],
    angle: "Offer a specific, timely story angle or expert commentary they could actually use, and position us as a helpful source. Short and respectful of their time.",
  },
  directory: {
    label: "Get a directory listing",
    blurb: "Directories, marketplaces & “best of” listing sites to be listed on.",
    find: (niche) => `Real directories, "best of" listing sites and industry-association member lists relevant to "${niche}" where a brand can request to be listed.`,
    queries: (n) => [`${n} directory`, `best ${n} websites`, `${n} companies directory`, `${n} submit your business`],
    angle: "Request a listing or submission, briefly noting how we fit their directory's category and audience.",
  },
  broken: {
    label: "Fix their broken links",
    blurb: "Pages in your space linking to something dead. You point it out and offer a working replacement.",
    // The highest-converting outreach in link building, and it needs no API at
    // all. "Please link to me" is ignored. "Your page links to something that
    // has been dead since 2023, here is a working replacement" gets answered,
    // because you are reporting a problem on THEIR page, not asking a favour.
    find: (niche) => `Real pages about "${niche}" that link OUT to many other sites: resource lists, tool roundups, "useful links" pages, curated guides and long reference articles. These are the pages most likely to have accumulated dead links over the years. Favour independent blogs, associations and niche publications over big marketplaces.`,
    queries: (n) => [
      `${n} resources page`,
      `${n} useful links`,
      `best ${n} tools list`,
      `${n} guide links`,
      `${n} recommended reading`,
    ],
    angle: "Tell them plainly which link on their page is dead, with the exact URL and the anchor text so they can find it in seconds. Then offer one relevant page of ours as a replacement, making clear it is only a suggestion and they are welcome to use anything else. Helpful and brief. Never imply they owe us anything for pointing it out.",
    // Discovery has to crawl and status-check before pitching, so the route
    // treats this play differently. See findDeadLinks().
    scanLinks: true,
  },
  video: {
    label: "Place your video",
    blurb: "Real pages where your video can live as part of your company's presence, not another social feed.",
    // Deliberately NOT video-sharing platforms. The old "150+ free video
    // submission sites" lists are dead SEO-era link farms, and submitting to
    // them is the same category of mistake as buying engagement: it does
    // nothing for a buyer and can actively hurt the site it points at.
    // What we want is pages your buyers already open, where a video is a
    // supported part of a real listing, profile or article.
    find: (niche) => `Real websites where a "${niche}" company can add a PROMOTIONAL or DEMO VIDEO to a genuine listing, profile or article that buyers actually read. Good examples: software/product listing and review sites that support a demo video on the vendor profile, industry and trade association member directories that allow a video on the member page, niche marketplaces and buyer guides whose listings support video, product launch and showcase sites, and niche blogs or newsletters that embed vendor videos in their reviews and roundups. EXCLUDE video-sharing and social platforms entirely (YouTube, Vimeo, Dailymotion, Rumble, TikTok, Instagram, Facebook, X). EXCLUDE generic "free video submission site" link farms and any low-quality directory that exists only for backlinks. Favour sites with a real audience in this industry.`,
    queries: (n) => [
      `${n} software directory submit demo video`,
      `${n} vendor profile add video`,
      `best ${n} review site vendor listing`,
      `${n} association member directory listing`,
      `submit your ${n} product video review`,
    ],
    angle: "Ask to add our short video to the relevant listing, profile or review page. Say in one line what the video shows and why their audience would find it useful, and offer the link plus a short description they can use as-is. Make it easy to say yes: no demands, no link-scheme language, and make clear we are happy for them to host or embed it however suits their page.",
    // Marks this play as video-shaped so the UI and the drafted pitch can carry
    // the video link and description alongside the usual outreach copy.
    video: true,
  },
  partners: {
    label: "Find partners (co-sell)",
    blurb: "Complementary businesses that reach your buyers — for cross-promotion.",
    find: (niche) => `Real companies that sell COMPLEMENTARY, non-competing products or services to the SAME customers as "${niche}" — natural cross-promotion / co-marketing partners (they reach our buyers without competing with us). Favour independent small-to-mid businesses that would say yes to a partnership.`,
    queries: (n) => [`${n} tools`, `${n} services`, `apps for ${n} businesses`, `${n} integrations`],
    angle: "Propose a genuine win-win partnership: we reach similar customers without competing. Suggest ONE concrete way to help each other (co-created content, a bundle, or mutual referrals). Warm, specific, low-pressure — a partner intro, not a sales pitch. A warm partner referral closes far better than cold outreach.",
  },
};

// The AI half of discovery — names real sites for the play (robust, paid backstop).
function aiSiteList(spec, niche, limit) {
  return aiList({
    system: "You find real, currently-operating websites for earned-media outreach. List only sites you are confident actually exist and are a genuine fit. Never invent domains. Return ONLY valid JSON.",
    json: true, maxTokens: 1400, temperature: 0.4,
    prompt: `Find up to ${limit} sites for this goal:\n${spec.find(niche)}\nFor each, give the site name and its primary website domain only (no path, no http).\nReturn ONLY: { "companies": [ { "name": "Site Name", "domain": "site.com" } ] }`,
  });
}

// Find real target SITES for a play from BOTH sources, deduped. Returns { sites, diag }.
export async function findMediaSitesDetailed(play, niche, { limit = 10 } = {}) {
  const spec = PLAYS[play] || PLAYS.backlinks;
  const seen = new Set();
  const out = [];
  const add = (name, domain, url) => {
    if (!domain || seen.has(domain) || MEDIA_SKIP.test(domain) || domain.split(".").length > 4) return;
    seen.add(domain); out.push({ name, domain, url });
  };
  const diag = { search: 0, ai: 0, err: null };

  // Source 1: real web search for the play's queries → actual pages.
  for (const q of spec.queries(niche)) {
    if (out.length >= limit) break;
    let results = [];
    try { results = await webSearch(q, { limit: 8 }); } catch (e) { diag.err = "search:" + String(e?.message || e).slice(0, 50); }
    diag.search += (results || []).length;
    for (const r of results || []) { const host = hostOf(r.url); if (host) add(cleanName(r.title, host), host, originOf(r.url)); if (out.length >= limit) break; }
  }

  // Source 2: AI-named sites, merged in.
  if (out.length < limit) {
    try { const ai = mapCompanies(await aiSiteList(spec, niche, limit)); diag.ai = ai.length; for (const c of ai) add(c.name, c.domain, c.url); }
    catch (e) { diag.err = (diag.err ? diag.err + " " : "") + "ai:" + String(e?.message || e).slice(0, 50); }
  }
  return { sites: out.slice(0, limit), diag };
}

export async function findMediaSites(play, niche, opts) {
  return (await findMediaSitesDetailed(play, niche, opts)).sites;
}

// Draft the RIGHT outreach for every target in ONE batched call (rate-limit-safe).
async function pitchMedia(items, play, business) {
  const spec = PLAYS[play] || PLAYS.backlinks;
  const compact = items.map((it, i) => ({
    i, name: it.company, domain: it.domain, emails: it.emails.map((e) => e.email), about: (it.text || "").slice(0, 700),
    // Only present for the broken-link play. Giving the model the exact URL and
    // anchor text is what makes the email specific enough to be believed.
    ...(it.deadLinks?.length ? { deadLinks: it.deadLinks.map((d) => ({ url: d.url, anchor: d.anchor, status: d.status })) } : {}),
  }));
  const arr = await aiList({
    system: `You are Genie's earned-media outreach writer. GOAL: ${spec.label}. For EACH site, write a short, specific, non-spammy outreach email. Approach: ${spec.angle}. Never invent an email not in that site's list. No em-dashes, no emoji, no hype. Return ONLY a JSON array, one object per site, same order.`,
    json: true, maxTokens: 2600, temperature: 0.6,
    prompt: `SENDER (us): ${business?.name || ""} — ${business?.pitch || business?.whatTheySell || ""} (${business?.website || ""}).
${spec.video && business?.videoUrl ? `OUR VIDEO (include this link in every email, and describe what it shows in one line): ${business.videoUrl}${business.videoTitle ? ` — "${business.videoTitle}"` : ""}` : ""}

SITES (JSON): ${JSON.stringify(compact)}

${items.some((it) => it.deadLinks?.length) ? `Each site below has a "deadLinks" list: links ON THEIR PAGE that no longer work. Name the specific dead URL and its anchor text in the email so they can find it instantly, and suggest ONE of our pages as a possible replacement. Report it as a favour, never as a trade.
` : ""}
For each site return one object in the SAME order:
[{ "i": 0, "summary": "1 sentence on what this site is / covers", "name": "editor/contact name if evident else null", "title": "their role or a best-guess like 'Editor'", "recommendedEmail": "best email from THAT site's list or null", "whyFit": "1 sentence why we're a genuine fit for their audience", "subject": "specific subject under 60 chars", "body": "warm 60-100 word email for the goal above, one clear value point, one soft ask" }]`,
  });
  const byIdx = new Map((arr || []).map((p) => [Number(p.i), p]));

  return items.map((it, i) => {
    const p = byIdx.get(i) || {};
    const chosen = it.emails.find((e) => e.email === String(p.recommendedEmail || "").toLowerCase()) || it.emails.find((e) => e.type === "named") || it.emails[0] || null;
    return {
      company: it.company, domain: it.domain, url: it.url || it.origin, play,
      summary: p.summary || "",
      contact: { name: p.name || null, title: p.title || "Editor", email: chosen?.email || null, emailType: chosen?.type || null, channel: chosen ? "email" : "form", contactForm: it.contactForm || it.origin },
      whyFit: p.whyFit || "",
      pitch: {
        subject: p.subject || `${spec.label} — ${it.company}`,
        body: p.body || `Hi ${it.company} team,\n\nI really like what you do at ${it.company}, and I think ${business?.name || "our brand"} could be a genuine fit for your audience. Could I share a quick idea?\n\nThanks for your time.`,
      },
    };
  });
}

// Given real sites, crawl each for a contact (parallel, no AI) then write all pitches
// in one batched call. Every site becomes an opportunity (email, contact page, or home).
export async function buildFromSites(sites, play, business, limit = 8) {
  if (!sites?.length) return [];
  const profiles = [];
  const BATCH = 6;
  for (let i = 0; i < sites.length; i += BATCH) {
    const batch = sites.slice(i, i + BATCH);
    const rows = await Promise.all(batch.map(async (c) => {
      const pf = await profileCompany(c.url).catch(() => null);
      const origin = pf?.origin || originOf(c.url) || c.url;
      return { company: c.name, domain: c.domain, url: c.url, origin, emails: pf?.emails || [], text: pf?.text || "", contactForm: pf?.contactForm || null, deadLinks: c.deadLinks || null, authority: c.authority ?? null };
    }));
    profiles.push(...rows);
  }
  const reachable = profiles.filter((p) => p.emails.length || p.contactForm);
  const weak = profiles.filter((p) => !(p.emails.length || p.contactForm));
  const chosen = [...reachable, ...weak].slice(0, limit);
  return pitchMedia(chosen, play, business);
}

// Orchestrate one play: niche -> real sites (2 sources) -> crawl -> batched pitch.
// Find links on a page that no longer resolve. Bounded hard: this runs inside a
// discovery request, and a resource page can carry hundreds of links.
//
// A link counts as dead only on 404 or 410, or when the host does not resolve at
// all. Timeouts, 403s and 5xx are NOT dead: plenty of live sites block HEAD
// requests or rate-limit a stranger, and telling someone their working link is
// broken is the fastest way to be ignored forever.
export async function findDeadLinks(pageUrl, { max = 25 } = {}) {
  const { safeFetch } = await import("@/lib/ssrf");
  let html = "";
  try {
    const r = await safeFetch(pageUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    if (!r?.ok) return [];
    html = await r.text();
  } catch { return []; }

  const origin = originOf(pageUrl);
  const selfHost = hostOf(pageUrl);
  const seen = new Set();
  const candidates = [];
  const re = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && candidates.length < max) {
    const href = m[1].trim();
    if (!/^https?:\/\//i.test(href)) continue;          // skip anchors, mailto, relative
    const host = hostOf(href);
    if (!host || host === selfHost) continue;            // only their OUTBOUND links
    if (MEDIA_SKIP.test(host) || seen.has(href)) continue;
    seen.add(href);
    candidates.push({ url: href, host, anchor: strip(m[2]).slice(0, 80) });
  }
  if (!candidates.length) return [];

  const dead = [];
  for (let i = 0; i < candidates.length; i += 5) {
    const slice = candidates.slice(i, i + 5);
    const results = await Promise.allSettled(slice.map(async (c) => {
      try {
        let r = await safeFetch(c.url, { method: "HEAD", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
        // Some servers reject HEAD outright; confirm with a GET before judging.
        if (r && (r.status === 405 || r.status === 501)) {
          r = await safeFetch(c.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
        }
        if (r && (r.status === 404 || r.status === 410)) return { ...c, status: r.status };
        return null;
      } catch (e) {
        // Only a genuinely unresolvable host counts. A timeout proves nothing.
        const code = e?.cause?.code || e?.code;
        return code === "ENOTFOUND" ? { ...c, status: "gone" } : null;
      }
    }));
    for (const r of results) if (r.status === "fulfilled" && r.value) dead.push(r.value);
    if (dead.length >= 3) break;   // three is plenty to write a convincing email
  }
  return dead;
}

export async function discoverMedia({ play = "backlinks", niche, business, limit = 8 }) {
  const { sites, diag } = await findMediaSitesDetailed(play, niche, { limit });
  if (!sites.length) return { opportunities: [], debug: { sites: 0, ...diag } };

  let chosen = sites;

  // Rank by authority so the owner's limited daily sends go to sites that matter.
  // No-ops entirely without an OpenPageRank key, and never drops an unscored site.
  try {
    const { rankByAuthority } = await import("@/lib/authority");
    chosen = await rankByAuthority(chosen);
  } catch {}

  // The broken-link play only has something to say about a page that actually
  // HAS a dead link, so sites are filtered on evidence before anyone is emailed.
  if (PLAYS[play]?.scanLinks) {
    const withDead = [];
    for (const site of chosen.slice(0, Math.max(limit * 2, 10))) {
      const dead = await findDeadLinks(site.url);
      if (dead.length) withDead.push({ ...site, deadLinks: dead });
      if (withDead.length >= limit) break;
    }
    diag.scanned = chosen.length;
    diag.withDeadLinks = withDead.length;
    chosen = withDead;
    if (!chosen.length) return { opportunities: [], debug: { sites: sites.length, ...diag } };
  }

  const opportunities = await buildFromSites(chosen, play, business, limit);
  return { opportunities, debug: { sites: sites.length, ...diag } };
}

// Recovery + hard diagnostic. Probes each AI route DIRECTLY and reports what came
// back, so a rare empty is fully explained (and we recover from whichever works).
// Order: paid OpenRouter (should never rate-limit) -> full provider chain.
export async function diagnoseMedia(play, niche) {
  const spec = PLAYS[play] || PLAYS.backlinks;
  const base = {
    system: "You find real, currently-operating websites for earned-media outreach. List only real sites. Never invent domains. Return ONLY valid JSON.",
    json: true, maxTokens: 1400, temperature: 0.4,
    prompt: `Find up to 10 sites for this goal:\n${spec.find(niche)}\nReturn ONLY: { "companies": [ { "name": "Site Name", "domain": "site.com" } ] }`,
  };
  const probes = [];
  const run = async (label, extra) => {
    try {
      const r = await callAI({ ...base, ...extra });
      const list = firstArray(r?.json);
      const mapped = mapCompanies(list);
      probes.push({ label, provider: r?.provider || "?", parsed: list.length, mapped: mapped.length });
      return mapped;
    } catch (e) {
      probes.push({ label, err: String(e?.message || e).slice(0, 90) });
      return [];
    }
  };
  let sites = await run("or-paid", { only: ["openrouter"], modelOverride: process.env.OPENROUTER_PAID_MODEL || "openai/gpt-4o-mini" });
  if (!sites.length) sites = await run("chain", {});
  return { probes, mapped: sites.length, sites };
}
