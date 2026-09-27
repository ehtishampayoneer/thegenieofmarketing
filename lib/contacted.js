// lib/contacted.js
// ── WHO THE OWNER HAS ALREADY WRITTEN TO ──
//
// Find clients never asked. Every search started from nothing, so a company the
// owner had emailed on Monday came back on Wednesday as a new find, got its site
// fetched and profiled again, and was offered as a fresh lead — with a fresh cold
// pitch that ignored the one already sitting in their inbox. The owner noticed the
// same names coming round and stopped trusting the list.
//
// A company is "already contacted" when either:
//   - an email to it is in the send log (sent, failed or bounced — any of them
//     means it is not a new find), or
//   - an email to it is waiting in the approvals queue right now.
// It is matched by the domain of the address, because the same company is often
// written to at info@ and again at sales@. Free-mail domains are the exception: a
// shop that uses a Gmail address must not make every other Gmail shop disappear,
// so those are matched by the exact address instead.
//
// What happens to them next is the follow-up engine's job (lib/followup.js), which
// has its own schedule. They are never a new find again.

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "outlook.com", "hotmail.com",
  "hotmail.co.uk", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me",
  "protonmail.com", "gmx.de", "gmx.net", "gmx.com", "web.de", "yandex.com", "yandex.ru",
  "mail.com", "zoho.com", "t-online.de", "orange.fr", "libero.it",
]);

export const bareDomain = (d) =>
  String(d || "").toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];

export const domainOfEmail = (e) => bareDomain(String(e || "").split("@")[1] || "");

export function isFreeMail(domain) {
  return FREE_MAIL.has(bareDomain(domain));
}

/**
 * @returns {{ domains: Set<string>, emails: Set<string> }}
 *   domains — company domains already contacted (free-mail excluded)
 *   emails  — every exact address already contacted or queued
 */
export async function contactedSet(supabase, userId) {
  const domains = new Set();
  const emails = new Set();
  if (!supabase || !userId) return { domains, emails };

  const note = (address) => {
    const e = String(address || "").toLowerCase().trim();
    if (!e || !e.includes("@")) return;
    emails.add(e);
    const d = domainOfEmail(e);
    if (d && !isFreeMail(d)) domains.add(d);
  };

  try {
    const { data } = await supabase.from("outreach_log")
      .select("contact_email").eq("user_id", userId).limit(5000);
    for (const r of data || []) note(r.contact_email);
  } catch {}

  // Queued but not yet sent is still "already contacted" for a search: offering
  // the same company again would just put two emails to it in the queue.
  try {
    const { data } = await supabase.from("actions")
      .select("payload").eq("user_id", userId).eq("type", "outreach_email")
      .in("status", ["proposed", "needs_review"]).limit(2000);
    for (const r of data || []) note(r.payload?.to);
  } catch {}

  return { domains, emails };
}

/** True when this company, or this exact address, has already been reached. */
export function alreadyContacted(set, { domain = null, email = null } = {}) {
  if (!set) return false;
  const e = String(email || "").toLowerCase().trim();
  if (e && set.emails.has(e)) return true;
  const d = bareDomain(domain);
  return !!(d && !isFreeMail(d) && set.domains.has(d));
}
