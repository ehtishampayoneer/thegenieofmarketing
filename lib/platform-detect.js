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
