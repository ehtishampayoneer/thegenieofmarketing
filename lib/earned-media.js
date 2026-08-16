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
const MEDIA_SKIP = /(facebook|instagram|twitter|x\.com|t\.co|linkedin|youtube|tiktok|pinterest|reddit|quora|amazon|ebay|etsy|aliexpress|walmart|target\.com|google\.|bing\.|duckduckgo|yahoo|wikipedia|\.gov|w3\.org)/i;

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
  const compact = items.map((it, i) => ({ i, name: it.company, domain: it.domain, emails: it.emails.map((e) => e.email), about: (it.text || "").slice(0, 700) }));
  const arr = await aiList({
    system: `You are Genie's earned-media outreach writer. GOAL: ${spec.label}. For EACH site, write a short, specific, non-spammy outreach email. Approach: ${spec.angle}. Never invent an email not in that site's list. No em-dashes, no emoji, no hype. Return ONLY a JSON array, one object per site, same order.`,
    json: true, maxTokens: 2600, temperature: 0.6,
    prompt: `SENDER (us): ${business?.name || ""} — ${business?.pitch || business?.whatTheySell || ""} (${business?.website || ""}).

SITES (JSON): ${JSON.stringify(compact)}

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
      return { company: c.name, domain: c.domain, url: c.url, origin, emails: pf?.emails || [], text: pf?.text || "", contactForm: pf?.contactForm || null };
    }));
    profiles.push(...rows);
  }
  const reachable = profiles.filter((p) => p.emails.length || p.contactForm);
  const weak = profiles.filter((p) => !(p.emails.length || p.contactForm));
  const chosen = [...reachable, ...weak].slice(0, limit);
  return pitchMedia(chosen, play, business);
}

// Orchestrate one play: niche -> real sites (2 sources) -> crawl -> batched pitch.
export async function discoverMedia({ play = "backlinks", niche, business, limit = 8 }) {
  const { sites, diag } = await findMediaSitesDetailed(play, niche, { limit });
  if (!sites.length) return { opportunities: [], debug: { sites: 0, ...diag } };
  const opportunities = await buildFromSites(sites, play, business, limit);
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
