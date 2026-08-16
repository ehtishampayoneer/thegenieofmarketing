// app/api/prospects/discover/route.js
// POST { niche } -> find real companies in that niche, profile each from its own
// site, and return prospects with the decision-maker, best deliverable contact, and
// a pitch tailored to each. Read-only discovery (nothing is sent here); the UI shows
// them for review, then Send goes through the existing outreach engine.

import { resolveRadarUser } from "@/lib/radar-auth";
import { hostOf } from "@/lib/business";
import { discoverProspects } from "@/lib/prospects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const niche = String(body?.niche || "").trim().slice(0, 120);
  if (!niche) return json({ ok: false, error: "Tell me who to target (e.g. 'rug e-commerce brands')." }, 400);

  // Who's sending — used to tailor each pitch.
  let userBusiness = { name: "", pitch: "", whatTheySell: "" };
  try {
    const { data: prof } = await supabase.from("profiles").select("company_name, company_pitch").eq("id", userId).maybeSingle();
    if (prof) userBusiness = { name: prof.company_name || "", pitch: prof.company_pitch || "", whatTheySell: "" };
  } catch {}
  let host = null;
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { host = hostOf(scan); const ai = scan.ai || {}; userBusiness.name = userBusiness.name || ai.businessName || ""; userBusiness.whatTheySell = ai.whatTheySell || ai.keyProducts || ""; userBusiness.pitch = userBusiness.pitch || ai.whyChooseYou || ai.whatTheySell || ""; }
  } catch {}

  const ctx = { supabase, userId, host, tag: "prospects" };
  const prospects = await discoverProspects({ niche, userBusiness, limit: 8, ctx });

  return json({ ok: true, niche, prospects, count: prospects.length });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
