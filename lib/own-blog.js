// lib/own-blog.js
// ── YOUR BLOG, ON YOUR DOMAIN ──
// Articles on a Genie Page build Genie's domain, not the owner's. WordPress sites
// get the article on their own domain through the plugin; every other site had to
// paste each article by hand, and a pasted-never article builds nothing.
//
// This closes that gap with one rule on the owner's host: "/blog/* comes from
// Genie" (a reverse-proxy rewrite, the same mechanism Vercel, Netlify, Cloudflare,
// Nginx and Apache all have). After that, every approved article is served AT
// yoursite.com/blog/<slug>: the owner's domain, the owner's ranking, and Genie
// never needs anyone to paste again.
//
// Why a subfolder and not an embed: content injected by JavaScript is indexed late
// and unreliably, and a subfolder inherits the site's authority fully. The HTML is
// rendered by /b/<handle>/... as plain HTML with no framework scripts, so it works
// behind any proxy (Next.js pages would ask the owner's domain for Genie's chunks).
//
// Stored as a `connections` row, provider "ownblog":
//   meta: { handle, host, path, base, verifiedAt, platform }
// `base` is only trusted once verifiedAt is set: until Genie has fetched the page
// through the owner's domain, canonicals keep pointing at the Genie copy.

import { createHash } from "crypto";
import { appBase } from "@/lib/pages";

export const PROVIDER = "ownblog";

/**
 * Turn what the owner typed ("blog", "/blog", "https://site.com/blog/") into a
 * clean path. Returns { ok, path } or { ok:false, error }. The site root is
 * refused: taking over "/" would replace the owner's whole website.
 */
export function normalizePath(input, host = "") {
  let s = String(input || "").trim();
  if (!s) return { ok: false, error: "Choose where your articles live, for example /blog." };
  if (/^https?:\/\//i.test(s) || s.includes(".")) {
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return { ok: false, error: "That doesn't look like a web address." }; }
    const want = bare(host);
    if (want && bare(u.hostname) !== want) return { ok: false, error: `Articles have to live on ${want} itself, so they build its ranking.` };
    s = u.pathname;
  }
  s = "/" + s.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (s === "/") return { ok: false, error: "Pick a folder like /blog. Genie cannot take over your home page." };
  if (!/^\/[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*){0,2}$/.test(s)) return { ok: false, error: "Use letters, numbers and dashes, like /blog or /guides." };
  return { ok: true, path: s };
}

function bare(h) { return String(h || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, ""); }

/** Where Genie serves the proxied blog from. */
export function sourceBase(handle) {
  return `${appBase()}/b/${handle}`;
}

/** The public URL of one article on the owner's domain. */
export function ownArticleUrl(base, slug) {
  return `${String(base).replace(/\/+$/, "")}/${slug}`;
}

/**
 * Map a Genie Page URL to the owner's copy when their blog is live, so links,
 * pings and reports all use the URL that builds THEIR ranking. Anything else is
 * returned unchanged.
 */
export function toOwnUrl(url, handle, base) {
  if (!base || !handle || !url) return url;
  const from = `${appBase()}/p/${handle}`;
  const s = String(url);
  if (s === from) return String(base).replace(/\/+$/, "");
  if (s.startsWith(from + "/")) return String(base).replace(/\/+$/, "") + s.slice(from.length);
  return url;
}

/** Point every link inside an article at the owner's domain instead of Genie's. */
export function rewriteBodyLinks(html, handle, base) {
  if (!base || !handle) return String(html || "");
  const b = String(base).replace(/\/+$/, "");
  const abs = `${appBase()}/p/${handle}`;
  return String(html || "")
    .split(`"${abs}/`).join(`"${b}/`)
    .split(`"${abs}"`).join(`"${b}"`)
    .split(`"/p/${handle}/`).join(`"${b}/`)
    .split(`"/p/${handle}"`).join(`"${b}"`);
}

/**
 * The owner's verified blog base, or null. Never throws. Pass the page's handle
 * when there is one: an account with several businesses has one blog, on one
 * site, and articles for the others must not be moved onto it.
 */
export async function blogBaseFor(supabase, userId, handle = null) {
  const conn = await blogConnection(supabase, userId);
  const m = conn?.meta;
  if (!m?.verifiedAt || !m?.base) return null;
  if (handle && m.handle && m.handle !== handle) return null;
  return m.base;
}

export async function blogConnection(supabase, userId) {
  try {
    const { data } = await supabase.from("connections").select("meta").eq("user_id", userId).eq("provider", PROVIDER).maybeSingle();
    return data || null;
  } catch { return null; }
}

/**
 * Who owns the blog served for this handle (the /b route has no session). Two
 * accounts can scan the same site, so a verified blog always wins, and among
 * unverified ones the one touched most recently (the owner pressing "Check now"
 * touches it, so a stranger's stale setup can never block the real owner).
 */
