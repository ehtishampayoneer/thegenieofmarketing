// lib/email-verify.js
// ── DOES THIS ADDRESS ACTUALLY EXIST? ──
// Genie scrapes real contact addresses off company websites and pulls others
// from the shared directory. Nothing checked whether they were still alive, so
// dead addresses went out with the good ones. Bounces are what mailbox providers
// use to decide you are a spammer, which means a handful of dead addresses
// quietly pushes your GOOD email into the spam folder. That silently undoes the
// SPF/DKIM/DMARC preflight work.
//
// WHY MX AND NOT SMTP:
// The thorough check opens an SMTP conversation with the mail server and asks
// whether the mailbox exists. That needs outbound port 25, and Vercel blocks
// port 25 — so Reacher, Trumail and every library like them simply cannot run
// on our hosting. Rather than pretend, this does the checks that DO work from a
// serverless function, using DNS only:
//
//   • syntax        — malformed addresses
//   • typos         — gmial.com, hotnail.com and friends, with the fix suggested
//   • disposable    — throwaway inbox providers
//   • role account  — info@ / sales@ deliver fine but reply far less, so they are
//                     flagged rather than blocked, and the caller decides
//   • MX records    — the domain must actually accept mail
//
// That catches dead domains, typos and throwaways, which is the large majority
// of the damage. It cannot tell a live domain's dead mailbox from a live one,
// and this file does not claim otherwise.

import dns from "node:dns/promises";

const SYNTAX = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

// Throwaway inbox providers. Not exhaustive by design: this is the common tail,
// and a miss here costs one wasted send, not a wrong rejection.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "trashmail.com",
  "getnada.com", "sharklasers.com", "maildrop.cc", "dispostable.com",
  "fakeinbox.com", "mailnesia.com", "spamgourmet.com", "mohmal.com",
]);

// Shared-inbox prefixes. These are real and deliverable, they just convert far
// worse than a named human, so outreach should prefer a person when one exists.
const ROLE = /^(info|sales|support|contact|admin|hello|help|team|office|enquiries|inquiries|billing|accounts|noreply|no-reply|donotreply|webmaster|postmaster|marketing|press|careers|jobs|hr)@/i;

// Near-misses of the big consumer domains, so a typo becomes a correction
// instead of a bounce.
const TYPOS = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com",
  "gmaill.com": "gmail.com", "gnail.com": "gmail.com", "gmail.cm": "gmail.com",
  "hotnail.com": "hotmail.com", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahoo.co": "yahoo.com",
  "outlok.com": "outlook.com", "outllok.com": "outlook.com",
  "iclod.com": "icloud.com", "icloud.co": "icloud.com",
};

// MX answers are cached for the process lifetime. A single outreach batch hits
// the same company domain repeatedly, and DNS for a domain does not change
// between two sends a second apart. "unknown" is cached briefly so a resolver
// outage doesn't get pinned for an hour.
const MX_CACHE = new Map();
const MX_TTL_MS = 60 * 60 * 1000;
const UNKNOWN_TTL_MS = 60 * 1000;

// DNS errors that genuinely mean "this domain does not accept mail".
// Anything else (ECONNREFUSED, ETIMEOUT, SERVFAIL, EREFUSED, sandboxed DNS)
// means our resolver had a problem, which tells us nothing about the address.
const DEFINITELY_DEAD = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

// Never let a hanging resolver stall an outreach run.
function withTimeout(promise, ms = 4000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => {
      const e = new Error("dns_timeout"); e.code = "ETIMEOUT"; reject(e);
    }, ms)),
  ]);
}

// Returns "yes" | "no" | "unknown".
//
// The distinction matters more than it looks. An earlier version returned a
// plain boolean and treated every failure as "no", which meant a DNS outage
// would silently block EVERY outreach email instead of a few dead ones. This
// fails OPEN: we only refuse to send when DNS positively told us the domain
// does not exist.
async function mxStatus(domain) {
  const hit = MX_CACHE.get(domain);
  if (hit && Date.now() - hit.at < (hit.status === "unknown" ? UNKNOWN_TTL_MS : MX_TTL_MS)) return hit.status;

  let status = "unknown";
  try {
    const records = await withTimeout(dns.resolveMx(domain));
    status = Array.isArray(records) && records.length > 0 ? "yes" : "no";
  } catch (e) {
    if (DEFINITELY_DEAD.has(e?.code)) {
      // No MX record. Some domains legitimately accept mail on their A record,
      // so check that before calling it dead.
      try {
        const a = await withTimeout(dns.resolve4(domain));
        status = Array.isArray(a) && a.length > 0 ? "yes" : "no";
      } catch (e2) {
        status = DEFINITELY_DEAD.has(e2?.code) ? "no" : "unknown";
      }
    } else {
      status = "unknown"; // our resolver failed, not their domain
    }
  }

  MX_CACHE.set(domain, { status, at: Date.now() });
  return status;
}

// Verify one address.
// Returns { email, ok, reason, role, verified, suggestion }
//   ok:false      → do not send. It will bounce or it is a throwaway.
//   ok:true       → safe to send.
//   verified:true → DNS positively confirmed the domain accepts mail.
//   verified:false with ok:true → we could not check (resolver problem). We send
//                   anyway rather than block a real customer over our own outage.
//   role:true     → deliverable, but a shared inbox. Prefer a human if you have one.
//   suggestion    → a likely typo fix, when we spotted one.
//
// Note on what this does NOT prove: a live domain can still have a dead mailbox.
// Confirming the mailbox itself needs an SMTP conversation on port 25, which
// Vercel blocks, so that check is impossible on this hosting and is not claimed.
export async function verifyEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!SYNTAX.test(email)) return { email, ok: false, verified: true, reason: "malformed" };

  const domain = email.split("@")[1];

  if (TYPOS[domain]) {
    return {
      email, ok: false, verified: true, reason: "likely_typo",
      suggestion: email.replace(domain, TYPOS[domain]),
    };
  }
  if (DISPOSABLE.has(domain)) return { email, ok: false, verified: true, reason: "disposable" };

  const status = await mxStatus(domain);
  if (status === "no") return { email, ok: false, verified: true, reason: "domain_cannot_receive_mail" };

  return {
    email,
    ok: true,
    verified: status === "yes",
    reason: status === "yes" ? "deliverable" : "unverified_send_anyway",
    role: ROLE.test(email),
  };
}

// Verify a batch, bounded so one slow resolver cannot stall an outreach run.
// Returns { good, bad } with the same objects verifyEmail produces.
export async function verifyEmails(list, { concurrency = 8 } = {}) {
  const items = [...new Set((list || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
  const out = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((e) => verifyEmail(e)));
    for (const s of settled) {
      // A DNS failure is not proof the address is bad, so an unexpected error
      // lets the address through rather than silently dropping a real customer.
      if (s.status === "fulfilled") out.push(s.value);
    }
  }
  return {
    good: out.filter((r) => r.ok),
    bad: out.filter((r) => !r.ok),
  };
}
