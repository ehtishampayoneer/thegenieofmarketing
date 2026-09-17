// lib/gsc-setup.js
// ── SEARCH CONSOLE, WITHOUT THE OWNER TOUCHING IT ──
// Real ranking data only exists once the site is a verified property in Search
// Console. Asking a business owner to do that themselves means: find Search
// Console, choose between a Domain and URL-prefix property, pick a verification
// method, paste a meta tag into their theme, come back. Most never will, and
// Genie then shows estimates forever.
//
// Google exposes both halves as APIs, so Genie does it:
//   1. Ask Google for the verification token for this site (a meta tag).
//   2. Put the tag on the site. Automatic when Genie's WordPress plugin is
//      installed (the plugin prints it in <head>). Otherwise the owner pastes one
//      line, or has Genie email it to whoever looks after the site.
//   3. Ask Google to verify, then add the site as a Search Console property.
//
// Needs the `siteverification` and `webmasters` (write) scopes, so an owner who
// connected Google before these existed reconnects once.

const SV = "https://www.googleapis.com/siteVerification/v1";
const WM = "https://www.googleapis.com/webmasters/v3";

const auth = (token) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

async function err(res) {
  let t = "";
  try { t = await res.text(); } catch {}
  try { const j = JSON.parse(t); return j?.error?.message || j?.error?.errors?.[0]?.message || t; } catch { return t || `HTTP ${res.status}`; }
}

/** The site as Google names a URL-prefix property: always a trailing slash. */
export function propertyUrl(host) {
  const h = String(host || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${h}/`;
}

/** The meta tag Google wants on the site's home page, for this account. */
export async function getVerificationTag(token, host) {
  const res = await fetch(`${SV}/token`, {
    method: "POST", headers: auth(token), signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ site: { type: "SITE", identifier: propertyUrl(host) }, verificationMethod: "META" }),
  });
  if (!res.ok) return { ok: false, error: await err(res) };
  const j = await res.json();
  const tag = String(j?.token || "");
  // Google returns the whole tag; the content value is what a plugin needs.
  const content = /content=["']([^"']+)["']/.exec(tag)?.[1] || "";
  return tag ? { ok: true, tag, content } : { ok: false, error: "Google did not return a verification tag." };
}

/** Ask Google to check the tag is live. */
export async function verifyOwnership(token, host) {
  const res = await fetch(`${SV}/webResource?verificationMethod=META`, {
    method: "POST", headers: auth(token), signal: AbortSignal.timeout(25000),
    body: JSON.stringify({ site: { type: "SITE", identifier: propertyUrl(host) } }),
  });
  if (res.ok) return { ok: true };
  const message = await err(res);
  return { ok: false, error: message, notFound: /could not (find|verify)|verification token|not found/i.test(message) };
}

/** Add the verified site as a Search Console property. */
export async function addSearchConsoleProperty(token, host) {
  const res = await fetch(`${WM}/sites/${encodeURIComponent(propertyUrl(host))}`, {
    method: "PUT", headers: auth(token), signal: AbortSignal.timeout(20000),
  });
  return res.ok ? { ok: true } : { ok: false, error: await err(res) };
}

/**
 * Put the tag on a WordPress site through Genie's own plugin, which exposes a
 * tiny endpoint for exactly this and prints the tag in <head>. Returns
 * { ok } or { ok:false, error }, and { ok:false, noPlugin:true } when the site
 * has the connection but not a new enough plugin.
 */
export async function installTagViaWordPress(wpConn, content) {
  const m = wpConn?.meta || {};
  if (!m.siteUrl || !m.username || !wpConn?.access_token) return { ok: false, error: "No WordPress connection." };
  const { safeFetch } = await import("@/lib/ssrf");
  try {
    const { res } = await safeFetch(`${m.siteUrl}/wp-json/marketing-genie/v1/verification`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${m.username}:${wpConn.access_token}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 404) return { ok: false, noPlugin: true, error: "The Genie plugin on that site is an older version." };
    if (!res.ok) return { ok: false, error: `WordPress answered ${res.status}.` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