export async function blogOwnerByHandle(admin, handle) {
  try {
    const { data } = await admin.from("connections").select("user_id, meta, updated_at").eq("provider", PROVIDER).eq("meta->>handle", handle).limit(10);
    const rows = data || [];
    return rows.find((r) => r?.meta?.verifiedAt)
      || rows.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0]
      || null;
  } catch { return null; }
}

// ── The one rule, for each kind of host ──────────────────────────────────────
// Written so a developer can paste it without reading anything else, and so an
// owner can forward it to whoever looks after the site.

export function rewriteSnippets({ path, handle }) {
  const src = sourceBase(handle);
  const vercelJson = JSON.stringify({
    rewrites: [
      { source: path, destination: src },
      { source: `${path}/:path*`, destination: `${src}/:path*` },
    ],
  }, null, 2);

  const nextConfig = `// next.config.js (or .mjs): add this inside the config object.
async rewrites() {
  return {
    beforeFiles: [
      { source: "${path}", destination: "${src}" },
      { source: "${path}/:path*", destination: "${src}/:path*" },
    ],
  };
},`;

  const netlify = `# netlify: add to the _redirects file in your publish folder
${path}    ${src}    200!
${path}/*  ${src}/:splat    200!`;

  const cloudflare = `// Cloudflare: Workers & Pages -> Create Worker -> paste -> Deploy,
// then Settings -> Triggers -> Add route: yoursite.com${path}*
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const rest = url.pathname.slice("${path}".length);
    const upstream = "${src}" + rest + url.search;
    const res = await fetch(upstream, { headers: { "User-Agent": request.headers.get("User-Agent") || "" } });
    return new Response(res.body, res);
  },
};`;

  const nginx = `# nginx: inside your server { } block
location = ${path} { proxy_pass ${src}; proxy_ssl_server_name on; proxy_set_header Host ${new URL(appBase()).host}; }
location ${path}/ { proxy_pass ${src}/; proxy_ssl_server_name on; proxy_set_header Host ${new URL(appBase()).host}; }`;

  const apache = `# Apache: needs mod_proxy, mod_proxy_http and mod_ssl
SSLProxyEngine on
ProxyPass ${path}/ ${src}/
ProxyPassReverse ${path}/ ${src}/
ProxyPass ${path} ${src}
ProxyPassReverse ${path} ${src}`;

  return [
    { id: "nextjs", label: "Next.js", file: "next.config.js", code: nextConfig },
    { id: "vercel", label: "Vercel (not Next.js)", file: "vercel.json", code: vercelJson },
    { id: "netlify", label: "Netlify", file: "_redirects", code: netlify },
    { id: "cloudflare", label: "Cloudflare (any site on Cloudflare)", file: "Worker", code: cloudflare },
    { id: "nginx", label: "Nginx", file: "server config", code: nginx },
    { id: "apache", label: "Apache / cPanel", file: ".htaccess or vhost", code: apache },
  ];
}

/** Best guess at which snippet applies, from the site's response headers. */
export function guessHosting(headers = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), String(v || "").toLowerCase()]));
  if (h["x-powered-by"]?.includes("next") || h["x-nextjs-cache"] || h["x-nextjs-prerender"]) return "nextjs";
  if (h.server?.includes("vercel") || h["x-vercel-id"]) return "vercel";
  if (h.server?.includes("netlify") || h["x-nf-request-id"]) return "netlify";
  if (h.server?.includes("cloudflare") || h["cf-ray"]) return "cloudflare";
  if (h.server?.includes("nginx")) return "nginx";
  if (h.server?.includes("apache") || h.server?.includes("litespeed")) return "apache";
  return null;
}

/**
 * The marker the verification looks for on the owner's /blog page. It names the
 * account as well as the site, so the check only passes when the page is serving
 * THIS owner's articles.
 */
export function markerValue(handle, userId) {
  return `${handle}:${createHash("sha256").update(String(userId || "")).digest("hex").slice(0, 12)}`;
}

export function hasMarker(html, value) {
  const re = new RegExp("<meta\\s+name=[\"']genie-blog[\"']\\s+content=[\"']" + escapeRe(value) + "[\"']", "i");
  return re.test(String(html || ""));
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** IndexNow options for URLs on the owner's blog. */
export function indexNowOptsFor(base) {
  return base ? { keyLocation: `${String(base).replace(/\/+$/, "")}/indexnow-key.txt` } : {};
}

/**
 * Every live owner blog, keyed "<userId>:<handle>" -> base. For the site-wide
 * lists (Genie's sitemap, llms.txt) that must send crawlers to the owner's copy.
 */
export async function verifiedBlogs(admin) {
  const map = new Map();
  try {
    const { data } = await admin.from("connections").select("user_id, meta").eq("provider", PROVIDER).limit(5000);
    for (const r of data || []) if (r?.meta?.verifiedAt && r.meta.base && r.meta.handle) map.set(`${r.user_id}:${r.meta.handle}`, r.meta.base);
  } catch {}
  return map;
}
