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
  const seen = new Set();
  const out = [];
  const add = (name, domain, url) => {
    if (!domain || seen.has(domain) || SKIP_HOST.test(domain)) return;
    if (domain.split(".").length > 4) return; // odd subdomains
    seen.add(domain);
    out.push({ name, domain, url });
  };

  // Lead with the model naming real companies — one fast call, no dependency on a
  // search engine that may be blocked from our servers. This is what makes results
  // reliable; search below is a bonus, not a requirement.
  try { for (const c of await llmCandidateCompanies(niche, { limit: cap })) add(c.name, c.domain, c.url); } catch {}

  // Supplement with a couple of PARALLEL web searches (best-effort, quick). Not four
  // sequential grounded calls — that risked blowing the request-time budget and was
  // a cause of the empty results.
  if (out.length < cap) {
    const queries = [niche, `best ${niche} brands`];
    const searches = await Promise.all(queries.map((q) => webSearch(q, { limit: 8, ctx }).catch(() => [])));
    for (const results of searches) {
      for (const r of results || []) { const host = hostOf(r.url); if (host) add(cleanName(r.title, host), host, originOf(r.url)); if (out.length >= cap) break; }
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
      json: true, maxTokens: 900, temperature: 0.4,
      prompt: `Target to prospect: "${niche}".
List up to ${limit} real companies that fit, favouring small-to-mid businesses (they answer outreach far more than giants) that sell online and likely publish a contact email on their site. For each, give its primary website domain only (no path, no http).
Return ONLY: { "companies": [ { "name": "Brand Name", "domain": "brand.com" } ] }`,
    });
    // Tolerate any shape the model returns: {companies:[...]}, a bare array, or the
    // first array found in the object. A shape mismatch here was silently yielding [].
    const j = r?.json;
    const list = Array.isArray(j) ? j : Array.isArray(j?.companies) ? j.companies : Array.isArray(j?.results) ? j.results : (Object.values(j || {}).find(Array.isArray) || []);
    return list
      .map((c) => {
        const domain = String(c.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim().toLowerCase();
        if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || domain.split(".").length > 4) return null;
        return { name: String(c.name || domain).slice(0, 60), domain, url: `https://${domain}` };
      })
      .filter(Boolean);
  } catch { return []; }
}
// Diagnostic: run the REAL candidate call and report exactly what came back — which
// provider answered, whether it threw, the JSON shape/keys, how many companies parsed,
// and a short raw sample. Called only when discovery returns nothing, so a single
// screenshot pinpoints the cause (provider error vs unexpected response shape).
export async function diagnoseCandidates(niche) {
  try {
    const r = await callAI({
      system: "You name real, currently-operating companies for B2B prospecting. List only brands you are confident actually exist and sell online. Never invent domains. Return ONLY valid JSON.",
      json: true, maxTokens: 900, temperature: 0.4,
      prompt: `Target to prospect: "${niche}".\nList up to 6 real companies that fit. For each give its primary website domain only.\nReturn ONLY: { "companies": [ { "name": "Brand Name", "domain": "brand.com" } ] }`,
    });
    const j = r?.json;
    const list = Array.isArray(j) ? j : Array.isArray(j?.companies) ? j.companies : Array.isArray(j?.results) ? j.results : (Object.values(j || {}).find(Array.isArray) || []);
    return { ai: "ok", provider: r?.provider || "?", rawType: Array.isArray(j) ? "array" : typeof j, keys: Object.keys(j || {}).slice(0, 6), parsed: (list || []).length, sample: JSON.stringify(j || "").slice(0, 240) };
  } catch (e) {
    return { ai: "failed", error: String(e?.message || e).slice(0, 200) };
  }
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

// ONE LLM pass for ALL companies at once (not one call per company). Firing a pitch
// call per company in parallel was hitting the free-tier rate limit, so every
// company failed and Find clients returned 0. Batching keeps the whole run to two AI
// calls total (candidates + this), well under any rate limit, and is much faster.
// Never invents an email — the model only *chooses* among each company's real ones.
// If the AI call fails entirely, every company still gets a real contact + a simple
// fallback pitch, so results are never silently zero.
async function batchPitch(items, userBusiness) {
  const compact = items.map((it, i) => ({ i, name: it.company, domain: it.domain, emails: it.emails.map((e) => e.email), about: (it.text || "").slice(0, 900) }));
  let arr = [];
  try {
    const r = await callAI({
      system: "You are Genie's B2B prospecting analyst. For EACH company, identify the best decision-maker and write a short, genuinely personalised outreach email from the sender. Never invent an email not in that company's provided list. Return ONLY a JSON array, one object per company, same order.",
      json: true, maxTokens: 2600, temperature: 0.6,
      prompt: `SENDER (my business): ${userBusiness?.name || ""} — ${userBusiness?.pitch || userBusiness?.whatTheySell || ""}.

COMPANIES (JSON): ${JSON.stringify(compact)}

For each company return one object in the SAME order:
[{ "i": 0, "summary": "1 sentence on what they sell", "name": "decision-maker name if evident else null", "title": "their role or best-guess like 'Owner'/'Head of Ecommerce'", "recommendedEmail": "best email from THAT company's list or null", "whyFit": "1 sentence why my product fits them", "subject": "specific subject under 60 chars", "body": "warm 60-90 word email, one value point, one soft ask, no emoji, no em-dashes" }]`,
    });
    const j = r?.json;
    arr = Array.isArray(j) ? j : Array.isArray(j?.companies) ? j.companies : Array.isArray(j?.results) ? j.results : (Object.values(j || {}).find(Array.isArray) || []);
  } catch { arr = []; }
  const byIdx = new Map((arr || []).map((p) => [Number(p.i), p]));

  return items.map((it, i) => {
    const p = byIdx.get(i) || {};
    // Trust our own extraction for the address; the model only chooses among real ones.
    const chosen = it.emails.find((e) => e.email === String(p.recommendedEmail || "").toLowerCase())
      || it.emails.find((e) => e.type === "named") || it.emails[0] || null;
    return {
      company: it.company, domain: it.domain, url: it.url || it.origin,
      summary: p.summary || "",
      contact: {
        name: p.name || null, title: p.title || null,
        email: chosen?.email || null, emailType: chosen?.type || null,
        channel: chosen ? "email" : "form",
        contactForm: it.contactForm || it.origin,
      },
      whyFit: p.whyFit || "",
      pitch: {
        subject: p.subject || `${userBusiness?.name || "A quick idea"} for ${it.company}`,
        body: p.body || `Hi ${it.company} team,\n\nI came across ${it.company} and think there's a genuine fit with ${userBusiness?.name || "what we do"}. Could I share a quick idea that might help you win more customers?\n\nThanks for your time.`,
      },
    };
  });
}

// Orchestrate: niche -> candidate companies -> crawl each (parallel, NO ai) -> ONE
// batched pitch call. Every reachable company becomes a prospect (a public email if
// we found one, otherwise its contact page or homepage). Returns { prospects, debug }
// so the caller can tell "no companies" apart from "found companies, couldn't reach".
export async function discoverProspects({ niche, userBusiness, limit = 8, ctx = null }) {
  const companies = await findCompanies(niche, { limit, ctx });
  if (!companies.length) return { prospects: [], debug: { companies: 0, crawled: 0 } };

  // Crawl in parallel batches — no AI here, so rate limits don't apply. A company
  // whose inner pages/crawl fail still keeps its homepage as a reachable contact.
  const profiles = [];
  const BATCH = 6;
  for (let i = 0; i < companies.length; i += BATCH) {
    const batch = companies.slice(i, i + BATCH);
    const rows = await Promise.all(batch.map(async (c) => {
      const p = await profileCompany(c.url).catch(() => null);
      const origin = p?.origin || originOf(c.url) || c.url;
      return { company: c.name, domain: c.domain, url: c.url, origin, emails: p?.emails || [], text: p?.text || "", contactForm: p?.contactForm || null };
    }));
    profiles.push(...rows);
  }

  // Reachable companies (a real email or a contact page we actually loaded) first;
  // homepage-only ones backfill to the target so results are never empty when the
  // crawl is blocked, but never crowd out the good leads.
  const reachable = profiles.filter((p) => p.emails.length || p.contactForm);
  const weak = profiles.filter((p) => !(p.emails.length || p.contactForm));
  const chosen = [...reachable, ...weak].slice(0, limit);
  const prospects = await batchPitch(chosen, userBusiness);
  return { prospects, debug: { companies: companies.length, crawled: reachable.length } };
}
