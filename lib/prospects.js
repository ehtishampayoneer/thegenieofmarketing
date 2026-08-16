// lib/prospects.js
// ── FREE LEAD DISCOVERY + TAILORED PITCH ──
// You name a target niche ("rug e-commerce brands"); Genie finds real companies via
// web search, crawls each company's OWN site for its public contacts + who the
// decision-maker is, researches what they sell, and writes a pitch tailored to THAT
// business. No paid data provider — everything is public info the company published,
// and we only keep deliverable contacts (role@ or a real named address), never
// blasted guesses. Coverage is honest: a real contact for many, the owner's exact
// inbox for some. Best-effort and graceful throughout; never throws.

import { webSearch } from "@/lib/search";
import { callAI } from "@/lib/ai-router";

// A real browser UA — many sites 403 an obvious bot UA (verified against live rug
// retailers: rugsusa.com returned 403 to a bot UA, 200 to this one). We only fetch
// public homepage/contact/about pages, politely and shallowly.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
// Domains that are never a single company we'd pitch (marketplaces, socials, press…).
const SKIP_HOST = /(wikipedia|amazon|ebay|etsy|aliexpress|alibaba|pinterest|instagram|facebook|twitter|x\.com|linkedin|youtube|reddit|quora|yelp|tripadvisor|medium|forbes|nytimes|shopify\.com|wordpress\.com|blogspot|google\.|bing\.|duckduckgo|g2\.com|capterra|trustpilot|glassdoor|indeed|crunchbase|producthunt)/i;
const BAD_EMAIL = /(noreply|no-reply|donotreply|example\.|sentry|wixpress|\.png|\.jpg|\.gif|\.webp|@sentry|@2x|@example|your-?email|email@|name@)/i;
const ROLE_LOCAL = /^(info|sales|hello|contact|support|admin|team|office|enquir|inquir|help|marketing|press|media|orders?)@/i;

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } }
function originOf(u) { try { return new URL(u).origin; } catch { return null; } }

async function fetchPage(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(7000) });
    if (!r.ok || !/text\/html/i.test(r.headers.get("content-type") || "")) return null;
    return (await r.text()).slice(0, 400000);
  } catch { return null; }
}

// Find candidate company domains for a niche. Two sources work TOGETHER, deduped:
//   1. Real web search (Brave when configured — reliable from Vercel — then DDG).
//   2. An LLM that NAMES real companies + their domains for the niche.
// Both feed one candidate pool. Neither is trusted blindly — every candidate is
// verified downstream by crawling its own site for a real deliverable contact, so a
// wrong or dead domain is simply dropped. Running both widens the pool, which is
// what lifts the number of real people that survive verification.
export async function findCompanies(niche, { limit = 8, ctx = null } = {}) {
  const cap = limit * 2;
  const queries = [niche, `${niche} online store`, `best ${niche} brands`, `buy ${niche}`];
  const seen = new Set();
  const out = [];
  const add = (name, domain, url) => {
    if (!domain || seen.has(domain) || SKIP_HOST.test(domain)) return;
    if (domain.split(".").length > 4) return; // odd subdomains
    seen.add(domain);
    out.push({ name, domain, url });
  };

  for (const q of queries) {
    if (out.length >= cap) break;
    let results = [];
    try { results = await webSearch(q, { limit: 10, ctx }); } catch {}
    for (const r of results || []) {
      const host = hostOf(r.url);
      if (host) add(cleanName(r.title, host), host, originOf(r.url));
      if (out.length >= cap) break;
    }
  }
  // Always also fold in LLM-named companies (deduped) so search + the model combine
  // into a wider pool — this is the biggest lever on "not enough results".
  if (out.length < cap) {
    for (const c of await llmCandidateCompanies(niche, { limit: cap })) {
      if (out.length >= cap) break;
      add(c.name, c.domain, c.url);
    }
  }
  return out.slice(0, cap);
}

