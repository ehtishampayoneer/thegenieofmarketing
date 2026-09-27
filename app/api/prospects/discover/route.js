// app/api/prospects/discover/route.js
// POST { niche } -> find real companies in that niche, profile each from its own
// site, and return prospects with the decision-maker, best deliverable contact, and
// a pitch tailored to each. Read-only discovery (nothing is sent here); the UI shows
// them for review, then Send goes through the existing outreach engine.

import { resolveRadarUser } from "@/lib/radar-auth";
import { hostOf } from "@/lib/business";
import { briefBlock } from "@/lib/business-brief";
import { strategyPromptBlock, getStrategy } from "@/lib/strategy-store";
import { requiredPlatform, rivalCategory } from "@/lib/platform-detect";
import { discoverProspects, diagnoseCandidates, buildProspectsFromCompanies, fitFrom } from "@/lib/prospects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const niche = String(body?.niche || "").trim().slice(0, 120);
  if (!niche) return json({ ok: false, error: "Tell me who to target — a kind of company, not one firm. For example 'independent bookshops' or 'dental practices'." }, 400);

  // Who's sending — used to tailor each pitch.
  let userBusiness = { name: "", pitch: "", whatTheySell: "" };
  try {
    const { data: prof } = await supabase.from("profiles").select("company_name, company_pitch").eq("id", userId).maybeSingle();
    if (prof) userBusiness = { name: prof.company_name || "", pitch: prof.company_pitch || "", whatTheySell: "" };
  } catch {}
  let scanAi = {};
  let host = null;
  let fit = null;
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { host = hostOf(scan); const ai = scan.ai || {}; scanAi = ai; userBusiness.name = userBusiness.name || ai.businessName || ""; userBusiness.whatTheySell = ai.whatTheySell || ai.keyProducts || ""; userBusiness.pitch = userBusiness.pitch || ai.whyChooseYou || ai.whatTheySell || ""; userBusiness.brief = briefBlock(ai) + (await strategyPromptBlock(supabase, { userId, host, ai }).catch(() => "")); fit = fitFrom(ai); }
  } catch {}

  const ctx = { supabase, userId, host, tag: "prospects" };
  // Does the offer only work on one platform? Read from what the owner sells and
  // the plan, never assumed — most businesses have no such requirement, and
  // inventing one would silently empty their list. When there IS one, a shop on a
  // different platform is dropped before anything is written to them.
  let needsPlatform = null;
  // And which category of rival matters to THIS owner, read from the same plan.
  // Somebody selling booking software cares whether a prospect already has
  // Calendly; somebody selling 3D product views cares about something else
  // entirely. Most businesses match nothing here, and then nothing is detected
  // and nothing is filtered.
  let rivalCat = null;
  try {
    const strategy = await getStrategy(supabase, { userId, host, ai: scanAi, draft: false });
    needsPlatform = requiredPlatform({ ai: scanAi, strategy });
    rivalCat = rivalCategory({ ai: scanAi, strategy });
  } catch {}

  // -- NOBODY THE OWNER HAS ALREADY WRITTEN TO --
  // Every search used to start from nothing, so a company emailed on Monday came
  // back on Wednesday as a new find, with a new cold pitch that ignored the one
  // already in their inbox. They are left out now, before their site is fetched,
  // and their next email comes from the follow-up schedule instead.
  let exclude = null;
  try {
    const { contactedSet } = await import("@/lib/contacted");
    exclude = await contactedSet(supabase, userId);
  } catch {}

  let { prospects, stats, debug } = await discoverProspects({ niche, userBusiness, limit: 8, ctx, fit, needsPlatform, rivalCat, exclude });
  stats = stats || { alreadyContacted: 0, noSuchDomain: 0, wouldNotLoad: 0 };

  // RECOVERY: if the main path came up empty (a transient provider hiccup), run the
  // candidate call once more — it reliably names companies at this calmer moment —
  // and build prospects straight from them. This is why the diagnostic always saw
  // companies while discovery showed 0; now we actually use them.
  let diag = null;
  if (!prospects.length) {
    diag = await diagnoseCandidates(niche);
    if (diag.companies?.length) {
      // The fallback obeys the same two rules as the main path: nobody already
      // contacted, and nobody whose site will not load.
      const { alreadyContacted } = await import("@/lib/contacted");
      const fresh = exclude ? diag.companies.filter((c) => !alreadyContacted(exclude, { domain: c.domain })) : diag.companies;
      stats.alreadyContacted += diag.companies.length - fresh.length;
      prospects = await buildProspectsFromCompanies(fresh, userBusiness, 8, { exclude, stats });
      debug = { ...(debug || {}), recovered: prospects.length };
    }
  }

  // What was left out, and why, so a short list explains itself instead of
  // looking like Genie did not try.
  const left = [];
  if (stats.alreadyContacted) left.push(`${stats.alreadyContacted} you have already contacted (their follow-ups come through Approvals)`);
  const dead = (stats.noSuchDomain || 0) + (stats.wouldNotLoad || 0);
  if (dead) left.push(`${dead} whose website no longer exists or would not load`);
  const leftOut = left.length ? `Left out: ${left.join("; ")}.` : "";

  return json({ ok: true, niche, prospects, count: prospects.length, stats, leftOut, debug: { ...(debug || {}), diag } });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
