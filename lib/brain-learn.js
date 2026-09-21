// lib/brain-learn.js
// ── WHAT THE ENGINES LEARNED, GOING BACK INTO THE PLAN ──
//
// lib/brain.js is how every engine READS the one plan. This is the other
// direction: the specialist engines find things out, and the plan is how the
// whole product acts on what they found.
//
// Until now the plan only ever changed two ways: Genie drafted it once, or the
// owner edited it. Everything Genie learned afterwards — which searches really
// bring people, which keyword actually earned money, which kind of company
// replies, which platform is worth the effort — went into Growth Memory and
// steered individual engines, but never corrected the plan those engines work
// to. So Genie could spend months knowing that rug retailers reply and
// furniture chains never do, while the plan still said to target both.
//
// WHAT THIS WILL NOT DO. It does not change the plan. It proposes a change and
// the owner accepts it, for two reasons. A plan that rewrites itself makes "one
// correction reaches everything" untrue, because the owner's correction could be
// silently undone the next night. And a proposal the owner can read is the only
// way they ever find out what Genie learned.
//
// EVIDENCE ONLY. Every proposal has to point at something countable that already
// happened: real Search Console clicks, a recorded conversion, a reply that
// arrived. A model is used to phrase the change, never to decide there is one.
// If the evidence is thin, this does nothing at all, which is the common case
// early on and is correct.

import { normalizeStrategy, strategyReady } from "@/lib/strategy";
import { storedStrategy } from "@/lib/strategy-store";
import { getEvents, recordEvent } from "@/lib/events";
import { getConversionBoosts, getChannelWeights } from "@/lib/learning";

// Below this there is not enough to say anything honest. Three separate facts is
// the floor: one good week of one keyword is a coincidence.
const MIN_FACTS = 3;

// Don't pester. One proposal at a time, and a fresh look no more than weekly.
const REPROPOSE_DAYS = 7;

// ── EVIDENCE ────────────────────────────────────────────────────────────────

/**
 * Things that measurably happened, in plain sentences the owner can check.
 * Every item carries `fact` (what to show them) and `field` (what it informs).
 * Returns { facts: [...], counts: {...} }. Never throws.
 */
export async function gatherEvidence(supabase, { userId, host }) {
  const facts = [];
  const counts = { searches: 0, converted: 0, replies: 0, channels: 0 };
  if (!supabase || !userId || !host) return { facts, counts };

  // 1) The searches really bringing people. Search Console only: an estimate has
  //    no business correcting the plan.
  try {
    const { data } = await supabase.from("keywords")
      .select("keyword, gsc_clicks, gsc_impressions")
      .eq("user_id", userId).eq("host", host)
      .gt("gsc_clicks", 0).order("gsc_clicks", { ascending: false }).limit(6);
    for (const k of data || []) {
      counts.searches++;
      facts.push({
        field: "whereTheyLook",
        fact: `"${k.keyword}" brought ${k.gsc_clicks} real visit${k.gsc_clicks === 1 ? "" : "s"} from Google`,
        value: k.keyword,
      });
    }
  } catch {}

  // 2) The keywords that actually earned money. The strongest signal there is.
  try {
    const boosts = await getConversionBoosts(supabase, userId, host);
    for (const [keyword, weight] of Object.entries(boosts).sort((a, b) => b[1] - a[1]).slice(0, 4)) {
      counts.converted++;
      facts.push({
        field: "contentThemes",
        fact: `writing about "${keyword}" led to a sale`,
        value: keyword,
        weight,
      });
    }
  } catch {}

  // 3) Who actually replies to outreach. This is the one that can correct "who
  //    you sell to", which is the most expensive field to have wrong.
  try {
    const { data: log } = await supabase.from("outreach_log")
      .select("contact_email, replied_at").eq("user_id", userId)
      .not("replied_at", "is", null).limit(60);
    const emails = (log || []).map((r) => r.contact_email).filter(Boolean);
    if (emails.length) {
      const { data: who } = await supabase.from("directory_contacts")
        .select("email, industry, company").in("email", emails.slice(0, 50));
      const byIndustry = {};
      for (const c of who || []) {
        const key = String(c.industry || "").trim();
        if (key) byIndustry[key] = (byIndustry[key] || 0) + 1;
      }
      for (const [industry, n] of Object.entries(byIndustry).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
        counts.replies++;
        facts.push({
          field: "who",
          fact: `${n} repl${n === 1 ? "y" : "ies"} to your outreach came from ${industry}`,
          value: industry,
        });
      }
    }
  } catch {}

  // 4) Which places are worth the effort. A weight above 1 means the engagement
  //    tracker saw real traction there; below 1 means it did not.
  try {
    const weights = await getChannelWeights(supabase, userId, host);
    for (const [channel, w] of Object.entries(weights)) {
      if (w >= 1.2) {
        counts.channels++;
        facts.push({ field: "whereTheyLook", fact: `posts on ${channel} are getting real engagement`, value: channel });
      }
    }
  } catch {}

  return { facts, counts };
}