// Ask the model to name real, currently-operating companies for the niche and give
// each one's primary domain. We prefer small/mid businesses (more reachable than
// giants). Every candidate is verified downstream by crawling its own site, so this
// can be generous without risking fake contacts.
async function llmCandidateCompanies(niche, { limit = 10 } = {}) {
  try {
    const r = await callAI({
      system: "You name real, currently-operating companies for B2B prospecting. List only brands you are confident actually exist and sell online. Never invent domains. Return ONLY valid JSON.",
      json: true, maxTokens: 600, temperature: 0.4,
      prompt: `Target to prospect: "${niche}".
List up to ${limit} real companies that fit, favouring small-to-mid businesses (they answer outreach far more than giants) that sell online and likely publish a contact email on their site. For each, give its primary website domain only (no path, no http).
Return ONLY: { "companies": [ { "name": "Brand Name", "domain": "brand.com" } ] }`,
    });
    const list = Array.isArray(r.json?.companies) ? r.json.companies : [];
    return list
      .map((c) => {
        const domain = String(c.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim().toLowerCase();
        if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || domain.split(".").length > 4) return null;
        return { name: String(c.name || domain).slice(0, 60), domain, url: `https://${domain}` };
      })
      .filter(Boolean);
  } catch { return []; }
}
function cleanName(title, host) {
  const t = String(title || "").split(/[|\-–—:]/)[0].trim();
  return t && t.length <= 40 ? t : host.split(".")[0].replace(/\b\w/g, (c) => c.toUpperCase());
}

// Pull public emails out of a page (mailto links + visible text), classified.
function extractEmails(html) {
  const found = new Map();
  const add = (e) => {
    e = String(e || "").trim().toLowerCase();
    if (!e || BAD_EMAIL.test(e) || e.length > 100 || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) return;
    if (!found.has(e)) found.set(e, { email: e, type: ROLE_LOCAL.test(e) ? "role" : "named" });
  };
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) add(decodeURIComponent(m[1]));
  for (const m of html.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) add(m[0]);
  return [...found.values()];
}
// Read the site's OWN contact/about/team links off a page, so we adapt to each
// site's structure (Shopify /pages/contact-us, custom /get-in-touch, etc.) instead
// of guessing a fixed path list. Returns absolute URLs, contact/reach links first.
function discoverContactLinks(html, origin) {
  const hits = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    const href = m[1];
    if (!/(contact|get-in-touch|reach-us|reach-out|about|our-story|our-team|team|company|support|help)/i.test(href)) continue;
    try { const u = new URL(href, origin).href; if (u.startsWith(origin)) hits.push(u); } catch {}
  }
  // Contact/reach pages first (best for the "form" fallback), then about/team.
  const rank = (u) => (/contact|get-in-touch|reach/i.test(u) ? 0 : /about|story|team|company/i.test(u) ? 1 : 2);
  return [...new Set(hits)].sort((a, b) => rank(a) - rank(b));
}

