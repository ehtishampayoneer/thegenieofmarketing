// app/api/prospects/discover/route.js
// POST { niche } -> find real companies in that niche, profile each from its own
// site, and return prospects with the decision-maker, best deliverable contact, and
// a pitch tailored to each. Read-only discovery (nothing is sent here); the UI shows
// them for review, then Send goes through the existing outreach engine.

import { resolveRadarUser } from "@/lib/radar-auth";
import { hostOf } from "@/lib/business";
import { discoverProspects } from "@/lib/prospects";
import { callAI } from "@/lib/ai-router";

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
  const { prospects, debug } = await discoverProspects({ niche, userBusiness, limit: 8, ctx });

  // If we got nothing, run ONE tiny AI probe so the real reason is visible instead of
  // guessed: is the model reachable (and just returning an odd shape), or is it
  // failing/quota-limited? Surfaces in the UI so the cause is unambiguous.
  let diag = null;
  if (!prospects.length) {
    try {
      const r = await callAI({ json: true, maxTokens: 150, temperature: 0.2, system: "Return JSON only.", prompt: 'List 3 real home decor brands. Return {"companies":[{"name":"x","domain":"x.com"}]}' });
      const j = r?.json;
      const n = Array.isArray(j?.companies) ? j.companies.length : Array.isArray(j) ? j.length : 0;
      diag = { ai: "ok", provider: r?.provider || "?", got: n, keys: Object.keys(j || {}).slice(0, 5) };
    } catch (e) {
      diag = { ai: "failed", error: String(e?.message || e).slice(0, 160) };
    }
  }

  return json({ ok: true, niche, prospects, count: prospects.length, debug: { ...(debug || {}), diag } });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
