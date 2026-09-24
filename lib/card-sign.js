// lib/card-sign.js
// ── WHICH PHOTOS THE CARD COMPOSER IS ALLOWED TO FETCH ──
//
// /api/card turns a photo plus a headline into a designed social image. The photo
// arrives as ?img=<url> and the route fetches it server-side. That has to stay
// public and session-free: the finished card is used in an <img> and ends up in
// posts, so a cookie check would break it everywhere it is meant to work.
//
// Public and session-free, though, meant anyone on the internet could put any URL
// in ?img= and have our servers download it — up to 6MB a time, on our bill, from
// any address they chose, with the result handed back rendered. An open proxy.
//
// A host allowlist cannot work here: one of the three legitimate sources is the
// customer's OWN website, which is a different domain for every customer. So the
// URL is signed instead. Genie signs a photo URL at the moment it chooses it, and
// the composer fetches nothing that does not carry a matching signature.
//
// The signature covers the URL and nothing else, deliberately: the owner can edit
// the headline, the framing, the brand colour and the shape of the card in
// Approvals, and none of that changes what gets fetched.
//
// Runs in both the edge runtime (/api/card) and Node (the routes that choose
// photos), so it uses Web Crypto, which both have. No dependency on lib/ssrf.js,
// which needs Node's dns and net and cannot load on the edge.

// The secret is CRON_SECRET, which already exists everywhere this runs. The
// prefix is domain separation: it means a signature minted here can never be
// replayed as a cron token, or the other way round.
const PURPOSE = "genie-card:v1:";

function secret() {
  return process.env.CRON_SECRET || "";
}

async function hmac(value) {
  const s = secret();
  if (!s || !value) return null;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(s), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(PURPOSE + value));
    const bytes = new Uint8Array(sig);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    // base64url, trimmed to 96 bits — short enough to keep the URL readable,
    // long enough that guessing one is not a strategy.
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * Sign a photo URL Genie has chosen. Returns null when there is no secret to sign
 * with, in which case the caller simply omits it and the card renders its branded
 * panel instead of a photo — degraded, never broken, and never an open proxy.
 */
export async function signImageUrl(url) {
  return hmac(String(url || ""));
}

/** Add `img` and its signature to a card URL. Central, so no caller forgets the sig. */
export async function setCardImage(cardUrl, imageUrl) {
  if (!imageUrl) return;
  const sig = await signImageUrl(imageUrl);
  cardUrl.searchParams.set("img", imageUrl);
  if (sig) cardUrl.searchParams.set("sig", sig);
}

/** Is this the URL Genie signed? Fails closed on anything unexpected. */
export async function verifyImageUrl(url, sig) {
  const want = await hmac(String(url || ""));
  const got = String(sig || "");
  if (!want || want.length !== got.length) return false;
  // Compare every character regardless of the first mismatch, so the time taken
  // does not reveal how much of a guess was right.
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
