// app/api/growth/route.js
// G3 (Link Building) + G4 (Directory & PR Discovery).
// Genie discovers prospect TYPES + likely targets and DRAFTS the outreach.
// Honest framing enforced in code:
//  - prospects are AI-suggested starting points to VERIFY, not verified data
//  - everything is drafted for the human to review and send — never auto-sent
//  - backlinks are EARNED via outreach; Genie drafts what earns them

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_PRIO = new Set(["high", "quick_win", "strategic", "low", "medium"]);

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { ai, host, scanId } = body || {};
  if (!ai) return json({ ok: false, error: "Missing business context." }, 400);

  let data = null;
  try {
    const result = await callAI({
      system:
        "You are Genie's growth engine for earned links and visibility. You suggest outreach prospects and draft the emails/pitches. CRITICAL HONESTY RULES: (1) You cannot verify websites live — every prospect is an informed SUGGESTION the user must verify exists and fits. (2) Nothing is ever auto-sent — you draft, the human reviews and sends. (3) Backlinks are EARNED through genuine value — drafts must offer real value, never spam. Personalize drafts with placeholders like [Name] where the user fills in specifics. Return ONLY valid JSON.",
      json: true,
      maxTokens: 3200,
      temperature: 0.7,
      prompt: buildPrompt(ai, host),
    });
    data = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      return json({ ok: false, retryable: true, message: "Genie is busy — try again in a moment." }, 503);
    }
    return json({ ok: false, error: "Couldn't generate the growth plan." }, 500);
  }

  if (!data) return json({ ok: false, error: "Couldn't generate the growth plan." }, 500);

  // Normalize + enforce framing in code.
  const linkBuilding = (Array.isArray(data.linkBuilding) ? data.linkBuilding : []).map((p) => ({
    kind: p.kind || "guest_post",
    prospectType: p.prospectType || "",
    exampleTargets: Array.isArray(p.exampleTargets) ? p.exampleTargets.slice(0, 4) : [],
    angle: p.angle || "",
    draft: p.draft || "",
    priority: VALID_PRIO.has(p.priority) ? p.priority : "strategic",
    verifyNote: "AI-suggested — verify the target exists and fits before sending.",
  }));

  const directoriesPR = (Array.isArray(data.directoriesPR) ? data.directoriesPR : []).map((d) => ({
    kind: d.kind || "directory",
    name: d.name || "",
    why: d.why || "",
    draft: d.draft || "",
    priority: VALID_PRIO.has(d.priority) ? d.priority : "strategic",
    verifyNote: "AI-suggested — confirm the listing/opportunity before submitting.",
  }));

  // Persist as spine actions.
  let actionIds = [];
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const rows = [
        ...linkBuilding.map((p) => ({
          user_id: user.id,
          scan_id: scanId || null,
          type: "outreach_email",
          title: `Outreach: ${p.prospectType || p.kind}`,
          payload: p,
          target: { host: host || null, humanPost: true },
          priority: p.priority,
          status: "proposed",
        })),
        ...directoriesPR.map((d) => ({
          user_id: user.id,
          scan_id: scanId || null,
          type: "directory_submission",
          title: `${d.kind === "podcast" ? "Podcast pitch" : d.kind === "pr" ? "PR" : "Directory"}: ${d.name}`,
          payload: d,
          target: { host: host || null, humanPost: true },
          priority: d.priority,
          status: "proposed",
        })),
      ];
      if (rows.length) {
        const { data: inserted } = await supabase.from("actions").insert(rows).select("id");
        actionIds = (inserted || []).map((r) => r.id);
      }
    }
  } catch {}

  return json({ ok: true, linkBuilding, directoriesPR, actionIds });
}

function buildPrompt(ai, host) {
  return `Business: ${ai.businessName || host || "(unknown)"} — ${ai.industry || ""} ${ai.subCategory ? "/ " + ai.subCategory : ""}
Type: ${ai.businessType || "(infer)"}
Sells: ${ai.whatTheySell || ""}
Target customer: ${ai.targetCustomer || ""}
Website: ${host || "(unknown)"}

Produce a link-building + visibility plan. Return ONLY this JSON:
{
  "linkBuilding": [
    {
      "kind": "guest_post",
      "prospectType": "the TYPE of blog/site to target, e.g. 'AR/VR industry blogs'",
      "exampleTargets": ["2-4 example sites likely to exist — the user will verify"],
      "angle": "the pitch angle (1 sentence)",
      "draft": "a complete, personalized-with-placeholders outreach email (subject line + body). Genuine value first.",
      "priority": "high | quick_win | strategic | low"
    },
    {
      "kind": "resource_page",
      "prospectType": "resource/roundup pages that list tools like this",
      "exampleTargets": ["..."],
      "angle": "...",
      "draft": "pitch email for inclusion",
      "priority": "..."
    },
    {
      "kind": "broken_link",
      "prospectType": "where broken-link opportunities likely exist in this niche",
      "exampleTargets": ["..."],
      "angle": "offer their article as a replacement — user must find actual broken links",
      "draft": "template email with [broken URL] placeholders",
      "priority": "..."
    }
  ],
  "directoriesPR": [
    { "kind": "directory", "name": "an actual relevant industry directory", "why": "1 sentence", "draft": "the listing description to submit", "priority": "quick_win" },
    { "kind": "directory", "name": "...", "why": "...", "draft": "...", "priority": "..." },
    { "kind": "launch", "name": "Product Hunt", "why": "include ONLY if this is a SaaS/product", "draft": "tagline + first-comment draft", "priority": "..." },
    { "kind": "pr", "name": "HARO / journalist queries", "why": "1 sentence", "draft": "a source-pitch template for their expertise area", "priority": "..." },
    { "kind": "podcast", "name": "the TYPE of podcasts to pitch", "why": "...", "draft": "a guest-pitch email with their story angle", "priority": "..." }
  ]
}
2-3 linkBuilding items, 3-5 directoriesPR items. Only what genuinely fits this business. Drafts must offer real value, never spam.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
