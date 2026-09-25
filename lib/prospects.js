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
import { scoreDomains } from "@/lib/authority";
import { detectPlatform, platformFit, detectRivalTech, rivalAngle, byRivalOpportunity, readableForAr, rivalCategory } from "@/lib/platform-detect";
import { rankByRole, roleFit } from "@/lib/role-fit";

// OpenPageRank 6+ is what authorityLabel calls a "Major site".
const MAJOR_SITE = 6;

// A real browser UA — many sites 403 an obvious bot UA (verified against live rug
// retailers: rugsusa.com returned 403 to a bot UA, 200 to this one). We only fetch
// public homepage/contact/about pages, politely and shallowly.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
// Domains that are never a single company we'd pitch (marketplaces, socials, press…).
// Whole domains only. As bare fragments, "etsy" dropped betsyfurniture.com,
// "x\.com" dropped anything ending in box.com or fox.com, and "medium" dropped
// any company with the word in its name: real prospects silently discarded.
// "shopify\.com" also used to match every store on *.myshopify.com, which for an
// owner selling to Shopify merchants removed the best prospects there are.
const SKIP_HOST = /(^|\.)(wikipedia\.org|amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|aliexpress\.com|alibaba\.com|pinterest\.[a-z.]+|instagram\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|reddit\.com|quora\.com|yelp\.[a-z.]+|tripadvisor\.[a-z.]+|medium\.com|forbes\.com|nytimes\.com|shopify\.com|wordpress\.com|blogspot\.com|google\.[a-z.]+|bing\.com|duckduckgo\.com|g2\.com|capterra\.com|trustpilot\.com|glassdoor\.[a-z.]+|indeed\.com|crunchbase\.com|producthunt\.com)$/i;
const BAD_EMAIL = /(noreply|no-reply|donotreply|example\.|sentry|wixpress|\.png|\.jpg|\.gif|\.webp|@sentry|@2x|@example|your-?email|email@|name@)/i;

// ── THE ADDRESS IN THE FORM FIELD IS NOT A CUSTOMER ──
// Reading further down the page found real contact addresses, and also found the
// greyed-out examples inside newsletter and contact forms: "your@email.com" on one
// retailer, "max@domain.de" on another. Both look exactly like an address a company
// published. Emailing one is a guaranteed bounce, and bounces are what mailbox
// providers use to decide the sender is a spammer — so a single one of these can
// push the owner's real mail into spam for everybody else.
const PLACEHOLDER_DOMAIN = /^(example|domain|yourdomain|your-domain|yourcompany|your-company|mycompany|mydomain|company|email|mail|test|sample|acme|beispiel|firma|musterfirma)\.[a-z.]{2,}$/i;
const PLACEHOLDER_LOCAL = /^(your|you|yourname|your-name|name|firstname|lastname|vorname|nachname|max|maxmustermann|mustermann|musterfrau|john|johndoe|jane|janedoe|test|demo|sample|user|username|nom|prenom|nombre|beispiel|email|e-mail|mail)$/i;

/** Is this the example inside a form rather than a real address? */
export function isPlaceholderEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return true;
  return PLACEHOLDER_LOCAL.test(e.slice(0, at)) || PLACEHOLDER_DOMAIN.test(e.slice(at + 1));
}
const ROLE_LOCAL = /^(info|sales|hello|contact|support|admin|team|office|enquir|inquir|help|marketing|press|media|orders?)@/i;

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; } }
function originOf(u) { try { return new URL(u).origin; } catch { return null; } }

// ── WHY THIS NUMBER IS NOT 400,000 ──
// It was, and that single constant was quietly costing most of the prospect list.
// A modern retail page carries enormous inline JSON and script before its footer,
// and the contact details live in that footer. Measured on real sites: Höffner
// publishes its address at character 425,416 of a 468KB page, and Segmüller at
// 512,095 of 1.3MB. Both were fetched successfully, both were cut off a few
// thousand characters before the only thing Genie was looking for, and both were
// reported as "no contact found" — which is indistinguishable from a company that
// publishes nothing.
//
// Two megabytes covers every page met in testing with room to spare, and the cap
// still exists so one pathological page cannot exhaust the function.
const MAX_PAGE = 2_000_000;

