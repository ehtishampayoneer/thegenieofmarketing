import { describe, it, expect } from "vitest";
import { detectPlatform, platformFit, requiredPlatform } from "@/lib/platform-detect";

const page = (body) => `<!doctype html><html><head><title>Ali's Rugs</title></head><body>${body}</body></html>`;

describe("reading what a shop is built on", () => {
  it("recognises Shopify from what the storefront itself serves", () => {
    for (const marker of [
      '<script src="https://cdn.shopify.com/s/files/1/app.js"></script>',
      '<img src="/cdn/shop/files/rug.jpg">',
      "<script>window.Shopify = { shop: 'alis-rugs.myshopify.com' };</script>",
    ]) {
      expect(detectPlatform(page(marker))?.id, marker).toBe("shopify");
    }
  });

  it("recognises the other platforms a retailer might be on", () => {
    expect(detectPlatform(page('<link href="/wp-content/plugins/woocommerce/style.css">'))?.id).toBe("woocommerce");
    expect(detectPlatform(page('<script src="https://cdn11.bigcommerce.com/s-abc/x.js">'))?.id).toBe("bigcommerce");
    expect(detectPlatform(page('<script src="/static/version123/frontend/Magento_Theme/x.js">'))?.id).toBe("magento");
    expect(detectPlatform(page('<link href="https://static1.squarespace.com/x.css">'))?.id).toBe("squarespace");
  });

  it("says nothing rather than guessing", () => {
    expect(detectPlatform(page("<p>Hand-woven rugs since 1994.</p>"))).toBeNull();
    expect(detectPlatform("")).toBeNull();
    expect(detectPlatform(null)).toBeNull();
  });

  it("prefers WooCommerce over the WordPress it sits on", () => {
    const html = page('<link href="/wp-content/plugins/woocommerce/style.css"><script src="/wp-includes/js/x.js">');
    expect(detectPlatform(html).id).toBe("woocommerce");
  });

  it("marks a bare WordPress match as the weak claim it is", () => {
    expect(detectPlatform(page('<link href="/wp-content/themes/x/style.css">')).confident).toBe(false);
  });
});

describe("whether the offer applies to them at all", () => {
  const shopify = { id: "shopify", label: "Shopify" };
  const woo = { id: "woocommerce", label: "WooCommerce" };

  it("confirms a match, and says to use it in the first line", () => {
    const r = platformFit(shopify, "shopify");
    expect(r.ok).toBe(true);
    expect(r.reason).toMatch(/proves you looked/);
  });

  it("drops a shop that genuinely cannot use the product", () => {
    // A pitch they cannot act on is worse than silence: it spends the one first
    // impression on something irrelevant.
    const r = platformFit(woo, "shopify");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/worse than no pitch/);
  });

  it("keeps a shop whose platform it could not read", () => {
    // Headless storefronts and heavy caching hide it completely. Skipping these
    // would bin a slice of every list and the sender would never know which.
    const r = platformFit(null, "shopify");
    expect(r.ok).toBe(true);
    expect(r.reason).toMatch(/not assuming either way/);
  });

  it("filters nobody when the product needs no particular platform", () => {
    expect(platformFit(woo, null).ok).toBe(true);
    expect(platformFit(null, "").ok).toBe(true);
  });
});

describe("working out whether the product needs a platform at all", () => {
  it("spots a product built for one", () => {
    expect(requiredPlatform({ ai: { whatTheySell: "An AR product viewer app for Shopify stores" } })).toBe("shopify");
    expect(requiredPlatform({ ai: {}, strategy: { offer: "A plugin for WooCommerce merchants" } })).toBe("woocommerce");
  });

  it("claims nothing from a passing mention", () => {
    // The dangerous false positive: inventing a requirement quietly empties the
    // owner's entire list, and nothing reports it.
    expect(requiredPlatform({ ai: { whatTheySell: "We photograph rugs. Some clients happen to use Shopify." } })).toBeNull();
    expect(requiredPlatform({ ai: { whatTheySell: "Hand-woven rugs" } })).toBeNull();
    expect(requiredPlatform({})).toBeNull();
    expect(requiredPlatform()).toBeNull();
  });
});
