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
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { throw ssrfErr("bad_url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw ssrfErr("bad_scheme");

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw ssrfErr("blocked_host");

  if (net.isIP(host)) { if (isPrivateIp(host)) throw ssrfErr("blocked_ip"); return u; }

  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw ssrfErr("dns_fail"); }
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