async function fetchPage(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(9000) });
    if (!r.ok || !/text\/html/i.test(r.headers.get("content-type") || "")) return null;
    return (await r.text()).slice(0, MAX_PAGE);
  } catch { return null; }
}

// Find candidate company domains for a niche. Two sources work TOGETHER, deduped:
//   1. Real web search (Brave when configured — reliable from Vercel — then DDG).
//   2. An LLM that NAMES real companies + their domains for the niche.
// Both feed one candidate pool. Neither is trusted blindly — every candidate is
// verified downstream by crawling its own site for a real deliverable contact, so a
// wrong or dead domain is simply dropped. Running both widens the pool, which is
// what lifts the number of real people that survive verification.
/** What makes a good prospect for THIS owner, from their scan and onboarding brief. */
export function fitFrom(ai = {}) {
  const b = ai?.brief || {};
  return {
    market: String(ai?.primaryMarket || "").trim(),
    signals: Array.isArray(b.idealSignals) ? b.idealSignals.slice(0, 5) : [],
    avoid: Array.isArray(b.disqualifiers) ? b.disqualifiers.slice(0, 5) : [],
  };
}

export async function findCompanies(niche, { limit = 8, ctx = null, fit = null } = {}) {
  const cap = limit * 2;
  const seen = new Set();
  const out = [];
  const add = (name, domain, url) => {
    if (!domain || seen.has(domain) || SKIP_HOST.test(domain)) return;
    if (domain.split(".").length > 4) return; // odd subdomains
    seen.add(domain);
    out.push({ name, domain, url });
  };

  // ── THE BIG FISH FIRST ──
  // Web search and a model both return whoever wrote the best page about
  // themselves. Neither has any idea who is LARGE, so the list skewed small every
  // night and nothing about the results looked wrong — they were simply never the
  // companies worth the most. Public company records know: that this is a
  // furniture retail chain, that it employs fourteen thousand people, that it
  // operates in Germany. Free, no key, and it adds names ahead of the others so
  // the chain is profiled before the shop down the road.
  //
  // It supplies a NAME and a WEBSITE only. The contact address is still read off
  // that company's own site exactly as before, so provenance is untouched: Genie
  // has not learned a new way to get an email, only a better way to choose whose.
  try {
    const { bigCompanies } = await import("@/lib/wikidata");
    for (const c of await bigCompanies(niche, { limit: Math.max(6, Math.round(cap / 2)) })) {
      add(c.name, c.domain, c.website);
    }
  } catch {}

  // The model naming real companies is the reliable source (one robust call). We do
  // NOT lead with grounded web search anymore — it used the same Gemini budget these
  // calls need and returned little, which contributed to the empty results.
  for (const c of await llmCandidateCompanies(niche, { limit: cap, fit })) add(c.name, c.domain, c.url);

  // Only if the model somehow gave us almost nothing, try one plain web search as a
  // backstop (best-effort, never blocks).
  if (out.length < 3) {
    try {
      const results = await webSearch(niche, { limit: 8, ctx });
      for (const r of results || []) { const host = hostOf(r.url); if (host) add(cleanName(r.title, host), host, originOf(r.url)); if (out.length >= cap) break; }
    } catch {}
  }
  // Drop household names by measurement, not by asking the model to avoid them.
  // A model naming companies from memory reaches for the famous ones (a live test
  // for "furniture retailers" returned Wayfair, Overstock and Article), and a
  // national chain will not answer a small vendor's cold email. OpenPageRank marks
  // them as major sites. Only applied when enough smaller companies remain, and
  // unscored domains are kept: unknown is not the same as big.
  try {
    const scores = await scoreDomains(out.map((c) => c.domain));
    if (scores.size) {
      const small = out.filter((c) => !(scores.get(c.domain)?.score >= MAJOR_SITE));
      if (small.length >= Math.min(3, out.length)) return small.slice(0, cap);
    }
  } catch {}
  return out.slice(0, cap);
}