// ── THE PROPOSAL ────────────────────────────────────────────────────────────

/** The pending proposal, if there is one the owner has not answered. */
export async function storedProposal(supabase, userId) {
  try {
    const rows = await getEvents(supabase, { userId, types: ["strategy.proposed"], limit: 1 });
    const p = rows?.[0];
    if (!p?.data?.patch) return null;
    // Answered already? Then it is history, not a question.
    const answered = await getEvents(supabase, { userId, types: ["strategy.proposal.answered"], limit: 1 });
    if (answered?.[0] && Date.parse(answered[0].created_at || 0) >= Date.parse(p.created_at || 0)) return null;
    return { patch: p.data.patch, facts: p.data.facts || [], at: p.created_at };
  } catch { return null; }
}

/** Record that the owner accepted or dismissed it, so it stops being asked. */
export async function answerProposal(supabase, { userId, host, accepted }) {
  try {
    await recordEvent(supabase, {
      userId, host, type: "strategy.proposal.answered", actor: "human",
      subject: accepted ? "accepted" : "dismissed", data: { accepted: !!accepted },
    });
  } catch {}
}

/**
 * Look at what really happened and, if it disagrees with the plan, write down a
 * proposed correction for the owner to accept. Returns a short result object for
 * the nightly ledger. Never throws, never changes the plan.
 */
