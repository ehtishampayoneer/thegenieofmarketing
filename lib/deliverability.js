// lib/deliverability.js
// ── EMAIL DELIVERABILITY PREFLIGHT ──
// Outreach is Genie's fastest revenue path, but it dies silently if the user's sending
// domain isn't authenticated (SPF/DKIM/DMARC) — beautifully written email lands in
// spam and produces zero sales. This checks the REAL DNS of the sending domain and
// returns a readiness score + the exact records to fix, plus honest volume guidance.
// Pure DNS reads, no third-party service. Never throws.

import { promises as dns } from "dns";

// Network-level failures (resolver unreachable) — NOT the same as "record genuinely
// absent" (ENODATA/ENOTFOUND). We must not report a healthy domain as broken just
// because DNS was briefly unreachable.
const NET_ERR = new Set(["ECONNREFUSED", "ETIMEOUT", "ETIMEDOUT", "ESERVFAIL", "EREFUSED", "ECONNRESET"]);

async function txt(name) { try { return { data: (await dns.resolveTxt(name)).map((a) => a.join("")), err: null }; } catch (e) { return { data: [], err: e?.code || "ERR" }; } }
async function mx(name) { try { return { data: await dns.resolveMx(name), err: null }; } catch (e) { return { data: [], err: e?.code || "ERR" }; } }

// email OR domain in; a full report out.
export async function checkDeliverability(input) {
  const raw = String(input || "").trim().toLowerCase();
  const domain = raw.includes("@") ? raw.split("@")[1] : raw;
  if (!domain || !/\.[a-z]{2,}$/.test(domain)) return { ok: false, reason: "no_domain" };

  // Personal Gmail: deliverable but capped + weaker cold reputation. No DNS to fix.
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return {
      ok: true, domain, provider: "personal_gmail", score: 62, grade: "Okay",
      checks: [
        { id: "provider", label: "Sending from personal Gmail", status: "warn", note: "It delivers, but personal Gmail is capped (~500/day) and gets more scrutiny for cold outreach. For real volume and trust, send from your own domain on Google Workspace." },
      ],
      fixes: ["Move sending to your own domain (Google Workspace) to lift caps and trust.", "Until then, keep volume low and personal."],
      volume: { start: 20, ramp: "+10/day", ceiling: 150, note: "Start ~20/day and ramp slowly. Never blast from a personal Gmail." },
    };
  }

  const [spf, dmarc, dkimGoogle, dkimDefault, mxr] = await Promise.all([
    txt(domain), txt(`_dmarc.${domain}`), txt(`google._domainkey.${domain}`), txt(`default._domainkey.${domain}`), mx(domain),
  ]);

  // If the resolver itself was unreachable for the base lookups, we CAN'T judge the
  // domain — say so honestly instead of failing a healthy domain.
  if (NET_ERR.has(spf.err) && NET_ERR.has(mxr.err)) {
    return { ok: true, domain, provider: "custom_domain", unknown: true, message: "Couldn't reach DNS to check your domain right now. Try again in a moment." };
  }

  const hasMx = mxr.data.length > 0;
  const spfRec = spf.data.find((r) => /v=spf1/i.test(r)) || null;
  const hasSpf = !!spfRec;
  const spfGoogle = !!spfRec && /_spf\.google\.com/i.test(spfRec);
  const hasDmarc = dmarc.data.some((r) => /v=dmarc1/i.test(r));
  const dmarcRec = dmarc.data.find((r) => /v=dmarc1/i.test(r)) || "";
  const dmarcEnforced = /p=\s*(quarantine|reject)/i.test(dmarcRec);
  const hasDkim = dkimGoogle.data.length > 0 || dkimDefault.data.length > 0;

  const checks = [
    hasMx
      ? { id: "mx", label: "Mail is set up (MX)", status: "ok", note: "Your domain can receive mail." }
      : { id: "mx", label: "No MX records", status: "warn", note: "No mail server found for this domain — double-check it's your real sending domain." },
    hasSpf
      ? { id: "spf", label: `SPF present${spfGoogle ? " (allows Google)" : ""}`, status: spfGoogle ? "ok" : "warn", note: spfGoogle ? "Receivers know Google is allowed to send for you." : "You have SPF, but it doesn't list Google. If you send via Gmail/Workspace, add Google to it." }
      : { id: "spf", label: "SPF missing", status: "fail", note: "Without SPF, mailboxes can't verify your sender — a top spam trigger." },
    hasDkim
      ? { id: "dkim", label: "DKIM present", status: "ok", note: "Your mail is cryptographically signed." }
      : { id: "dkim", label: "DKIM not found", status: "fail", note: "Without DKIM, your mail is far more likely to be spam-filtered." },
    hasDmarc
      ? { id: "dmarc", label: `DMARC present${dmarcEnforced ? " (enforced)" : " (monitor only)"}`, status: dmarcEnforced ? "ok" : "warn", note: dmarcEnforced ? "You have a policy telling receivers what to do with fakes." : "DMARC is set to monitor. That's a fine start; tighten to quarantine later." }
      : { id: "dmarc", label: "DMARC missing", status: "warn", note: "DMARC ties SPF + DKIM together and builds domain trust over time." },
  ];

  // Weighted score: DKIM and SPF matter most for the inbox.
  const score = Math.round(
    (spfGoogle ? 30 : hasSpf ? 18 : 0) +
    (hasDkim ? 35 : 0) +
    (hasDmarc ? (dmarcEnforced ? 25 : 18) : 0) +
    (hasMx ? 10 : 0)
  );
  const grade = score >= 85 ? "Strong" : score >= 60 ? "Okay" : score >= 35 ? "Weak" : "At risk";

  const fixes = [];
  if (!hasSpf) fixes.push(`Add a TXT record on ${domain}:  v=spf1 include:_spf.google.com ~all`);
  else if (!spfGoogle) fixes.push(`Update your SPF TXT to include Google:  add "include:_spf.google.com" before the ~all`);
  if (!hasDkim) fixes.push("Turn on DKIM in Google Admin → Apps → Google Workspace → Gmail → Authenticate email, then publish the generated TXT at google._domainkey." );
  if (!hasDmarc) fixes.push(`Add a TXT record at _dmarc.${domain}:  v=DMARC1; p=none; rua=mailto:you@${domain}  (start on 'none', tighten later)`);
  if (!fixes.length) fixes.push("You're authenticated. Keep volume steady and your list clean to protect the reputation you've built.");

  const volume = score >= 85
    ? { start: 40, ramp: "+20/day", ceiling: 500, note: "Well authenticated. Still warm up gradually and keep bounce/complaint rates low." }
    : score >= 60
    ? { start: 25, ramp: "+10/day", ceiling: 300, note: "Decent. Fix the flags below before scaling past ~50/day." }
    : { start: 10, ramp: "+5/day", ceiling: 100, note: "Fix authentication first — sending more now will burn your domain reputation." };

  return { ok: true, domain, provider: "custom_domain", score, grade, checks, fixes, volume };
}