// Pull an array out of any shape the model returns: a bare array, {companies},
// {results}, or the first array value in the object.
function firstArray(j) {
  return Array.isArray(j) ? j : Array.isArray(j?.companies) ? j.companies : Array.isArray(j?.results) ? j.results : (Object.values(j || {}).find(Array.isArray) || []);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run a JSON list-generating AI call ROBUSTLY. Two real failure modes we hit:
//   1. Gemini 2.5-flash returns a valid-but-EMPTY {"companies":[]} here, which
//      callAI counts as success and never fails over.
//   2. Groq (free) hits a 30s rate-limit cooldown mid-flow, so a single Groq attempt
//      can momentarily return nothing — the diagnostic works only because it runs
//      seconds later once Groq recovers.
// Fix: exclude Gemini and let callAI fail over Groq -> OpenRouter (OpenRouter is the
// user's PAID, non-rate-limited backstop). If still empty (transient), short backoff
// and retry; then, only as a last resort, the full chain including Gemini.
// The paid backstop is the router's "openrouter-paid" provider (lib/ai-router.js),
// which is priced and capped per day. Model: OPENROUTER_PAID_MODEL.

export async function aiList(opts) {
  const attempt = async (only, extra = {}) => { try { return firstArray((await callAI({ ...opts, ...extra, only }))?.json); } catch { return []; } };
  let list = await attempt(["groq", "openrouter"]);
  if (!list.length) { await sleep(1000); list = await attempt(["groq", "openrouter"]); }
  // Then Gemini and anything else free, and only then the OpenRouter credit. This
  // used to call paid gpt-4o-mini through a model override the daily spend cap
  // never counted; the router's openrouter-paid provider is capped and priced.
  if (!list.length) list = await attempt(null);
  if (!list.length) { await sleep(1200); list = await attempt(["openrouter-paid"]); }
  return list;
}

// Ask the model to name real, currently-operating companies for the niche and give
// each one's primary domain. We prefer small/mid businesses (more reachable than
// giants). Every candidate is verified downstream by crawling its own site, so this
// can be generous without risking fake contacts.
// Turn a raw list of {name,domain} into clean candidates (validate + normalise the
// domain, never invent one). Shared by discovery and the diagnostic so both parse
// identically.
export function mapCompanies(list) {
  return (list || [])
    .map((c) => {
      const domain = String(c?.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim().toLowerCase();
      if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || domain.split(".").length > 4) return null;
      return { name: String(c?.name || domain).slice(0, 60), domain, url: `https://${domain}` };
    })
    .filter(Boolean);
}

async function llmCandidateCompanies(niche, { limit = 10, fit = null } = {}) {
  const f = fit || {};
  const list = await aiList({
    system: "You name real, currently-operating companies for B2B prospecting. List only brands you are confident actually exist and sell online. Never invent domains. Return ONLY valid JSON.",
    json: true, maxTokens: 1500, temperature: 0.5,
    prompt: `Target to prospect: "${niche}".${f.market ? `\nMarket: ${f.market}. Prefer companies operating there.` : ""}${f.signals?.length ? `\nA good fit shows: ${f.signals.join("; ")}.` : ""}${f.avoid?.length ? `\nDo not include: ${f.avoid.join("; ")}.` : ""}
List up to ${limit} real companies that fit. Independent and regional businesses only: no household-name national chains, no marketplaces, no public companies. Those never answer a small vendor's email; owner-run and mid-sized businesses do. They should sell online and publish a contact email on their site. For each, give its primary website domain only (no path, no http).
Return ONLY: { "companies": [ { "name": "Brand Name", "domain": "brand.com" } ] }`,
  });
  return mapCompanies(list);
}
// Diagnostic AND recovery path: run the candidate call and return BOTH the metadata
// (for the UI diagnostic) and the actual companies. When the main discovery path
// yields 0 (a transient provider hiccup), the route builds prospects from these — so
// whatever the AI names, we use it, instead of showing an empty page.
export async function diagnoseCandidates(niche) {
  try {
    const r = await callAI({
      system: "You name real, currently-operating companies for B2B prospecting. List only brands you are confident actually exist and sell online. Never invent domains. Return ONLY valid JSON.",
      json: true, maxTokens: 1200, temperature: 0.4,
      prompt: `Target to prospect: "${niche}".\nList up to 10 real companies that fit. For each give its primary website domain only.\nReturn ONLY: { "companies": [ { "name": "Brand Name", "domain": "brand.com" } ] }`,
    });
    const j = r?.json;
    const list = firstArray(j);
    return { ai: "ok", provider: r?.provider || "?", rawType: Array.isArray(j) ? "array" : typeof j, keys: Object.keys(j || {}).slice(0, 6), parsed: (list || []).length, sample: JSON.stringify(j || "").slice(0, 240), companies: mapCompanies(list) };
  } catch (e) {
    return { ai: "failed", error: String(e?.message || e).slice(0, 200), companies: [] };
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
    if (!e || BAD_EMAIL.test(e) || isPlaceholderEmail(e) || e.length > 100 || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) return;
    if (!found.has(e)) found.set(e, { email: e, type: ROLE_LOCAL.test(e) ? "role" : "named" });
  };
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) add(decodeURIComponent(m[1]));
  for (const m of html.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) add(m[0]);
  // Written "info (at) example.com" or "info [at] example [dot] com" to dodge
  // scrapers. A person reads it without noticing; it is still an address the
  // company published itself, on its own site, for exactly this purpose.
  for (const m of html.matchAll(/([a-z0-9._%+-]+)\s*(?:\[|\()\s*at\s*(?:\]|\))\s*([a-z0-9.-]+)\s*(?:(?:\[|\()\s*dot\s*(?:\]|\))\s*([a-z]{2,}))?/gi)) {
    const domain = m[3] ? `${m[2]}.${m[3]}` : m[2];
    if (/\.[a-z]{2,}$/i.test(domain)) add(`${m[1]}@${domain}`);
  }
  return [...found.values()];
}
// Read the site's OWN contact/about/team links off a page, so we adapt to each
// site's structure (Shopify /pages/contact-us, custom /get-in-touch, etc.) instead
// of guessing a fixed path list. Returns absolute URLs, contact/reach links first.
// Pages that actually carry an address rank first. Impressum sits with contact
// rather than below it: in Germany, Austria and Switzerland it is the page that
// legally has to have the address, not a formality.
function contactRank(u) {
  if (/contact|kontakt|impressum|imprint|legal-notice|contacto|contatti|nous-contacter|contato|get-in-touch|reach|write-for-us|contribute|guest-post|pitch|editor|advertise/i.test(u)) return 0;
  if (/about|story|team|company|ueber-uns|über-uns|chi-siamo|a-propos|quienes/i.test(u)) return 1;
  return 2;
}

