// lib/recovery.js
// ── REVENUE RECOVERY ──
// The fastest money a business has is hidden in its OWN warm data: old leads,
// abandoned carts/trials, quotes with no answer, past customers due to reorder, quiet
// deals. These people already know the brand, so a good re-engagement converts in
// days — legal (a prior relationship), free (reuses Gmail send + the Inbox), and it's
// the "money now" layer on top of Genie's slower organic engine.
// This module classifies each contact and writes ONE specific, time-bound win-back
// email per person (never a generic "just checking in"). Robust groq-first AI, with a
// solid template fallback so every contact always has a sendable message.

import { aiList } from "@/lib/prospects";

export const SEGMENTS = {
  abandoned: { label: "Abandoned checkout / trial", tone: "dawn" },
  proposal: { label: "Proposal sent, no answer", tone: "info" },
  past_customer: { label: "Past customer · reorder", tone: "live" },
  quiet_lead: { label: "Lead went quiet", tone: "neutral" },
  upsell: { label: "Upsell / expansion", tone: "dawn" },
};

const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const num = (v) => { const n = Number(String(v || "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };

// Draft win-back emails for a batch of contacts in ONE robust AI call (rate-limit
// safe). Falls back to a strong template per contact if the model is unavailable.
export async function batchRecover(contacts, business, offer) {
  const compact = contacts.map((c, i) => ({ i, name: c.name || "", company: c.company || "", lastContact: c.lastContact || "", value: c.dealValue || "", notes: String(c.notes || "").slice(0, 160) }));
  let arr = [];
  try {
    arr = await aiList({
      system: "You are Genie's win-back specialist. For EACH past lead/customer, classify their segment and write ONE short, warm, specific re-engagement email that references their history and makes a clear, time-bound reason to act — NEVER a generic 'just checking in'. Human tone, no hype, no em-dashes, no emoji. Return ONLY a JSON array, one object per contact, same order.",
      json: true, maxTokens: 3000, temperature: 0.6,
      prompt: `SENDER (us): ${business?.name || ""} — ${business?.pitch || business?.whatTheySell || ""} (${business?.website || ""}).
OFFER to include if provided: ${offer || "(none given — craft a genuine, low-pressure reason to reconnect and one clear next step)"}.

Segments: abandoned, proposal, past_customer, quiet_lead, upsell.
PAST CONTACTS (JSON): ${JSON.stringify(compact)}

For each contact return one object in the SAME order:
[{ "i": 0, "segment": "quiet_lead", "subject": "specific subject under 55 chars", "body": "70-110 word warm win-back email that references their history, includes the offer if any, and gives ONE clear next step (reply, book a call, or claim the offer)" }]`,
    });
  } catch { arr = []; }
  const byIdx = new Map((arr || []).map((p) => [Number(p.i), p]));

  return contacts.map((c, i) => {
    const p = byIdx.get(i) || {};
    const segment = SEGMENTS[p.segment] ? p.segment : inferSegment(c);
    return {
      ...c,
      segment,
      subject: (p.subject || defaultSubject(c, business)).slice(0, 90),
      body: p.body || defaultBody(c, business, offer),
    };
  });
}

function inferSegment(c) {
  const t = `${c.notes || ""} ${c.status || ""}`.toLowerCase();
  if (/cart|checkout|trial|sign ?up/.test(t)) return "abandoned";
  if (/proposal|quote|estimate|contract/.test(t)) return "proposal";
  if (/customer|purchased|bought|order|client/.test(t)) return "past_customer";
  if (num(c.dealValue) > 0 && /customer|purchased|bought/.test(t)) return "upsell";
  return "quiet_lead";
}
function defaultSubject(c, business) {
  const fn = firstName(c.name);
  return `${fn ? fn + ", a" : "A"} quick note from ${business?.name || "us"}`;
}
function defaultBody(c, business, offer) {
  const fn = firstName(c.name) || "there";
  const me = business?.name || "our team";
  return `Hi ${fn},\n\nIt's ${me}. We spoke a while back and I didn't want to leave things there. ${offer ? `We've got something that might be perfect timing: ${offer}. ` : `I'd love to help you pick up where we left off. `}Would you be open to a quick reply so I can sort this for you this week?\n\nThanks,\n${business?.senderName || me}`;
}

// Normalize a parsed CSV row (flexible header names) into a contact.
export function normalizeContact(row) {
  const g = (keys) => { for (const k of Object.keys(row)) { const lk = k.toLowerCase().trim(); if (keys.some((x) => lk === x || lk.includes(x))) return String(row[k] || "").trim(); } return ""; };
  return {
    name: g(["name", "full name", "contact", "first name"]) || "",
    email: g(["email", "e-mail"]) || "",
    company: g(["company", "organization", "business", "account"]) || "",
    dealValue: g(["value", "deal", "amount", "price", "revenue", "mrr"]) || "",
    lastContact: g(["last contact", "date", "last seen", "created", "inquired"]) || "",
    notes: g(["notes", "status", "stage", "reason", "detail"]) || "",
  };
}

export const dealNum = num;
