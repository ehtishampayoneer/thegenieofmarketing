// lib/install-guide.js
// ── GETTING THE SNIPPET ONTO SOMEONE ELSE'S SITE ──
// The traffic and lead-capture layer needs one line pasted into the customer's
// own site, and "paste this before </body>" is where a non-technical owner
// stops. Not because it is hard, but because it is unfamiliar and they are
// frightened of breaking their website.
//
// Worth being clear that this requirement is normal, not a design failure:
// Google Analytics, Meta Pixel, Hotjar, Intercom and every other marketing tool
// install exactly the same way, which is why every website platform built a box
// specifically for it. The problem is not the snippet, it is being handed a line
// of code with no idea where it goes.
//
// So this detects what the site actually runs on and gives named, clickable
// steps for that platform. "Online Store, Themes, Edit code, theme.liquid" is a
// different request from "paste this before </body>", even though it is the
// same paste.
//
// WORDPRESS
// Genie CANNOT install this automatically, and it is worth writing down why so
// nobody tries again: WordPress core REST has no endpoint for injecting a
// site-wide header script. wp/v2/plugins can install from the .org repo, but it
// needs install_plugins capability, which managed hosts disable via
// DISALLOW_FILE_MODS, and configuring such a plugin afterwards has no REST
// endpoint either. Installing a third-party plugin into someone's site
// uninvited would also be well beyond what publishing a post implies.
//
// Instead Genie generates a tiny single-file plugin with the token already in
// it. Upload, activate, finished: four clicks, no code editing, and it survives
// a theme change, which pasting into theme.liquid or header.php does not.

