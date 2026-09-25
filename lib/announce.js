// lib/announce.js
// ── THE OWNER'S OWN MESSAGE ──
//
// Genie writes first-contact pitches and follow-ups, and that is all it has ever
// been able to write. So an owner with something to say — a new product, a price
// change, a December offer, "we now ship to the UAE" — had no way to say it. They
// know their stock, their margins and their seasons; Genie does not and will not.
// The gap was never that Genie should decide to run an offer. It was that there was
// no way to hand it over when the owner had already decided.
//
// WHAT THIS IS NOT. It is not a newsletter tool and it is not a bulk sender. It
// reaches people this owner has ALREADY been in contact with, one message at a
// time, through the same sender, the same daily allowance, the same suppression
// list and the same unsubscribe link as everything else. A cold list and an
// announcement are different things in law as well as in manners, and the one
// audience it will not touch is people who have never heard from this business.

import { getEvents } from "@/lib/events";

// Who an announcement may go to, and why each is defensible.
export const AUDIENCES = {
  replied: {
    label: "People who replied to you",
    why: "They wrote back. This is the warmest list you have and the only one where a second message is clearly welcome.",
  },
  contacted: {
    label: "Everyone you have emailed",
    why: "They have heard from you before, so this is a follow-on rather than a cold approach. Anyone who unsubscribed or bounced is left out automatically.",
  },
  leads: {
    label: "People who left their email on your site",
    why: "They asked to hear from you. The strongest permission in the list.",
  },
};

export const MAX_RECIPIENTS = 200;

/**
 * Who is actually reachable for one of the audiences above. Applies the same rules
 * the outreach engine applies, so an announcement can never reach someone outreach
 * would refuse. Returns [{ email, name }]. Never throws.
 */
export async function audienceFor(supabase, userId, key, { limit = MAX_RECIPIENTS } = {}) {
  const out = new Map();
  if (!supabase || !userId || !AUDIENCES[key]) return [];

  try {
    if (key === "leads") {
      const evs = await getEvents(supabase, { userId, types: ["lead.captured"], limit: 500 });
      for (const e of evs || []) {
        const email = String(e?.data?.email || "").trim().toLowerCase();
        if (email && !out.has(email)) out.set(email, { email, name: e?.data?.name || null });
      }
    } else {
      let q = supabase.from("outreach_log")
        .select("contact_email, contact_name, replied_at, status")
        .eq("user_id", userId).not("sent_at", "is", null)
        .order("sent_at", { ascending: false }).limit(1000);
      if (key === "replied") q = q.not("replied_at", "is", null);
      const { data } = await q;
      for (const r of data || []) {
        const email = String(r?.contact_email || "").trim().toLowerCase();
        // A bounce or an opt-out is a no for every future message, not just the
        // campaign it happened on.
        if (!email || ["bounced", "unsubscribed", "failed"].includes(String(r.status || ""))) continue;
        if (!out.has(email)) out.set(email, { email, name: r.contact_name || null });
      }
    }
  } catch { return []; }

  return [...out.values()].slice(0, limit);
}

/**
 * What an announcement may not be. Checked before a single message goes out,
 * because the owner is writing this one themselves and the guard that reads Genie's
 * own drafts never sees it.
 */
export function checkAnnouncement({ subject, body } = {}) {
  const s = String(subject || "").trim();
  const b = String(body || "").trim();
  if (s.length < 3) return { ok: false, error: "Give it a subject line. It is the only thing most people read." };
  if (s.length > 140) return { ok: false, error: "That subject is too long to survive an inbox. Keep it under 140 characters." };
  if (b.length < 40) return { ok: false, error: "Write a little more. Under forty characters reads as a mistake, not a message." };
  if (b.length > 8000) return { ok: false, error: "That is too long for an email. Put the detail on a page and link to it." };
  return { ok: true };
}

/** Plain English for how far this will actually get today. */
export function reachNote(total, capLeft) {
  if (!total) return "Nobody is in this list yet. It fills as Genie emails people and as leads arrive on your site.";
  if (capLeft <= 0) return `${total} ${total === 1 ? "person" : "people"} in this list, but today's sending allowance is used up. Genie will send the rest tomorrow.`;
  if (total <= capLeft) return `${total} ${total === 1 ? "person" : "people"}, and today's allowance covers all of them.`;
  return `${total} people. Today's allowance covers ${capLeft}; Genie sends the rest over the next days rather than risking your address.`;
}
