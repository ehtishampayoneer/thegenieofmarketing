// lib/followup.js
// ── THE SECOND AND THIRD EMAIL ──
//
// A first cold email gets a reply one to three times in a hundred. Two follow-ups
// roughly double that, and most of the replies a campaign ever gets arrive on the
// second or third message rather than the first. Genie sent once and stopped,
// which threw away about half the results of the channel it leads with. The
// column for it existed and nothing ever wrote to it.
//
// WHAT THIS IS NOT. It is not a drip sequence that keeps going until someone
// answers. Two follow-ups, then the contact is marked cold and left alone. That
// is a deliberate ceiling, not a limitation: past three unanswered messages the
// reply rate collapses, the complaint rate does not, and in Germany "unreasonable
// harassment" is a legal test rather than a figure of speech.
//
// Each step is a different angle, never a resend. The model is given what was
// already said precisely so it does not repeat it, and each step is shorter than
// the one before — the last one is two lines and an easy way out.

import { callAI, QualityUnavailableError } from "@/lib/ai-router";
import { recordEvent } from "@/lib/events";

// Days after the FIRST message. Step one lands while they still half-remember it;
// step two a week later, when the first has fallen off the screen entirely.
export const STEP_AFTER_DAYS = [4, 8];
export const MAX_FOLLOWUPS = STEP_AFTER_DAYS.length;

// No reply after this long, with both follow-ups sent: stop. The event carries the
// date so a re-approach with a genuinely new angle can be built on it later.
export const COLD_AFTER_DAYS = 14;

// Two sends can never land on the same person on the same day, whatever the
// arithmetic above says.
const MIN_GAP_DAYS = 3;

const DAY = 86400000;
const daysSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / DAY : Infinity);

/**
 * Who is due a follow-up, and who has gone cold.
 *
 * Reads the owner's send log, groups it by person, and works out which step each
 * one is on. Anyone who replied, bounced, failed or unsubscribed drops out
 * immediately — chasing them is the one thing worse than not following up.
 *
 * Returns { due: [...], cold: [...] }. Never throws.
 */