// Ordered: first match wins, so the more specific markers come first.
const PLATFORMS = [
  {
    id: "shopify",
    name: "Shopify",
    match: (h) => /cdn\.shopify\.com|Shopify\.theme|shopifycloud/i.test(h),
    steps: [
      "In Shopify admin, open Online Store, then Themes.",
      "On your current theme press the ⋯ button, then Edit code.",
      "Open theme.liquid in the file list.",
      "Paste the line just above the closing </body> tag, near the bottom.",
      "Press Save.",
    ],
  },
  {
    id: "wix",
    name: "Wix",
    match: (h) => /static\.wixstatic\.com|wix-code|_wixCIDX/i.test(h),
    steps: [
      "In your Wix dashboard, open Settings.",
      "Scroll to Advanced and choose Custom Code.",
      "Press Add Custom Code, and paste the line in the box.",
      "Set Add Code to Pages to All pages, and Place Code in to Body - end.",
      "Press Apply.",
    ],
  },
  {
    id: "squarespace",
    name: "Squarespace",
    match: (h) => /static1\.squarespace\.com|squarespace\.com\/universal/i.test(h),
    steps: [
      "In Squarespace, open Settings, then Advanced.",
      "Choose Code Injection.",
      "Paste the line into the Footer box.",
      "Press Save.",
    ],
  },
  {
    id: "webflow",
    name: "Webflow",
    match: (h) => /assets\.website-files\.com|assets-global\.website-files\.com|webflow\.js/i.test(h),
    steps: [
      "In Webflow, open Project Settings, then Custom Code.",
      "Paste the line into the Footer Code box.",
      "Press Save Changes, then Publish the site.",
    ],
  },
  {
    id: "wordpress",
    name: "WordPress",
    match: (h) => /wp-content|wp-includes|name=["']generator["'][^>]*WordPress/i.test(h),
    // The plugin route is offered first in the UI because it is fewer clicks and
    // cannot be undone by a theme update.
    steps: [
      "Easiest: download the small plugin Genie made for you, then in WordPress go to Plugins, Add New Plugin, Upload Plugin, choose the file, Install Now, Activate. Done.",
      "Or by hand: Appearance, Theme File Editor, open footer.php, paste the line just above </body>, then Update File.",
    ],
  },
  {
    id: "framer",
    name: "Framer",
    match: (h) => /framerusercontent\.com|framer\.com\/m\//i.test(h),
    steps: [
      "In Framer, open Project Settings, then General.",
      "Find Custom Code and paste the line into End of <body> tag.",
      "Publish the site.",
    ],
  },
  {
    id: "gtm",
    name: "Google Tag Manager",
    match: (h) => /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i.test(h),
    steps: [
      "You already run Google Tag Manager, which is the easiest route.",
      "In GTM, create a New Tag, choose Custom HTML, and paste the line.",
      "Set the trigger to All Pages.",
      "Save, then press Submit and Publish.",
    ],
  },
];

const GENERIC = {
  id: "generic",
  name: "your website",
  steps: [
    "Open whichever tool you use to edit your website.",
    "Look for a setting called Custom Code, Code Injection, or Header and Footer Scripts. Nearly every website builder has one, because this is how Google Analytics is installed too.",
    "Paste the line into the FOOTER or end-of-body box, so it loads last and can never slow your pages down.",
    "Save, and publish if your builder asks you to.",
  ],
};

/**
 * Work out what a site runs on, from its own HTML.
 * Returns { id, name, steps }. Never throws, always returns something usable.
 */
export function detectPlatform(html = "") {
  const h = String(html || "");
  if (!h) return GENERIC;
  // GTM is checked last among matches on purpose: if a site is on Shopify AND
  // runs GTM, the Shopify instructions are the ones they will recognise.
  const hit = PLATFORMS.filter((p) => p.id !== "gtm").find((p) => p.match(h))
    || PLATFORMS.find((p) => p.id === "gtm" && p.match(h));
  return hit || GENERIC;
}

/**
 * A complete, single-file WordPress plugin carrying the snippet.
 * Deliberately tiny and readable: anyone nervous about installing it can open
 * the file and see there is nothing else in there.
 */
export function wordpressPlugin({ src, site = "" }) {
  const safeSrc = String(src).replace(/'/g, "");
  return `<?php
/**
 * Plugin Name: Marketing Genie
 * Description: Counts visits, catches leads, and points visitors at your buy page. Adds one script tag to the footer and nothing else.
 * Version: 1.0.0
 * Author: Marketing Genie
${site ? ` * Site: ${site}\n` : ""} */

// No direct access.
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Add the Genie tag to the footer of every page.
 * Footer rather than header on purpose: it loads last, so it can never delay
 * your page rendering.
 */
function marketing_genie_footer_tag() {
    echo '<script src="${safeSrc}" async></script>' . "\\n";
}
add_action( 'wp_footer', 'marketing_genie_footer_tag', 99 );
`;
}

/**
 * The email a non-technical owner forwards to whoever looks after their site.
 * Written to be read by a developer: what it is, exactly where it goes, what it
 * does not do, and how long it takes.
 */
export function installEmail({ src, platform, site, from = "" }) {
  const tag = `<script src="${src}" async></script>`;
  const steps = (platform?.steps || GENERIC.steps).map((s, i) => `${i + 1}. ${s}`).join("\n");
  return {
    subject: `Please add one line to ${site || "our website"} (2 minutes)`,
    body: `Hi,

Could you add this one line to ${site || "our website"}? It goes at the end of the page, just before the closing </body> tag.

${tag}

${platform?.name && platform.id !== "generic" ? `The site runs on ${platform.name}, so:\n\n${steps}\n` : `${steps}\n`}
What it does: counts visitors, shows a small prompt so people can leave their email, and sends visitors to our pricing page. It is the same kind of tag as Google Analytics.

What it does not do: it loads after everything else so it cannot slow the site down, it sets no cookies, and it collects no personal data beyond an email address someone chooses to type in.

Nothing else on the site needs to change.

Thanks${from ? `,\n${from}` : ""}`,
  };
}

export const GENERIC_PLATFORM = GENERIC;

// ── A ZIP, BY HAND ──────────────────────────────────────────────────────────
// WordPress's plugin uploader only accepts a .zip, so serving the raw .php
// would simply fail at the upload step. Rather than add an archiving dependency
// for one small file, this writes a minimal single-entry ZIP: stored (no
// compression), which a ~1KB file does not need, and which keeps the format
// simple enough to be obviously correct.
//
// The file is placed inside a folder, marketing-genie/marketing-genie.php,
// because that is the layout WordPress expects from a plugin archive.

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

export function zipSingleFile(name, contents) {
  const nameBuf = Buffer.from(name, "utf8");
  const data = Buffer.from(contents, "utf8");
  const crc = crc32(data);
  const size = data.length;
  // A fixed timestamp keeps the archive byte-identical between downloads, so a
  // re-download is not mistaken for a different plugin.
  const time = 0, date = 0x2821; // 2×1980+... an arbitrary valid DOS date

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);          // version needed
  local.writeUInt16LE(0, 6);           // flags
  local.writeUInt16LE(0, 8);           // method: stored
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(size, 18);       // compressed
  local.writeUInt32LE(size, 22);       // uncompressed
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);          // extra length

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);        // version made by
  central.writeUInt16LE(20, 6);        // version needed
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(size, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);        // extra
  central.writeUInt16LE(0, 32);        // comment
  central.writeUInt16LE(0, 34);        // disk start
  central.writeUInt16LE(0, 36);        // internal attrs
  central.writeUInt32LE(0, 38);        // external attrs
  central.writeUInt32LE(0, 42);        // offset of local header

  const centralSize = central.length + nameBuf.length;
  const centralOffset = local.length + nameBuf.length + size;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);             // entries on this disk
  end.writeUInt16LE(1, 10);            // total entries
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);            // comment length

  return Buffer.concat([local, nameBuf, data, central, nameBuf, end]);
}
