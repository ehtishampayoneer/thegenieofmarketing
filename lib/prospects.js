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

const UA = "Mozilla/5.0 (compatible; GenieBot/1.0; +https://thegenieofmarketing.com)";
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

// Find candidate company domains for a niche. Runs a few real searches and keeps the
// domains that look like an individual brand's own site (not a marketplace/listicle).
export async function findCompanies(niche, { limit = 6, ctx = null } = {}) {
  const queries = [niche, `${niche} online store`, `best ${niche} brands`, `buy ${niche}`];
  const seen = new Set();
  const out = [];
  for (const q of queries) {
    let results = [];
    try { results = await webSearch(q, { limit: 10, ctx }); } catch {}
    for (const r of results || []) {
      const host = hostOf(r.url);
      if (!host || seen.has(host) || SKIP_HOST.test(host)) continue;
      if (host.split(".").length > 4) continue; // odd subdomains
      seen.add(host);
      out.push({ name: cleanName(r.title, host), domain: host, url: originOf(r.url) });
      if (out.length >= limit * 2) break;
    }
    if (out.length >= limit * 2) break;
  }
  return out.slice(0, limit);
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
function findContactForm(html, origin) {
  const m = /<a[^>]+href=["']([^"']*(?:contact|get-in-touch|reach-us)[^"']*)["']/i.exec(html);
  try { return m ? new URL(m[1], origin).href : null; } catch { return null; }
}

// Crawl a company's homepage + likely contact/about/team pages and gather the raw
// signals: public emails, a contact form, and the text an LLM will read to find the
// decision-maker and understand the business.
export async function profileCompany(url) {
  const origin = originOf(url);
  if (!origin) return null;
  const paths = ["", "/contact", "/contact-us", "/about", "/about-us", "/team", "/our-team", "/pages/contact"];
  const pages = await Promise.all(paths.slice(0, 6).map((p) => fetchPage(origin + p).then((h) => ({ p, h }))));
  const home = pages.find((x) => x.p === "" && x.h)?.h || pages.find((x) => x.h)?.h;
  if (!home) return null;

  const emails = new Map();
  let contactForm = null, text = "";
  for (const { p, h } of pages) {
    if (!h) continue;
    for (const e of extractEmails(h)) if (!emails.has(e.email)) emails.set(e.email, e);
    if (!contactForm) contactForm = findContactForm(h, origin);
    // Team/about/contact text feeds the decision-maker extraction.
    if (p !== "" || text.length < 1500) text += " " + h.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
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
  const channel = chosen ? "email" : (profile.contactForm ? "form" : null);
  if (!channel) return null; // nothing reachable, skip (never guess/blast)

  return {
    company: company.name, domain: company.domain, url: company.url || profile.origin,
    summary: ai.companySummary || "",
    contact: {
      name: ai.decisionMaker?.name || null,
      title: ai.decisionMaker?.title || null,
      email: chosen?.email || null,
      emailType: chosen?.type || null,
      channel, contactForm: profile.contactForm || null,
    },
    whyFit: ai.whyThemFit || "",
    pitch: { subject: ai.pitch?.subject || `${userBusiness?.name || "Us"} x ${company.name}`, body: ai.pitch?.body || "" },
  };
}

// Orchestrate: niche -> companies -> profiled + pitched prospects. Bounded + best-effort.
export async function discoverProspects({ niche, userBusiness, limit = 5, ctx = null }) {
  const companies = await findCompanies(niche, { limit, ctx });
  const out = [];
  for (const company of companies) {
    try {
      const profile = await profileCompany(company.url);
      if (!profile) continue;
      const prospect = await researchAndPitch({ company, profile, userBusiness });
      if (prospect) out.push(prospect);
    } catch {}
  }
  return out;
}