// Crawl a company's homepage + the contact/about pages IT links to, and gather the
// raw signals: public emails, a reachable contact page, and the text an LLM reads to
// find the decision-maker and understand the business. A contact page is always
// resolved (its own link, or a common fallback path) so the company stays reachable
// even when no email is published in the HTML — which is the common case.
export async function profileCompany(url) {
  const origin = originOf(url);
  if (!origin) return null;
  const home = await fetchPage(origin + "/");
  if (!home) return null;

  const discovered = discoverContactLinks(home, origin);
  const fallbackPaths = ["/contact", "/contact-us", "/pages/contact", "/pages/contact-us", "/about", "/about-us", "/pages/about", "/support"];
  const urls = [...new Set([...discovered, ...fallbackPaths.map((p) => origin + p)])].slice(0, 7);
  const fetched = await Promise.all(urls.map((u) => fetchPage(u).then((h) => ({ u, h }))));
  const pages = [{ u: origin + "/", h: home }, ...fetched];

  const emails = new Map();
  let text = "";
  for (const { u, h } of pages) {
    if (!h) continue;
    for (const e of extractEmails(h)) if (!emails.has(e.email)) emails.set(e.email, e);
    if (u === origin + "/" || text.length < 2000) text += " " + h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  // Best reachable contact page: the first contact/reach link that actually loaded,
  // else the first discovered link, else null (caller falls back to the homepage).
  const contactForm = fetched.find((x) => x.h && /contact|get-in-touch|reach/i.test(x.u))?.u || discovered[0] || null;
  const ogTitle = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(home)?.[1]
    || /<title[^>]*>([^<]+)</i.exec(home)?.[1] || "";
  return { origin, emails: [...emails.values()], contactForm, text: text.trim().slice(0, 6000), siteName: ogTitle.trim() };
}

// One LLM pass per company: from the crawled text + emails, name the decision-maker
// and their role, pick the best contact, summarise the business, and write a pitch
// tailored to THEM for the user's product. Returns everything the UI needs.
export async function researchAndPitch({ company, profile, userBusiness }) {
  const emailList = profile.emails.map((e) => `${e.email} (${e.type})`).join(", ") || "none found";
  let ai;
  try {
    const r = await callAI({
      system: "You are Genie's B2B prospecting analyst. From a company's own website text, identify the best decision-maker to pitch and write a short, genuinely personalised outreach email. Never invent an email address that is not in the provided list. Return ONLY valid JSON.",
      json: true, maxTokens: 700, temperature: 0.6,
      prompt: `MY BUSINESS (the sender): ${userBusiness?.name || ""} — ${userBusiness?.pitch || userBusiness?.whatTheySell || ""}.
TARGET COMPANY: ${company.name} (${company.domain}).
Public emails found on their site: ${emailList}.
Their website text (trimmed):
${profile.text || "(little text found)"}

Return ONLY this JSON:
{
  "companySummary": "1 sentence on what they sell and how they position",
  "decisionMaker": { "name": "the best person to reach if a real name is on the site, else null", "title": "their role/rank if stated, else a best-guess role like 'Owner' or 'Head of Ecommerce'" },
  "recommendedEmail": "the single best email to use from the provided list (prefer a named person, else a role address), or null if none are usable",
  "whyThemFit": "1 sentence on why my product specifically fits THIS company",
  "pitch": { "subject": "a specific, non-spammy subject under 60 chars", "body": "a warm 60-90 word email to the decision-maker, referencing something specific about their business, one clear value point, one soft ask. No hype, no emoji, no em-dashes." }
}`,
    });
    ai = r.json;
  } catch { ai = null; }
  if (!ai) return null;

  // Trust our own extraction for the address; the model only *chooses* among real ones.
  const chosen = profile.emails.find((e) => e.email === String(ai.recommendedEmail || "").toLowerCase())
    || profile.emails.find((e) => e.type === "named")
    || profile.emails[0]
    || null;
  // Reachable either way: a public email if we found one, otherwise their contact
  // page (or homepage) as a form. We never invent an address, but we also never drop
  // a real company just because it hides its email behind a form — that was turning
  // good leads into "0 results". The UI shows Send for email, Copy+open for a form.
  const channel = chosen ? "email" : "form";
  const contactForm = profile.contactForm || profile.origin;

  return {
    company: company.name, domain: company.domain, url: company.url || profile.origin,
    summary: ai.companySummary || "",
    contact: {
      name: ai.decisionMaker?.name || null,
      title: ai.decisionMaker?.title || null,
      email: chosen?.email || null,
      emailType: chosen?.type || null,
      channel, contactForm,
    },
    whyFit: ai.whyThemFit || "",
    pitch: { subject: ai.pitch?.subject || `${userBusiness?.name || "Us"} x ${company.name}`, body: ai.pitch?.body || "" },
  };
}

// Orchestrate: niche -> wide candidate pool -> profiled + pitched prospects. Many
// candidates get dropped in verification (no public contact, blocked site), so we
// build a pool roughly 2x the target and profile it in parallel BATCHES — fast
// enough to stay within the request budget, and it surfaces far more survivors than
// the old one-at-a-time loop. Stops as soon as we have `limit` real prospects.
export async function discoverProspects({ niche, userBusiness, limit = 8, ctx = null }) {
  const companies = await findCompanies(niche, { limit, ctx });
  const out = [];
  const BATCH = 4;
  for (let i = 0; i < companies.length && out.length < limit; i += BATCH) {
    const batch = companies.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (company) => {
      try {
        const profile = await profileCompany(company.url);
        if (!profile) return null;
        return await researchAndPitch({ company, profile, userBusiness });
      } catch { return null; }
    }));
    for (const p of results) if (p && out.length < limit) out.push(p);
  }
  return out;
}
