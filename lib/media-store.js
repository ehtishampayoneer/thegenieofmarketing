// lib/media-store.js
// Earned-media opportunities are persisted as rows in the shared `actions` table
// (type = "media_outreach"), so no new DB migration is needed. These helpers keep the
// action<->opportunity shape and the dedupe policy in ONE place, used by the
// featured discover/list/act routes and excluded from the Approvals queue.

export const MEDIA_TYPE = "media_outreach";
// A site you APPLIED to won't be re-surfaced by a re-scan for this many days (sensible
// follow-up gap; pitching the same editor repeatedly just gets you ignored/marked spam).
export const REAPPLY_DAYS = 60;

// Map a stored action row to the opportunity the UI renders.
export function actionToOpp(a) {
  const p = a.payload || {};
  return {
    id: a.id,
    play: p.play || "backlinks",
    company: p.company || p.domain || "",
    domain: p.domain || "",
    url: p.url || (p.domain ? `https://${p.domain}` : ""),
    summary: p.summary || "",
    whyFit: p.whyFit || "",
    contact: p.contact || { email: null, channel: "form", contactForm: p.url || null },
    subject: p.subject || "",
    body: p.body || "",
    applied: !!p.applied,
    appliedAt: p.appliedAt || null,
    createdAt: a.created_at || null,
  };
}
