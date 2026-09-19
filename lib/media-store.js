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

// ── IN APPROVALS ──
// Pitches Genie found are also shown in Approvals, so the owner has ONE daily
// list. They stay these same rows: sending still goes through /api/prospects/send
// (Gmail, daily cap, opt-outs, address check) and marking still through
// /api/featured/act, so Get featured and Approvals always agree.
const PLAY_LABEL = {
  backlinks: "Get on a best-of list", guest: "Write a guest post", directory: "Get listed", press: "Press pitch",
  partners: "Partnership pitch", broken: "Replace a broken link", podcast: "Podcast pitch",
};

/** Not yet sent or skipped: still waiting for the owner. */
export function isPendingPitch(a) {
  return !a?.payload?.applied;
}

/** A pitch as an Approvals item (same shape /api/approvals returns for actions). */
export function pitchToApproval(a) {
  const o = actionToOpp(a);
  const email = o.contact?.email || null;
  return {
    id: o.id, source: "action", kind: "media_pitch", platform: email ? "email" : "form",
    owned: false, executable: false, brand: "mail",
    title: `${PLAY_LABEL[o.play] || "Pitch"}: ${o.company || o.domain}`,
    outcome: email ? `Sends from your Gmail to ${o.contact?.name || email}` : "Opens their contact form with your pitch copied",
    draft: o.body, subject: o.subject,
    why: [o.whyFit || o.summary, o.subject ? `Subject: ${o.subject}` : ""].filter(Boolean).join(" · ") || null,
    target_url: email ? null : (o.contact?.contactForm || o.url || null),
    pitch: { email, name: o.contact?.name || null, company: o.company || o.domain, subject: o.subject },
    keyword: null, relatedKeywords: [],
    impact: 78, tags: [{ label: "Earns a link", tone: "dawn" }],
  };
}
