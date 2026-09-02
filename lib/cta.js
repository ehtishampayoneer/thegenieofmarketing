// lib/cta.js
// ── THE CONVERSION CTA ──
// Turns a reader into a click to the money page. Every published article ends with a
// specific, benefit-driven call-to-action the content engine wrote for THAT page and
// its buyer stage (a "compare" reader gets "Get a free quote"; a "buy" reader gets
// "Shop now"). Rendered as an inline-styled block so it survives WordPress sanitizing
// and renders identically on hosted Genie Pages. The button links to the business via
// a UTM-tagged URL, so a resulting sale traces back to the exact page (attribution).

export function conversionCtaHtml({ cta, url, businessName = "", keyword = "" }) {
  if (!url) return ""; // nothing to link to → skip rather than render a dead button
  const c = normalizeCta(cta, businessName, keyword);
  return (
    `<div style="margin:34px 0;padding:24px;border:1px solid #e5e7eb;border-radius:16px;background:#f8fafc;text-align:center">` +
    `<p style="margin:0 0 7px;font-size:20px;line-height:1.25;font-weight:700;color:#0f172a">${esc(c.headline)}</p>` +
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#475569">${esc(c.subtext)}</p>` +
    `<a href="${url}" rel="noopener" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#0f172a;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${esc(c.buttonText)} &rarr;</a>` +
    `</div>`
  );
}

// Fill any missing field with a sensible, still-converting default.
function normalizeCta(cta, businessName, keyword) {
  const c = cta && typeof cta === "object" ? cta : {};
  const bn = String(businessName || "").trim();
  return {
    headline: clip(str(c.headline), 90) || "Ready to take the next step?",
    subtext: clip(str(c.subtext), 160) || (bn ? `See how ${bn} can help.` : "See how we can help you with this."),
    buttonText: clip(str(c.buttonText), 28) || (keyword ? "Get started" : "Learn more"),
  };
}

function str(s) { return typeof s === "string" ? s.trim() : ""; }
function clip(s, n) { return s ? s.slice(0, n) : s; }
function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