export async function proposePlanRevision(supabase, { userId, host, ai = null }) {
  try {
    if (!supabase || !userId || !host) return { ok: false, reason: "no_entity" };

    // Already waiting on the owner? Asking twice is nagging, not learning.
    if (await storedProposal(supabase, userId)) return { ok: false, reason: "already_pending" };

    // Asked recently? Evidence accumulates slowly; looking nightly wastes a call.
    try {
      const last = await getEvents(supabase, { userId, types: ["strategy.proposed"], limit: 1 });
      const at = Date.parse(last?.[0]?.created_at || 0);
      if (at && Date.now() - at < REPROPOSE_DAYS * 864e5) return { ok: false, reason: "too_soon" };
    } catch {}

    const current = await storedStrategy(supabase, userId);
    if (!current || !strategyReady(current)) return { ok: false, reason: "no_plan" };

    const { facts } = await gatherEvidence(supabase, { userId, host });
    if (facts.length < MIN_FACTS) return { ok: false, reason: "not_enough_evidence", facts: facts.length };

    // Anything genuinely new? A fact the plan already covers is not a correction,
    // and proposing one teaches the owner to ignore these.
    const novel = facts.filter((f) => !covers(current[f.field], f.value));
    if (novel.length < MIN_FACTS) return { ok: false, reason: "plan_already_covers_it" };

    const { callAI } = await import("@/lib/ai-router");
    const res = await callAI({
      system:
        "You revise a marketing plan using ONLY evidence of what already happened. " +
        "You never invent a customer, a claim, a number or a channel. " +
        "You only return fields the evidence directly supports, and you leave everything else out. " +
        "If the evidence does not justify a change, return an empty patch. Return ONLY JSON.",
      json: true, maxTokens: 700, temperature: 0.3, timeoutMs: 40000,
      userId, host, tag: "strategy-revision",
      prompt: revisionPrompt(current, novel, ai),
    });

    const patch = readPatch(res?.json, current);
    if (!patch || !Object.keys(patch).length) return { ok: false, reason: "no_change_proposed" };

    await recordEvent(supabase, {
      userId, host, type: "strategy.proposed", actor: "genie",
      subject: Object.keys(patch).join(", "),
      data: { patch, facts: novel.map((f) => f.fact).slice(0, 8) },
      // One proposal per week per business, even if the job runs twice.
      dedupeKey: `sprop:${userId}:${host}:${new Date().toISOString().slice(0, 10)}`,
    });
    return { ok: true, fields: Object.keys(patch), facts: novel.length };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// ── the pieces ──────────────────────────────────────────────────────────────

/** Is this value already in the plan's list for that field? */
function covers(currentValue, value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return true;
  const list = Array.isArray(currentValue) ? currentValue : [currentValue];
  return list.some((x) => {
    const s = String(x || "").toLowerCase();
    return s.includes(v) || v.includes(s);
  });
}

export function revisionPrompt(current, facts, ai = null) {
  const byField = {};
  for (const f of facts) (byField[f.field] ||= []).push(f.fact);
  return `THE PLAN AS IT STANDS
Who: ${(current.who || []).join(", ") || "(empty)"}
What they are trying to do: ${(current.theirGoal || []).join(", ") || "(empty)"}
Where they already look: ${(current.whereTheyLook || []).join(", ") || "(empty)"}
What to write about: ${(current.contentThemes || []).join(", ") || "(empty)"}
Who is NOT the customer: ${(current.notTheCustomer || []).join(", ") || "(empty)"}
${ai?.businessName ? `Business: ${ai.businessName}` : ""}

WHAT ACTUALLY HAPPENED SINCE
${Object.entries(byField).map(([field, list]) => `${field}:\n${list.map((l) => `  - ${l}`).join("\n")}`).join("\n")}

These are measured facts, not opinions: real Google clicks, recorded sales, and
replies that arrived. The plan above was written before them.

Propose the SMALLEST change that makes the plan match what is really happening.
ADD what the evidence shows and is missing. Do not remove anything the owner may
have put there deliberately. Do not restate what the plan already says. Do not
add anything the evidence above does not support.

Return ONLY this JSON, including a field only if you are changing it:
{
  "who": ["the full new list, existing entries kept"],
  "whereTheyLook": ["the full new list, existing entries kept"],
  "contentThemes": ["the full new list, existing entries kept"],
  "reason": "one plain sentence to the owner saying what changed and why, naming the evidence"
}`;
}

/** Keep only list fields that really grew, and never let a revision shrink the plan. */
export function readPatch(json, current) {
  if (!json || typeof json !== "object") return null;
  const out = {};
  for (const field of ["who", "whereTheyLook", "contentThemes"]) {
    const next = Array.isArray(json[field]) ? json[field].map((x) => String(x || "").trim()).filter(Boolean) : null;
    if (!next?.length) continue;
    const before = (current[field] || []).map((x) => String(x || ""));
    // Everything the owner had must survive. A model that "tidied" the plan by
    // dropping half of it would quietly undo their corrections.
    const merged = [...before];
    for (const n of next) if (!merged.some((b) => b.toLowerCase() === n.toLowerCase())) merged.push(n);
    if (merged.length > before.length) out[field] = merged;
  }
  if (!Object.keys(out).length) return null;
  const reason = String(json.reason || "").trim();
  if (reason) out.reason = reason.slice(0, 300);
  // Prove it still forms a usable plan before it is ever offered.
  const test = normalizeStrategy({ ...current, ...out });
  return strategyReady(test) ? out : null;
}
