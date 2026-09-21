// lib/launch-queue.js
// ── LISTINGS, AS DAILY APPROVALS ──
// The launch list (lib/launch-places.js) is Genie's own knowledge, not a screen
// the owner has to manage. Each night Genie puts the next best places for this
// business into Approvals as ordinary items: the listing text is the draft, the
// place's sign-up page is where "Copy & open" goes, and approving it records that
// the owner submitted it, so it is never offered again.
//
// Paced on purpose. At most OPEN_MAX listings wait in Approvals at once, and at
// most PER_NIGHT are added a night: if the owner is busy the queue does not pile
// up, and the big launch days are not burned in one afternoon. Best places first.

import { businessFits, placesFor, copyFor, kitPrompt, normalizeKit } from "@/lib/launch-places";

// The existing directory item type (see app/api/growth, lib/outcomes), so Today,
// the brief and the outcome cards already know how to show these. The older AI
// plan suggests directories by name only; those names are respected below so the
// same place is never offered twice.
export const LISTING_TYPE = "directory_submission";
const OPEN_MAX = 3;
const PER_NIGHT = 2;
const PRIORITY = { 1: "high", 2: "medium", 3: "low" };
const IMPACT = { 1: 82, 2: 64, 3: 45 };

/** Pick what to add tonight. Pure, so the pacing rules are testable. */
export function pickListings({ fits, done = new Set(), open = 0, perNight = PER_NIGHT, openMax = OPEN_MAX }) {
  const room = Math.max(0, Math.min(perNight, openMax - open));
  if (!room) return [];
  return placesFor(fits).filter((p) => !done.has(p.id)).slice(0, room);
}

/**
 * Add tonight's listings to Approvals for one business. Never throws; returns
 * how many were added. The launch kit is written once (one AI call) the first
 * night and reused after that.
 */
export async function queueListings(admin, { userId, host, ai }) {
  try {
    if (!host) return 0;

    // Everything already offered for this site, whatever became of it: approved,
    // skipped or still waiting. A place is offered once.
    const { data: rows } = await admin.from("actions").select("status, payload, target")
      .eq("user_id", userId).eq("type", LISTING_TYPE).limit(500);
    const mine = (rows || []).filter((r) => !r.target?.host || r.target.host === host);
    const named = new Set(mine.map((r) => norm(r.payload?.name || r.payload?.place)).filter(Boolean));
    const done = new Set(mine.map((r) => r.payload?.placeId).filter(Boolean));
    for (const p of placesFor(businessFits(ai || {}), { all: true })) if (named.has(norm(p.name))) done.add(p.id);
    // Pacing counts only these checked listings: an old name-only suggestion left
    // waiting must not stop new ones from ever arriving.
    const open = mine.filter((r) => r.status === "proposed" && r.payload?.placeId).length;

    const picks = pickListings({ fits: businessFits(ai || {}), done, open });
    if (!picks.length) return 0;

    const kit = await launchKit(admin, { userId, host, ai });
    if (!kit) return 0;
    const name = ai?.businessName || host;

    const insert = picks.map((p) => ({
      user_id: userId, type: LISTING_TYPE,
      title: `List ${name} on ${p.name}`,
      priority: PRIORITY[p.tier] || "low", status: "proposed",
      target: { host, platform: "listing" },
      payload: {
        platform: "listing", placeId: p.id, place: p.name, name: p.name, kind: p.kind,
        url: p.url, body: copyFor(p, kit, host), impact: IMPACT[p.tier] || 45,
        rationale: [p.why, p.rule ? `Rule: ${p.rule}` : "", "Copy & open copies your text and opens the page. Sign in, paste, submit."].filter(Boolean).join(" "),
      },
    }));
    const { error } = await admin.from("actions").insert(insert);
    return error ? 0 : insert.length;
  } catch { return 0; }
}

function norm(s) { return String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, ""); }

async function launchKit(admin, { userId, host, ai }) {
  try {
    const { data } = await admin.from("events").select("data").eq("user_id", userId).eq("host", host).eq("type", "launch.kit")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.data?.kit?.tagline) return data.data.kit;
  } catch {}
  try {
    const { callAI } = await import("@/lib/ai-router");
    // THE PLAN. The listing kit is the business's description on other people's
    // sites, so it has to say the same thing the articles and pitches do. It used
    // to be written from the raw brief JSON and re-decided the positioning itself.
    const { genieBrain } = await import("@/lib/brain");
    const { block: plan } = await genieBrain(admin, { userId, host, ai });
    const r = await callAI({
      system: "You write listing copy for launch sites and directories. Specific, plain and honest; never invent facts. Return ONLY valid JSON.",
      prompt: kitPrompt(ai || {}, host, plan), json: true, maxTokens: 3500, temperature: 0.5, timeoutMs: 60000,
      ctx: { supabase: admin, userId, host, tag: "launch-kit" },
    });
    const kit = normalizeKit(r.json || {});
    if (!kit.tagline || !kit.short) return null;
    const { recordEvent } = await import("@/lib/events");
    await recordEvent(admin, { userId, host, type: "launch.kit", actor: "genie", subject: kit.tagline, data: { kit } });
    return kit;
  } catch { return null; }
}
