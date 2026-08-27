// lib/foundation.js
// ── FOUNDATION LINKS ──
// A curated checklist of high-authority, free profile/directory sites where a brand
// should exist. Each profile is a real backlink + a place Google and AI answer engines
// pick up your brand entity. Genie writes the bios; you create the accounts (signup +
// CAPTCHA can't be automated) and mark them done. Where a profile URL is predictable,
// Genie can verify it's live. Progress persists per user.

// Curated set — free to join, high domain authority, and useful across most businesses.
// `conditional` ones matter mainly for software/SaaS.
export const FOUNDATION_SITES = [
  { id: "crunchbase", name: "Crunchbase", url: "https://www.crunchbase.com/register", cat: "Company", why: "High-authority company profile that shows in Google + AI answers." },
  { id: "aboutme", name: "About.me", url: "https://about.me/signup", cat: "Brand", why: "A clean one-page brand hub that links to your site." },
  { id: "producthunt", name: "Product Hunt", url: "https://www.producthunt.com/", cat: "Product", why: "Product listing, launch traffic, and a backlink." },
  { id: "gravatar", name: "Gravatar", url: "https://gravatar.com/", why: "A global profile linked everywhere your email appears.", cat: "Brand" },
  { id: "wellfound", name: "Wellfound (AngelList)", url: "https://wellfound.com/", cat: "Company", why: "Startup/company profile + talent presence." },
  { id: "f6s", name: "F6S", url: "https://www.f6s.com/", cat: "Company", why: "Startup profile + founder network + backlink." },
  { id: "medium", name: "Medium", url: "https://medium.com/", cat: "Content", why: "Republish articles with a canonical link back (parasite SEO)." },
  { id: "github", name: "GitHub (org)", url: "https://github.com/organizations/plan", cat: "Brand", why: "Organization page with your website link; very high DA." },
  { id: "linkedin", name: "LinkedIn Company Page", url: "https://www.linkedin.com/company/setup/new/", cat: "Social", why: "Authority + owns your Google brand search." },
  { id: "trustpilot", name: "Trustpilot", url: "https://business.trustpilot.com/signup", cat: "Reviews", why: "Reviews profile that builds buyer + Google trust." },
  { id: "reddit", name: "Reddit profile", url: "https://www.reddit.com/settings/profile", cat: "Social", why: "Profile with your link; the base for community + Perplexity citations." },
  { id: "quora", name: "Quora", url: "https://www.quora.com/", cat: "Social", why: "Profile + answer authority; feeds AI answers." },
  { id: "youtube", name: "YouTube channel", url: "https://www.youtube.com/create_channel", cat: "Content", why: "Channel + description link; the 2nd biggest search engine." },
  { id: "pinterest", name: "Pinterest Business", url: "https://www.pinterest.com/business/create/", cat: "Social", why: "Evergreen visual-search backlink." },
  { id: "substack", name: "Substack", url: "https://substack.com/", cat: "Content", why: "Newsletter presence + backlink." },
  { id: "indiehackers", name: "Indie Hackers", url: "https://www.indiehackers.com/", cat: "Company", why: "Founder profile + a community that buys." },
  { id: "g2", name: "G2 (if software)", url: "https://www.g2.com/products/new", cat: "Reviews", why: "Software listing + reviews; huge for SaaS.", conditional: true },
  { id: "capterra", name: "Capterra (if software)", url: "https://www.capterra.com/vendors/sign-up", cat: "Reviews", why: "Software directory + reviews.", conditional: true },
];

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
function firstSentences(text, n) {
  const parts = clean(text).split(/(?<=[.!?])\s+/).slice(0, n);
  return parts.join(" ");
}

// Build three ready-to-paste bios from the business profile — no AI needed, so it's
// instant and reliable. The pitch/what-they-sell text carries the substance.
export function buildBios(business) {
  const name = clean(business?.name) || "Our brand";
  const pitch = clean(business?.pitch || business?.whatTheySell);
  const site = clean(business?.website);
  const tagline = pitch ? firstSentences(pitch, 1).slice(0, 110) : `${name} — see what we do${site ? " at " + hostOnly(site) : ""}.`;
  const short = pitch
    ? `${name}: ${firstSentences(pitch, 1)}`.slice(0, 160)
    : `${name}. ${site ? "Learn more at " + hostOnly(site) + "." : ""}`.trim();
  const long = [
    pitch ? `${name} — ${firstSentences(pitch, 2)}` : `${name} helps its customers get results.`,
    site ? `Learn more at ${site}.` : "",
  ].filter(Boolean).join(" ").slice(0, 400);
  return { tagline: clean(tagline), short: clean(short), long: clean(long), website: site };
}

function hostOnly(u) { try { return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return u; } }