function discoverContactLinks(html, origin) {
  const hits = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    const href = m[1];
    // Contact/about, plus editorial pages that matter for earned media (guest posts,
    // pitching an editor, getting listed).
    // English, plus the words the rest of the world uses. A German retailer's
    // contact details live on /impressum and nowhere else — it is legally required
    // to exist and legally required to carry a real address — and Genie was walking
    // straight past it on every European prospect.
    if (!/(contact|get-in-touch|reach-us|reach-out|about|our-story|our-team|team|company|support|help|write-for-us|write_for_us|contribute|contributor|guest-post|pitch|editor|advertise|work-with|impressum|kontakt|ueber-uns|über-uns|contacto|contactenos|cont[aá]ctanos|contatti|chi-siamo|nous-contacter|nous-joindre|a-propos|contato|fale-conosco|imprint|legal-notice)/i.test(href)) continue;
    try { const u = new URL(href, origin).href; if (u.startsWith(origin)) hits.push(u); } catch {}
  }
  // Reach/submit pages first (best for the "form" fallback), then about/team.
  // Impressum ranks with contact rather than below it: in Germany, Austria and
  // Switzerland it is the page that actually has the address, not a formality.
  return [...new Set(hits)].sort((a, b) => contactRank(a) - contactRank(b));
}

