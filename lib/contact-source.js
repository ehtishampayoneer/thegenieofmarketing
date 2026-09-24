// lib/contact-source.js
// ── WHERE THIS ADDRESS CAME FROM, AND WHETHER GENIE MAY WRITE TO IT ──
//
// Genie's one real advantage over every paid prospecting tool is that it never
// guesses an address and never buys a list. It finds the address the company
// published itself — on their own contact page, or in a directory they chose to
// list themselves in — and writes from the owner's own mailbox.
//
// That has been true because the discovery code was careful, and because the
// comments told the next person to be careful. That is not the same as being
// enforced. It takes one hurried afternoon — or one future assistant "just
// testing" a purchased CSV — for the promise to quietly become false, and the
// first sign of it is bounces, a throttled mailbox, and in several countries a
// fine.
//
// So provenance travels with the contact, and the send refuses what it cannot
// account for. Anything whose origin is unknown is refused, not assumed: a
// contact with no source is exactly what an imported list looks like.
//
// WHY THIS IS ALSO THE LEGAL GATE. Canada's rules allow a cold message to an
// address the recipient "conspicuously published" without a notice refusing such
// mail, where the message is relevant to their role. Germany and most of the EU
// expect the same published-source basis plus a clear opt-out. Every one of those
// regimes asks the same first question this file answers: where did you get this
// address? A system that can answer per-contact is a system that can send abroad.

/**
 * Every provenance Genie recognises.
 *   published — the company or person put this address in public themselves.
 *   owned     — the owner's own relationship: their list, their customers, a
 *               person they asked Genie to write to. Not cold, different basis.
 *   refused   — provenance we will not send to, whatever else is true of it.
 */
export const SOURCES = {
  // The prospect engine read it off the company's own website.
  discovery: { published: true, label: "published on the company's own site" },
  site: { published: true, label: "published on the company's own site" },
  // A public business directory the company listed itself in, contact included.
  directory: { published: true, label: "published in a public business directory" },

  // The owner's own contacts: an upload of their past leads, or an address they
  // typed in themselves. Not cold outreach, and not ours to second-guess.
  owner: { owned: true, label: "the owner's own contact" },
  import: { owned: true, label: "uploaded by the owner from their own records" },
  reply: { owned: true, label: "someone who wrote to the owner first" },

  // Named so the refusal message can be specific rather than generic.
  purchased: { refused: true, label: "a bought list" },
  guessed: { refused: true, label: "a guessed address pattern" },
  scraped: { refused: true, label: "scraped from somewhere the company did not publish" },
};

/** Sources Genie may send a first, unsolicited message to. */
export const COLD_SOURCES = Object.keys(SOURCES).filter((k) => SOURCES[k].published);

/**
 * May Genie send to an address from this source?
 * Returns { ok } or { ok:false, reason } with a sentence worth showing a human.
 * Unknown and missing both fail: a contact that cannot say where it came from is
 * indistinguishable from one that was bought.
 */
export function checkSource(source) {
  const key = String(source || "").trim().toLowerCase();
  if (!key) {
    return {
      ok: false,
      code: "no_source",
      reason: "This contact does not record where its address came from. Genie only writes to addresses a company published itself, so it will not send this one.",
    };
  }
  const s = SOURCES[key];
  if (!s) {
    return {
      ok: false,
      code: "unknown_source",
      reason: `This contact came from "${key}", which Genie does not recognise. Genie only writes to addresses a company published itself.`,
    };
  }
  if (s.refused) {
    return {
      ok: false,
      code: "refused_source",
      reason: `This address came from ${s.label}. Genie never writes to those: they bounce, bounces get your own mailbox marked as spam, and in several countries it is unlawful.`,
    };
  }
  return { ok: true, published: !!s.published, owned: !!s.owned, label: s.label };
}

/** The short phrase for "where did you get this?", for an email footer or a log. */
export function sourceLabel(source) {
  const c = checkSource(source);
  return c.ok ? c.label : "an unverified source";
}

/**
 * The line a cold email puts in its footer in the stricter jurisdictions, where
 * the recipient is entitled to know how you got their address. True by
 * construction here, because the send refuses anything it cannot say this about.
 */
export function provenanceLine(source, domain = "") {
  const c = checkSource(source);
  if (!c.ok || !c.published) return "";
  return domain
    ? `You are receiving this because ${domain} publishes this address publicly.`
    : "You are receiving this because this address is published publicly.";
}