export async function dueFollowUps(supabase, userId, host, { limit = 10 } = {}) {
  const empty = { due: [], cold: [] };
  if (!supabase || !userId) return empty;

  let rows = [];
  try {
    let q = supabase.from("outreach_log")
      .select("contact_email, contact_name, subject, body, status, sent_at, replied_at, is_followup, followup_step, source, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (host) q = q.eq("host", host);
    const { data } = await q;
    rows = data || [];
  } catch { return empty; }
  if (!rows.length) return empty;

  const byEmail = new Map();
  for (const r of rows) {
    const key = String(r.contact_email || "").toLowerCase();
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(r);
  }

  const due = [], cold = [];
  for (const [email, msgs] of byEmail) {
    // Any reply at all, and this person is a conversation, not a campaign.
    if (msgs.some((m) => m.replied_at)) continue;
    // A bad address or an opt-out ends it permanently.
    if (msgs.some((m) => ["bounced", "unsubscribed", "failed"].includes(String(m.status || "")))) continue;

    const sentMsgs = msgs.filter((m) => m.sent_at);
    if (!sentMsgs.length) continue;

    const first = sentMsgs[0];
    const last = sentMsgs[sentMsgs.length - 1];
    const steps = sentMsgs.filter((m) => m.is_followup).length;
    const sinceFirst = daysSince(first.sent_at);
    const sinceLast = daysSince(last.sent_at);

    if (steps >= MAX_FOLLOWUPS || sinceFirst >= COLD_AFTER_DAYS) {
      // Both messages sent, or long enough that a third would be nagging.
      if (sinceFirst >= COLD_AFTER_DAYS) {
        cold.push({ email, name: first.contact_name || null, sentCount: sentMsgs.length, source: first.source || null, firstSentAt: first.sent_at });
      }
      continue;
    }

    if (sinceFirst < STEP_AFTER_DAYS[steps]) continue;
    if (sinceLast < MIN_GAP_DAYS) continue;

    due.push({
      email,
      name: first.contact_name || null,
      step: steps + 1,
      // Provenance travels with the send record precisely so a follow-up months
      // later can still answer where the address came from.
      source: first.source || null,
      firstSentAt: first.sent_at,
      daysSince: Math.floor(sinceFirst),
      previous: { subject: last.subject || "", body: String(last.body || "").slice(0, 900) },
    });
  }

  // Oldest first: the person waiting longest is the one closest to going cold.
  due.sort((a, b) => Date.parse(a.firstSentAt || 0) - Date.parse(b.firstSentAt || 0));
  const picked = due.slice(0, limit);

  // Which pitch this person needs. The send log records who was written to and
  // when, not what kind of company they are, so the niche that found them is read
  // back from the directory. Without it a follow-up to an agency would arrive
  // arguing the customer price — the exact mistake the first email avoided.
  if (picked.length) {
    try {
      const { data: known } = await supabase.from("directory_contacts")
        .select("email, company, industry").in("email", picked.map((p) => p.email));
      const by = {};
      for (const k of known || []) by[String(k.email || "").toLowerCase()] = k;
      for (const p of picked) {
        const k = by[p.email];
        if (k) { p.company = k.company || null; p.industry = k.industry || null; }
      }
    } catch {}
  }

  return { due: picked, cold };
}

/** What each step is for, in the words the model needs. */
export function stepBrief(step) {
  if (step === 1) {
    return `This is the SECOND message, four days after the first. They did not reply, which usually means they did not read it rather than that they said no.
Write a SHORT nudge with a DIFFERENT angle on the same offer — a different reason it matters to them, or one concrete specific about their business. Do not summarise the first email and do not ask "did you see my last message". Under 60 words. No guilt, no urgency, no "just checking in".`;
  }
  return `This is the THIRD and LAST message. Nothing after this.
Two or three lines. Give them an easy, graceful way out: say plainly that this is the last time you will write, and that they can ignore it with no hard feelings. Under 45 words. It must not read as disappointed or passive-aggressive. Some of the best replies a campaign gets come from exactly this message, because it costs the reader nothing to answer.`;
}

export function followUpPrompt({ contact, business, step, previous, plan = "" }) {
  return `You are writing a follow-up email on behalf of ${business?.name || "the sender"}.

${plan}
RECIPIENT: ${contact.name || "there"}${contact.company ? ` at ${contact.company}` : ""}
IT HAS BEEN ${contact.daysSince} DAYS AND THEY HAVE NOT REPLIED.

WHAT YOU ALREADY SENT THEM (do NOT repeat any of it):
Subject: ${previous?.subject || "(unknown)"}
${previous?.body || ""}

${stepBrief(step)}

Never invent a fact, a result or a customer. No em-dashes. Write like one person to another.
Return ONLY JSON: {"subject":"...","body":"..."}
The subject must NOT start with "Re:" — this is a new message, not a faked reply.`;
}

/**
 * Write one follow-up. Writer-grade model or nothing: a limp second email is
 * worse than no second email, because it spends the last attention this person
 * will give. Returns { subject, body } or { failed: true }.
 */
export async function draftFollowUp({ contact, business, step, previous, plan = "", userId = null, host = null }) {
  try {
    const res = await callAI({
      system: "You write short, human B2B follow-up emails. You never repeat what was already sent, never guilt the reader, and never invent facts. Return JSON only.",
      prompt: followUpPrompt({ contact, business, step, previous, plan }),
      json: true, maxTokens: 500, temperature: 0.7, timeoutMs: 40000,
      quality: "best", userId, host, tag: "followup",
    });
    const subject = String(res?.json?.subject || "").trim().replace(/^re:\s*/i, "");
    const body = String(res?.json?.body || "").trim();
    if (!subject || !body) return { failed: true, reason: "empty" };
    return { subject, body };
  } catch (e) {
    // Nothing writer-grade was free, or the model failed. Either way this person
    // waits for tomorrow rather than getting a weak message today.
    return { failed: true, reason: e instanceof QualityUnavailableError ? "writer_unavailable" : "ai_failed" };
  }
}

/**
 * Stop writing to people who never answered, and record it so the learning loop
 * can see which segments go quiet — which is a finding, not just an absence.
 */
export async function markCold(supabase, { userId, host, cold = [] }) {
  let n = 0;
  for (const c of cold.slice(0, 50)) {
    try {
      await recordEvent(supabase, {
        userId, host, type: "outreach.cold", actor: "genie", subject: c.email,
        data: { email: c.email, name: c.name, messages: c.sentCount, source: c.source, firstSentAt: c.firstSentAt },
        // Once per person, ever.
        dedupeKey: `cold:${userId}:${c.email}`,
      });
      n++;
    } catch {}
  }
  return n;
}