// Crawl a company's homepage + the contact/about pages IT links to, and gather the
// raw signals: public emails, a reachable contact page, and the text an LLM reads to
// find the decision-maker and understand the business. A contact page is always
// resolved (its own link, or a common fallback path) so the company stays reachable
// even when no email is published in the HTML — which is the common case.
export async function profileCompany(url, { rivalCat = null } = {}) {
  const origin = originOf(url);
  if (!origin) return null;
  const home = await fetchPage(origin + "/");
  if (!home) return null;

  const discovered = discoverContactLinks(home, origin);
  const fallbackPaths = [
    "/contact", "/contact-us", "/pages/contact", "/pages/contact-us",
    // Required by law in the German-speaking countries, and always carries a real
    // business address. The single highest-yield page on a European site.
    "/impressum", "/kontakt",
    "/contacto", "/contatti", "/nous-contacter", "/contato",
    "/about", "/about-us", "/write-for-us", "/contribute", "/advertise",
  ];
  // ── RANK THE WHOLE SET, NOT JUST THE LINKS THE PAGE OFFERED ──
  // These were merged and then cut at eight, with the homepage's own links first.
  // A retailer that links to about, support, help, company and our-story filled
  // every slot before /impressum was reached — and impressum is the one page on a
  // German site that is legally required to carry a real address. Measured: three
  // German retailers all publish an address there, and Genie fetched none of them.
  // Ranking the combined list puts the pages that actually have an address first,
  // whichever list they came from.
  const urls = [...new Set([...discovered, ...fallbackPaths.map((p) => origin + p)])]
    .sort((a, b) => contactRank(a) - contactRank(b))
    .slice(0, 10);
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
  const contactForm = fetched.find((x) => x.h && /contact|get-in-touch|reach|write-for-us|contribute|pitch|advertise/i.test(x.u))?.u || discovered[0] || null;
  const ogTitle = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(home)?.[1]
    || /<title[^>]*>([^<]+)</i.exec(home)?.[1] || "";
  // The homepage was fetched to find a published address; the platform is visible
  // in that same HTML because a storefront has to serve it. No extra request.
  const platform = detectPlatform(home);
  // ── AND WHETHER ANYONE HAS ALREADY SOLVED IT FOR THEM ──
  // "Furniture retailer on Shopify" is a list of thousands. "Furniture retailer on
  // Shopify whose customers still cannot see the sofa in their room" is a list
  // where the pitch has no rival. Same HTML, already in hand, no extra request.
  const ar = detectRivalTech(home, rivalCat);
  // An address on the company's OWN domain outranks anything else found on the
  // page — a third party's address in a footer credit is not this company's
  // contact, and an address at their own domain is unambiguously theirs.
  const ownHost = hostOf(origin);
  const ranked = [...emails.values()].sort((a, b) => {
    const mine = (x) => (ownHost && String(x.email).endsWith(`@${ownHost}`) ? 0 : 1);
    return mine(a) - mine(b);
  });

  return {
    origin, emails: ranked, contactForm,
    text: text.trim().slice(0, 6000), siteName: ogTitle.trim(),
    platform, ar: rivalAngle(ar, platform, { readable: readableForAr(home), category: rivalCat }), rivalTech: ar,
  };
}

