// lib/earned-media.js
// ── EARNED MEDIA — get OTHERS to feature you (free, real, verified) ──
// Same proven engine as Find clients: the AI names REAL sites that could feature you
// for a chosen "play", each is VERIFIED by crawling its own site for a real contact,
// then Genie drafts the exact outreach that play needs. You review + send from your
// own email. Nothing fake — no bought links, no fake accounts, no fake reviews. Only
// genuine coverage you earn by asking real sites the right way.

import { aiList, mapCompanies, profileCompany } from "@/lib/prospects";

const originOf = (u) => { try { return new URL(u).origin; } catch { return null; } };

// The four plays. `find` shapes WHAT sites to look for; `angle` shapes the pitch.
export const PLAYS = {
  backlinks: {
    label: "Get listed in roundups",
    blurb: "Blogs & guides that publish “best of / top” lists you could be added to.",
    find: (niche) => `Real blogs, magazines and websites that publish "best ${niche}", "top ${niche}", buying guides and resource/roundup articles — the kind that could ADD a brand like ours to an existing list. Favour independent blogs and niche publications (they actually respond), not giant marketplaces.`,
    angle: "Politely ask to be considered for inclusion in their relevant roundup or resource article. Note that they cover this space, and give one clear reason we'd genuinely fit their readers. No demand, no link-scheme language.",
  },
  guest: {
    label: "Publish a guest post",
    blurb: "Sites in your space that accept guest contributors / “write for us”.",
    find: (niche) => `Real blogs and online publications in the "${niche}" space that accept guest contributors or have a "write for us" / "contribute" page. Favour active independent blogs and niche industry sites.`,
    angle: "Offer to write a genuinely useful, original guest article for their audience — suggest 1-2 specific topic ideas relevant to their readers. Lead with value to their readers, not a sales pitch.",
  },
  press: {
    label: "Earn press coverage",
    blurb: "Publications, newsletters & journalists who cover your niche.",
    find: (niche) => `Real online publications, industry magazines, trade newsletters and journalists that cover "${niche}" news, trends and products. Favour niche/trade publications and independent newsletters over huge national outlets.`,
    angle: "Offer a specific, timely story angle or expert commentary they could actually use, and position us as a helpful source. Short and respectful of their time.",
  },
  directory: {
    label: "Get a directory listing",
    blurb: "Directories, marketplaces & “best of” listing sites to be listed on.",
    find: (niche) => `Real directories, marketplaces, "best of" listing sites and industry-association member lists relevant to "${niche}" where a brand can request to be listed.`,
    angle: "Request a listing or submission, briefly noting how we fit their directory's category and audience.",
  },
};

// Find real target SITES for a play — AI-named (robust, groq-first), mapped to domains.
async function findMediaSites(play, niche, { limit = 10 } = {}) {
  const spec = PLAYS[play] || PLAYS.backlinks;
  const list = await aiList({
    system: "You find real, currently-operating websites for earned-media outreach. List only sites you are confident actually exist and are a genuine fit. Never invent domains. Return ONLY valid JSON.",
    json: true, maxTokens: 1400, temperature: 0.4,
    prompt: `Find up to ${limit} sites for this goal:
${spec.find(niche)}

For each, give the site name and its primary website domain only (no path, no http).
Return ONLY: { "companies": [ { "name": "Site Name", "domain": "site.com" } ] }`,
  });
  return mapCompanies(list);
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

// Orchestrate one play: niche -> real sites -> crawl for a contact -> batched pitch.
export async function discoverMedia({ play = "backlinks", niche, business, limit = 8 }) {
  const sites = await findMediaSites(play, niche, { limit });
  if (!sites.length) return { opportunities: [], debug: { sites: 0, reachable: 0 } };

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
  const opportunities = await pitchMedia(chosen, play, business);
  return { opportunities, debug: { sites: sites.length, reachable: reachable.length } };
}
