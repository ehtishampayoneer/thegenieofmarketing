// app/api/featured/discover/route.js
// POST { play, niche } -> real sites that could feature you for that play, each with
// a verified contact and a tailored outreach draft. Read-only discovery; the UI shows
// them for review, then Send goes through the SAME outreach engine as Find clients.

import { resolveRadarUser } from "@/lib/radar-auth";
import { hostOf } from "@/lib/business";
import { discoverMedia, PLAYS } from "@/lib/earned-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const play = PLAYS[body?.play] ? body.play : "backlinks";
  const niche = String(body?.niche || "").trim().slice(0, 120);
  if (!niche) return json({ ok: false, error: "Tell me your niche or topic (e.g. 'AR shopping tech' or 'rugs')." }, 400);

  // Who's reaching out — used to tailor each pitch.
  let business = { name: "", pitch: "", whatTheySell: "", website: "" };
  try {
    const { data: prof } = await supabase.from("profiles").select("company_name, company_pitch, company_website").eq("id", userId).maybeSingle();
    if (prof) business = { name: prof.company_name || "", pitch: prof.company_pitch || "", whatTheySell: "", website: prof.company_website || "" };
  } catch {}
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { const ai = scan.ai || {}; business.name = business.name || ai.businessName || ""; business.whatTheySell = ai.whatTheySell || ai.keyProducts || ""; business.pitch = business.pitch || ai.whyChooseYou || ai.whatTheySell || ""; business.website = business.website || (hostOf(scan) ? `https://${hostOf(scan)}` : ""); }
  } catch {}

  const { opportunities, debug } = await discoverMedia({ play, niche, business, limit: 8 });

  return json({ ok: true, play, niche, opportunities, count: opportunities.length, debug });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