// ONE LLM pass for ALL companies at once (not one call per company). Firing a pitch
// call per company in parallel was hitting the free-tier rate limit, so every
// company failed and Find clients returned 0. Batching keeps the whole run to two AI
// calls total (candidates + this), well under any rate limit, and is much faster.
// Never invents an email — the model only *chooses* among each company's real ones.
// If the AI call fails entirely, every company still gets a real contact + a simple
// fallback pitch, so results are never silently zero.
async function batchPitch(items, userBusiness) {
  // The platform goes in with everything else. A first line that names what their
  // store actually runs is the cheapest proof there is that a human looked before
  // writing, and it costs nothing to know: it was read off the page already
  // fetched to find their address.
  const compact = items.map((it, i) => ({
    i, name: it.company, domain: it.domain,
    emails: it.emails.map((e) => e.email),
    runs: it.platform?.label || null,
    // What their site already does about the problem, and therefore which of
    // three completely different emails this is.
    angle: it.ar?.note || null,
    // Timing. The one thing no list can give you, and the hardest opener to fake.
    news: it.news ? `${it.news.headline} (they ${it.news.why})` : null,
    about: (it.text || "").slice(0, 900),
  }));
  const arr = await aiList({
    system: "You are Genie's B2B prospecting analyst. For EACH company, identify the best decision-maker and write a short, genuinely personalised outreach email from the sender. Never invent an email not in that company's provided list. Return ONLY a JSON array, one object per company, same order.",
    json: true, maxTokens: 4000, timeoutMs: 40000, temperature: 0.6,
    prompt: `SENDER (my business): ${userBusiness?.name || ""} — ${userBusiness?.pitch || userBusiness?.whatTheySell || ""}.
${userBusiness?.brief || ""}

COMPANIES (JSON): ${JSON.stringify(compact)}

When a company has "runs", that is the platform their shop is genuinely built on, read from their own site. Mention it naturally in the FIRST line where it fits — it is the clearest proof a person looked before writing. Never mention it when "runs" is null, and never guess it.

"news" is something that genuinely happened at this company in the last few weeks. When it is there, open by referring to it naturally, in your own words, as something you noticed — never quote it back at them, never say you read the news, and drop it entirely if it does not connect honestly to what you are offering. When it is null, open normally: an invented opener is far worse than none.

"angle" is what was found on their site about the problem you solve, and it decides what this email can honestly say. Follow it exactly. If it says they already use a named product, do NOT explain why the category matters — they bought that argument years ago, and repeating it proves you did not look. If it says the gap is open, lead with the problem they live with rather than with your technology. Never claim they have something the angle does not say they have, and never claim they lack something it does not say they lack.

For each company return one object in the SAME order:
[{ "i": 0, "summary": "1 sentence on what they sell", "name": "decision-maker name if evident else null", "title": "their role or best-guess like 'Owner'/'Head of Ecommerce'", "recommendedEmail": "best email from THAT company's list or null", "whyFit": "1 sentence on fit, judged against the owner's target segments, fit signals and who-not-to-target. Start with \"Weak fit:\" when they match who not to target or show none of the signals", "subject": "specific subject under 60 chars", "body": "warm 60-90 word email, one value point, one soft ask, no emoji, no em-dashes" }]`,
  });
  const byIdx = new Map((arr || []).map((p) => [Number(p.i), p]));

  return items.map((it, i) => {
    const p = byIdx.get(i) || {};
    // Trust our own extraction for the address; the model only chooses among real ones.
    // Whose job this is decides who gets written to. careers@ and legal@ are
    // dropped outright; a named person beats a sales desk beats info@. The model's
    // pick is honoured only if it survives the same test.
    const ranked = rankByRole(it.emails, { purpose: "offer" });
    const suggested = it.emails.find((e) => e.email === String(p.recommendedEmail || "").toLowerCase());
    const chosen = (suggested && roleFit(suggested.email, { purpose: "offer" }).ok ? suggested : null)
      || ranked[0] || null;
    return {
      company: it.company, domain: it.domain, url: it.url || it.origin,
      platform: it.platform?.id || null, platformLabel: it.platform?.label || null,
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

// Given a list of {name,domain,url}, crawl each (parallel, NO ai) then write all the
// pitches in ONE batched call. Every reachable company becomes a prospect (a public
// email if found, else its contact page, else its homepage). Reusable so the route
// can recover from the companies the diagnostic found if the main path came up empty.
export async function buildProspectsFromCompanies(companies, userBusiness, limit = 8, { needsPlatform = null, rivalCat = null } = {}) {
  if (!companies?.length) return [];
  const profiles = [];
  const BATCH = 6;
  for (let i = 0; i < companies.length; i += BATCH) {
    const batch = companies.slice(i, i + BATCH);
    const rows = await Promise.all(batch.map(async (c) => {
      const p = await profileCompany(c.url, { rivalCat }).catch(() => null);
      const origin = p?.origin || originOf(c.url) || c.url;
      // Something true and recent worth opening with. Null far more often than
      // not, and an email with no opener is the normal case — an invented one is
      // worse than none. Never blocks: unreachable means nobody gets an opener.
      let news = null;
      try {
        const { recentSignal } = await import("@/lib/news-signals");
        news = await recentSignal(c.name);
      } catch {}
      return { company: c.name, domain: c.domain, url: c.url, origin, emails: p?.emails || [], text: p?.text || "", contactForm: p?.contactForm || null, platform: p?.platform || null, ar: p?.ar || null, rivalTech: p?.rivalTech || null, news };
    }));
    profiles.push(...rows);
  }
  // ── DOES THE OFFER EVEN APPLY TO THEM? ──
  // When the product is FOR a platform, a shop on a different one cannot act on
  // the pitch however well it reads, and a pitch they cannot act on is worse than
  // silence: it spends the one first impression on something irrelevant. Only a
  // KNOWN mismatch is dropped — a storefront that hides what it runs stays in,
  // because unknown is not a no and skipping it would quietly bin a slice of
  // every list without the sender ever knowing which slice.
  let usable = profiles;
  if (needsPlatform) {
    const kept = profiles.filter((p) => platformFit(p.platform, needsPlatform).ok);
    if (kept.length) usable = kept;
  }

  // ── THE OPEN GAP GOES FIRST ──
  // Nobody is dropped for already having a rival's technology: those are the
  // companies with a proven budget and a champion inside, and binning them would
  // throw away the whole displacement list. They simply go last, and get a
  // completely different email — one that never explains why AR is useful to
  // someone who bought that argument years ago.
  usable = byRivalOpportunity(usable);

  // Reachable companies (a real email or a contact page we actually loaded) first;
  // homepage-only ones backfill so results are never empty when the crawl is blocked.
  const reachable = usable.filter((p) => p.emails.length || p.contactForm);
  const weak = usable.filter((p) => !(p.emails.length || p.contactForm));
  const chosen = [...reachable, ...weak].slice(0, limit);
  return batchPitch(chosen, userBusiness);
}

// Orchestrate: niche -> candidate companies -> prospects. Returns { prospects, debug }
// so the caller can tell "no companies" apart from "found companies, couldn't reach".
export async function discoverProspects({ niche, userBusiness, limit = 8, ctx = null, fit = null, needsPlatform = null, rivalCat = null }) {
  const companies = await findCompanies(niche, { limit, ctx, fit });
  const prospects = await buildProspectsFromCompanies(companies, userBusiness, limit, { needsPlatform, rivalCat });
  return { prospects, debug: { companies: companies.length } };
}
