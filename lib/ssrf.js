// lib/ssrf.js
// ── SSRF GUARD ──
// Genie fetches user-supplied URLs server-side (the scanner). Without a guard,
// a user could point it at internal/cloud-metadata endpoints (169.254.169.254),
// localhost, or private ranges. assertPublicUrl() resolves the host and blocks
// private/reserved IPs; safeFetch() validates the URL AND every redirect hop
// (redirect-based SSRF is the common bypass). Fails closed, never silently.
//
// Residual note: DNS can change between check and connect (TOCTOU). This blocks
// the vast majority of SSRF; a pinned-IP dispatcher can harden further later.

import dns from "dns/promises";
import net from "net";

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;               // link-local (metadata)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;   // 172.16/12
    if (p[0] === 192 && p[1] === 168) return true;               // 192.168/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;  // CGNAT 100.64/10
    if (p[0] >= 224) return true;                                // multicast/reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("fe80")) return true;                       // link-local
    if (l.startsWith("fc") || l.startsWith("fd")) return true;   // unique-local
    if (l.startsWith("::ffff:")) return isPrivateIp(l.replace("::ffff:", "")); // v4-mapped
    return false;
  }
  return true; // unknown → block
}

function ssrfErr(reason) { const e = new Error(`ssrf_${reason}`); e.ssrf = reason; return e; }

export async function assertPublicUrl(raw) {
  let u;
  // ── THE SCHEME CHECK BELOW NEVER RAN ──
  // The test was /^https?:\/\//, so anything that was not already http(s) had
  // "https://" glued to the front of it — including "file:///etc/passwd", which
  // became "https://file:///etc/passwd", a host called "file". It was refused,
  // but by the DNS lookup forty lines later failing to resolve that host, not by
  // the line written to refuse it. A guard that only works by accident is one
  // hostname away from not working.
  //
  // Anything carrying its own scheme is parsed as-is and judged on its merits.
  // A bare "example.com:8080" has no "//" and still gets https, as before.
  const asGiven = /^[a-z][a-z0-9+.-]*:\/\//i.test(String(raw || "").trim());
  try { u = new URL(asGiven ? String(raw).trim() : `https://${String(raw || "").trim()}`); } catch { throw ssrfErr("bad_url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw ssrfErr("bad_scheme");

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw ssrfErr("blocked_host");

  if (net.isIP(host)) { if (isPrivateIp(host)) throw ssrfErr("blocked_ip"); return u; }

  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch (err) {
    // Keep the resolver's own code. Callers need to tell a domain that does not
    // exist (ENOTFOUND: a genuinely dead link) from a resolver hiccup (try later).
    const e = ssrfErr("dns_fail"); e.code = err?.code; throw e;
  }
  if (!addrs?.length) throw ssrfErr("dns_empty");
  for (const a of addrs) if (isPrivateIp(a.address)) throw ssrfErr("blocked_ip");
  return u;
}

// Fetch that validates the target and every redirect hop.
export async function safeFetch(rawUrl, opts = {}, { maxRedirects = 4 } = {}) {
  let current = (await assertPublicUrl(rawUrl)).href;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, { ...opts, redirect: "manual" });
    const loc = (res.status >= 300 && res.status < 400) ? res.headers.get("location") : null;
    if (loc) {
      current = (await assertPublicUrl(new URL(loc, current).href)).href; // validate each hop
      continue;
    }
    return { res, finalUrl: current };
  }
  throw ssrfErr("too_many_redirects");
}
