// lib/platform-detect.js
// ── WHAT IS THIS SHOP ACTUALLY BUILT ON? ──
//
// "A furniture shop" and "a furniture shop that definitely runs Shopify" are two
// different prospects. The second one can be told, in the first line, that this
// works on the platform they are already using — and that single fact does more
// for a reply than any amount of rewriting, because it proves the sender looked.
//
// It also decides which pitch is honest. If the product is a Shopify app and the
// shop runs WooCommerce, the right outcome is not a better email, it is no email:
// a pitch they cannot act on is worse than silence, because it spends the one
// first impression on something irrelevant.
//
// COSTS NOTHING. Every prospect's homepage is already fetched to find a published
// contact address (lib/prospects.js → profileCompany). The platform is visible in
// that same HTML, which shops publish because their storefront needs it. No extra
// request, no third-party service, no API key.
//
// IT IS EVIDENCE, NOT CERTAINTY. Headless storefronts and heavy caching can hide
// a platform completely, so "unknown" is a real answer and is never treated as a
// no. Nothing is skipped for lack of a detection — only for a detected platform
// that genuinely does not fit.

// Ordered: the first match wins, so the most specific fingerprint comes first.
// Each signal is something the storefront itself serves, not a guess from a name.
const PLATFORMS = [
  { id: "shopify", label: "Shopify", signals: [/cdn\.shopify\.com/i, /cdn\/shop\/(files|t)\//i, /Shopify\.theme/i, /myshopify\.com/i, /shopify-section/i, /window\.Shopify/i] },
  { id: "woocommerce", label: "WooCommerce", signals: [/wp-content\/plugins\/woocommerce/i, /woocommerce-page/i, /wc-ajax/i, /class=["'][^"']*woocommerce/i] },
  { id: "bigcommerce", label: "BigCommerce", signals: [/cdn\d*\.bigcommerce\.com/i, /bigcommerce\.com\/s-/i, /stencil-utils/i] },
  { id: "magento", label: "Magento", signals: [/\/static\/version\d+\/frontend\//i, /Magento_/i, /mage\/cookies/i] },
  { id: "squarespace", label: "Squarespace", signals: [/static\d*\.squarespace\.com/i, /squarespace-cdn\.com/i, /Static\.SQUARESPACE_CONTEXT/i] },
  { id: "wix", label: "Wix", signals: [/static\.parastorage\.com/i, /wixstatic\.com/i, /X-Wix-/i] },
  { id: "webflow", label: "Webflow", signals: [/assets(-global)?\.website-files\.com/i, /data-wf-site=/i] },
  { id: "wordpress", label: "WordPress", signals: [/wp-content\//i, /wp-includes\//i] },
];

/**
 * Read the platform off a page's HTML.
 * @returns {{id, label, confident}|null} null when nothing identifiable is there.
 */
export function detectPlatform(html) {
  const s = String(html || "");
  if (s.length < 40) return null;
  for (const p of PLATFORMS) {
    const hits = p.signals.filter((re) => re.test(s)).length;
    if (hits > 0) {
      // WooCommerce sits on WordPress, so a WordPress match alone is the weakest
      // claim here and is reported as such rather than as a shop platform.
      return { id: p.id, label: p.label, confident: hits > 1 || p.id !== "wordpress" };
    }
  }
  return null;
}

/**
 * Should Genie write to this company at all, given what the owner sells?
 *
 * `wants` is the platform the product needs, if any — read from the plan rather
 * than hardcoded, because a business that sells to everyone has no such
 * requirement and must not be filtered by one.
 *
 * @returns {{ok, reason, platform}} ok:false only when the platform is KNOWN and wrong.
 */
export function platformFit(detected, wants) {
  const need = String(wants || "").trim().toLowerCase();
  if (!need) return { ok: true, platform: detected?.id || null, reason: "" };

  if (!detected) {
    // Headless storefronts and aggressive caching hide the platform entirely.
    // Unknown is not a no: skipping these would quietly throw away a slice of
    // every list, and the sender would never know which slice.
    return { ok: true, platform: null, reason: "Could not tell what their store runs, so Genie is not assuming either way." };
  }
  if (detected.id === need) {
    return { ok: true, platform: detected.id, reason: `Confirmed on ${detected.label} before writing — say so in the first line, it proves you looked.` };
  }
  return {
    ok: false, platform: detected.id,
    reason: `They run ${detected.label}, and this needs ${need}. A pitch they cannot act on is worse than no pitch: it spends the one first impression you get.`,
  };
}

/**
 * Which platform the owner's product requires, if any. Read from what they sell
 * and the plan, never assumed — most businesses have no such requirement, and
 * inventing one would silently empty their list.
 */
export function requiredPlatform({ ai = {}, strategy = null } = {}) {
  const hay = [
    ai?.whatTheySell, ai?.industry, ai?.subCategory,
    strategy?.offer, strategy?.angle, (strategy?.who || []).join(" "),
  ].filter(Boolean).join(" ").toLowerCase();

  // Only claim a requirement when the words say the product is FOR that platform,
  // not merely that it was mentioned once in passing.
  for (const p of PLATFORMS) {
    const re = new RegExp(`\\b(${p.id}|${p.label.toLowerCase()})\\b[^.]{0,40}\\b(app|plugin|extension|integration|store|stores|merchants?|shops?)\\b`, "i");
    const reRev = new RegExp(`\\b(app|plugin|extension|integration)\\b[^.]{0,30}\\b(for|on)\\b[^.]{0,20}\\b(${p.id}|${p.label.toLowerCase()})\\b`, "i");
    if (re.test(hay) || reRev.test(hay)) return p.id;
  }
  return null;
}

// ── AND HAS ANYONE ALREADY SOLVED IT FOR THEM? ──
//
// NOTE ON GENERALITY. The first version of this hard-coded one industry's rivals
// and called it a Genie feature, which it was not: "does this shop have AR" means
// nothing to somebody selling booking software. What generalises is the QUESTION —
// does this prospect already pay someone for the thing I do? — so the signatures
// are grouped by category and the category is read from the owner's own plan,
// exactly as requiredPlatform reads the platform. A business whose category is not
// listed detects nothing and is not filtered by anything, which is the same way
// every other optional signal in this file behaves.
//
// Knowing a shop runs Shopify tells you the pitch is possible. It does not tell
// you whether it is wanted. "Furniture retailer on Shopify" is a list of
// thousands; "furniture retailer on Shopify whose customers still cannot see the
// sofa in their room" is a list where the pitch has no rival, and it is the
// difference between a 1% reply rate and something worth getting up for.
//
// Three answers matter, and they are three completely different emails:
//   · NOTHING      — the gap is open. Lead with the problem, because they are
//                    living it and have not been sold the solution yet.
//   · A RIVAL      — they already bought the idea. The email is about what is
//                    different, never about why AR matters. Telling someone who
//                    already pays for AR that AR is useful reads as not looking.
//   · A HOME BUILD — the hardest to sell and the most valuable to know about:
//                    somebody there championed this and is maintaining it.
//
// SAME PAGE, NO EXTRA REQUEST. Every prospect's homepage is already fetched to
// find a published contact address. These viewers announce themselves in that
// same HTML, because the browser has to load them.
const RIVAL_TECH = {
  // Sell 3D/AR product viewing? These are who already has it.
  ar3d: [
  // Named products a shop can buy. First match wins, most specific first.
  { id: "threekit", label: "Threekit", signals: [/threekit\.com/i, /threekit-player/i] },
  { id: "cylindo", label: "Cylindo", signals: [/cylindo\.com/i, /cylindo-viewer/i] },
  { id: "levar", label: "Levar", signals: [/levar\.io/i, /levarcdn/i] },
  { id: "obsess", label: "Obsess", signals: [/obsessar\.com/i, /obsessvr\.com/i] },
  { id: "emperia", label: "Emperia", signals: [/emperiavr\.com/i] },
  { id: "matterport", label: "Matterport", signals: [/matterport\.com/i, /matterport-showcase/i] },
  { id: "sketchfab", label: "Sketchfab", signals: [/sketchfab\.com\/models/i, /api\.sketchfab\.com/i] },
  { id: "vectary", label: "Vectary", signals: [/vectary\.com/i, /vctr\.io/i] },
  { id: "shopify-ar", label: "Shopify's own AR", signals: [/shopify-xr/i, /model-viewer-ui/i, /data-shopify-xr/i] },
  // Not a product — the web standard anyone can drop in. Reported separately,
  // because "they built it themselves" is a different conversation from "they
  // pay a vendor", and guessing wrong on that is obvious to the reader.
  { id: "model-viewer", label: "a 3D viewer they built in", signals: [/<model-viewer/i, /model-viewer\.min\.js/i, /google\/model-viewer/i] },
  { id: "usdz", label: "an AR file on the page", signals: [/\.usdz["'\s>]/i, /\.glb["'\s>]/i, /ar-quick-look/i] },
  ],

  // Sell live chat or support software?
  livechat: [
    { id: "intercom", label: "Intercom", signals: [/widget\.intercom\.io/i, /intercomcdn\.com/i] },
    { id: "zendesk", label: "Zendesk", signals: [/zdassets\.com/i, /zendesk\.com\/embeddable/i] },
    { id: "crisp", label: "Crisp", signals: [/client\.crisp\.chat/i] },
    { id: "tawk", label: "Tawk.to", signals: [/embed\.tawk\.to/i] },
    { id: "tidio", label: "Tidio", signals: [/code\.tidio\.co/i] },
    { id: "drift", label: "Drift", signals: [/js\.driftt\.com/i] },
  ],

  // Sell reviews or social proof?
  reviews: [
    { id: "trustpilot", label: "Trustpilot", signals: [/widget\.trustpilot\.com/i, /trustpilot\.com\/review/i] },
    { id: "yotpo", label: "Yotpo", signals: [/staticw2\.yotpo\.com/i, /yotpo\.com\/v\d/i] },
    { id: "judgeme", label: "Judge.me", signals: [/judge\.me\/(widget|loader)/i, /cdn\d?\.judge\.me/i] },
    { id: "okendo", label: "Okendo", signals: [/okendo\.io/i] },
    { id: "loox", label: "Loox", signals: [/loox\.io/i] },
  ],

  // Sell booking or scheduling?
  booking: [
    { id: "calendly", label: "Calendly", signals: [/assets\.calendly\.com/i, /calendly\.com\/[a-z0-9-]/i] },
    { id: "acuity", label: "Acuity", signals: [/acuityscheduling\.com/i] },
    { id: "simplybook", label: "SimplyBook", signals: [/simplybook\.(me|it)/i] },
    { id: "setmore", label: "Setmore", signals: [/setmore\.com/i] },
  ],

  // Sell email marketing or pop-ups?
  email: [
    { id: "klaviyo", label: "Klaviyo", signals: [/static\.klaviyo\.com/i, /klaviyo\.js/i] },
    { id: "mailchimp", label: "Mailchimp", signals: [/chimpstatic\.com/i, /list-manage\.com/i] },
    { id: "omnisend", label: "Omnisend", signals: [/omnisrc\.com/i, /omnisend\.com/i] },
    { id: "privy", label: "Privy", signals: [/privy\.com\/.*widget/i, /privymktg\.com/i] },
  ],

  // Sell analytics or session replay?
  analytics: [
    { id: "hotjar", label: "Hotjar", signals: [/static\.hotjar\.com/i] },
    { id: "clarity", label: "Microsoft Clarity", signals: [/clarity\.ms/i] },
    { id: "mixpanel", label: "Mixpanel", signals: [/cdn\.mxpnl\.com/i] },
    { id: "fullstory", label: "FullStory", signals: [/edge\.fullstory\.com/i] },
  ],
};

// What each category is, in the words that would appear in an owner's plan. Used
// to work out which one applies to this business, and to write the note.
const CATEGORY = {
  ar3d: { thing: "see the product in their own room", words: /\b(ar|augmented realit\w*|3d (model|view|product)|virtual (try|showroom)|see it in (your|their) (room|space))\b/i },
  livechat: { thing: "talk to a person on the site", words: /\b(live ?chat|chat widget|support inbox|help ?desk)\b/i },
  reviews: { thing: "show customer reviews", words: /\b(reviews?|ratings?|social proof|testimonials?)\b/i },
  booking: { thing: "book an appointment", words: /\b(bookings?|appointments?|scheduling|calendar link)\b/i },
  email: { thing: "capture and email their visitors", words: /\b(email marketing|newsletters?|pop.?ups?|abandoned cart|mailing list)\b/i },
  analytics: { thing: "see what visitors actually do", words: /\b(analytics|session (replay|recording)|heatmaps?|visitor behaviou?r)\b/i },
};

/**
 * Which rival category applies to this owner, read from what they sell and the
 * plan. Returns null for most businesses, and null means nothing is detected and
 * nothing is filtered — the same way requiredPlatform behaves.
 */
export function rivalCategory({ ai = {}, strategy = null } = {}) {
  const hay = [
    ai?.whatTheySell, ai?.industry, ai?.subCategory, ai?.targetCustomer,
    strategy?.offer, strategy?.angle, strategy?.mechanism,
    Array.isArray(strategy?.who) ? strategy.who.join(" ") : "",
  ].filter(Boolean).join(" ");
  if (!hay.trim()) return null;
  for (const [id, c] of Object.entries(CATEGORY)) if (c.words.test(hay)) return id;
  return null;
}

/** What the owner's category is for, in a phrase an email can use. */
export function categoryThing(category) {
  return CATEGORY[category]?.thing || "the thing you sell";
}

/**
 * Does this shop already show products in 3D or AR, and with whose technology?
 * @returns {{id, label, vendor}|null} null means nothing found, which is the
 *          interesting answer: the gap is open.
 */
export function detectRivalTech(html, category) {
  const s = String(html || "");
  const list = RIVAL_TECH[category];
  if (!s || !list) return null;
  for (const t of list) {
    if (t.signals.some((re) => re.test(s))) {
      // A named product was bought from someone. The standard and a bare file
      // were not: those are a team that built it, which is a different pitch.
      return { id: t.id, label: t.label, vendor: !["model-viewer", "usdz"].includes(t.id) };
    }
  }
  return null;
}

/**
 * What to do about it, in the words the email needs. This is the whole point of
 * detecting it: three findings, three genuinely different opening lines.
 *
 * @param ar        result of detectArTech
 * @param platform  result of detectPlatform, so the note can name both
 */
/**
 * Did enough of their page arrive to judge it at all? A storefront that returned
 * a redirect stub, a cookie wall or a timeout is not a shop without AR — it is a
 * shop Genie could not read, and the two must never produce the same email.
 */
export function readableForAr(html) {
  return String(html || "").length >= 2000;
}

export function rivalAngle(ar, platform = null, { readable = true, category = null } = {}) {
  const on = platform?.label ? ` on ${platform.label}` : "";
  const thing = categoryThing(category);
  // ── UNKNOWN IS NOT A NO ──
  // The same rule platformFit already keeps. Claiming the gap is open because the
  // page would not load is how a prospect gets an email confidently describing a
  // problem they solved two years ago.
  if (!ar && !readable) {
    return {
      state: "unknown",
      priority: 2,
      note: `Genie could not read enough of their site to tell whether they already have a way for visitors to ${thing}. Write as if you do not know, because you do not: ask rather than assert, and never claim they are missing something.`,
    };
  }
  if (!ar) {
    return {
      state: "open",
      priority: 2,
      note: `Nothing on their site lets a visitor ${thing}${on}. The gap is open, so lead with the problem they are living with and the cost of it, not with your technology — they have not been sold this idea yet.`,
    };
  }
  if (!ar.vendor) {
    return {
      state: "built",
      priority: 1,
      note: `They already have ${ar.label}${on} — built in rather than bought. Somebody there championed this and maintains it, so the idea is sold and the budget exists. Write to that person about what it costs them to keep it running, never about why it matters.`,
    };
  }
  return {
    state: "taken",
    priority: 0,
    note: `They already use ${ar.label}${on}. Do NOT explain why this matters — they bought that argument years ago, and saying it again proves you did not look. The only email worth sending is about what is different, and if nothing is, do not send one.`,
  };
}

/**
 * Rank a list of prospects by how open the gap is. Nothing is dropped: a shop
 * that already bought a rival is still worth writing to, it just goes last and
 * gets a different email. Dropping them would throw away the displacement list,
 * which is where the biggest budgets already are.
 */
export function byRivalOpportunity(prospects = []) {
  return [...prospects].sort((a, b) => (b?.ar?.priority ?? 2) - (a?.ar?.priority ?? 2));
}
