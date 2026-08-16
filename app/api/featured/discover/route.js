// app/api/featured/discover/route.js
// POST { play, niche } -> find NEW earned-media sites for that play, deduped against
// what this user already has (never re-surfaces a site you already found, and skips
// sites you APPLIED to within the last 60 days), persist them, and return the full
// current list for that play. Persistence means results stay put across navigation
// and re-scans only add genuinely new sites.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostOf } from "@/lib/business";
import { discoverMedia, diagnoseMedia, buildFromSites, PLAYS } from "@/lib/earned-media";
import { actionToOpp, MEDIA_TYPE, REAPPLY_DAYS } from "@/lib/media-store";

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
  if (!niche) return json({ ok: false, error: "Tell me your niche or topic (e.g. 'rugs' or 'AR shopping tech')." }, 400);

  // Business + host (to tailor pitches and stamp the row).
  let business = { name: "", pitch: "", whatTheySell: "", website: "" };
  let host = null;
  try {
    const { data: prof } = await supabase.from("profiles").select("company_name, company_pitch, company_website").eq("id", userId).maybeSingle();
    if (prof) business = { name: prof.company_name || "", pitch: prof.company_pitch || "", whatTheySell: "", website: prof.company_website || "" };
  } catch {}
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { host = hostOf(scan); const ai = scan.ai || {}; business.name = business.name || ai.businessName || ""; business.whatTheySell = ai.whatTheySell || ai.keyProducts || ""; business.pitch = business.pitch || ai.whyChooseYou || ai.whatTheySell || ""; business.website = business.website || (host ? `https://${host}` : ""); }
  } catch {}

  const admin = createAdminClient();

  // What this user already has for THIS play — to dedupe.
  const { data: existing } = await admin.from("actions")
    .select("id, payload, created_at").eq("user_id", userId).eq("type", MEDIA_TYPE).limit(400);
  const mine = (existing || []).filter((a) => a.payload?.play === play);
  const cutoff = Date.now() - REAPPLY_DAYS * 86400 * 1000;
  const blocked = new Set(); // domains we should NOT re-surface
  for (const a of mine) {
    const p = a.payload || {};
    if (!p.domain) continue;
    // Un-applied ones always stay (dedupe). Applied ones are blocked until 60 days pass.
    if (!p.applied) blocked.add(p.domain);
    else if (new Date(p.appliedAt || a.created_at).getTime() > cutoff) blocked.add(p.domain);
  }

  // Discover with two sources. If still empty, recover once (re-run + diagnose), then
  // build from whatever it found. Wrapped so any unexpected error surfaces the
  // diagnostic instead of a blank 500.
  let debug = {};
  try {
    let out = await discoverMedia({ play, niche, business, limit: 8 });
    let opportunities = out.opportunities; debug = out.debug || {};
    let diag = null;
    if (!opportunities.length) {
      diag = await diagnoseMedia(play, niche);
      if (diag.sites?.length) { opportunities = await buildFromSites(diag.sites, play, business, 8); }
    }
    debug = { ...debug, diag };

    const fresh = opportunities.filter((o) => o.domain && !blocked.has(o.domain));

    // Persist the new ones (service role, like the content engine — never blocked by RLS).
    let inserted = [];
    if (fresh.length) {
      // NOTE: the actions table has NO top-level `host` column — host lives inside
      // `target` (same as every other actions insert). Adding it here was rejecting
      // the whole batch silently, so nothing saved and the page showed 0.
      const rows = fresh.map((o) => ({
        user_id: userId, type: MEDIA_TYPE,
        title: `${PLAYS[play]?.label || "Featured"}: ${o.company}`.slice(0, 200),
        target: { play, host: host || null, domain: o.domain },
        priority: "strategic", status: "proposed",
        payload: { play, niche, domain: o.domain, company: o.company, url: o.url, summary: o.summary, whyFit: o.whyFit, contact: o.contact, subject: o.pitch.subject, body: o.pitch.body, applied: false, appliedAt: null },
      }));
      const { data: ins, error: insErr } = await admin.from("actions").insert(rows).select("id, payload, created_at");
      if (insErr) debug = { ...debug, insertErr: insErr.message };
      inserted = ins || [];
    }

    const all = [...inserted, ...mine].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return json({ ok: true, play, niche, opportunities: all.map(actionToOpp), newCount: fresh.length, debug });
  } catch (e) {
    // Never blank-500: return what we already had + the error so the UI shows it.
    return json({ ok: true, play, niche, opportunities: mine.map(actionToOpp), newCount: 0, debug: { ...debug, err: String(e?.message || e).slice(0, 160) } });
  }
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
