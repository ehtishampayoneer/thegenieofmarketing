// ── MARKET EXPANSION ── the full loop.
// GET  → the ranked scoreboard (real GSC where available, else estimated) + the user's
//        live experiments with real progress (draft status + per-country GSC traction).
// POST → "target this market": persists a market experiment (actions/type=market_experiment,
//        status=active so it doesn't clutter Approvals) AND drafts one real, locally-relevant
//        landing page via the same AI + content pipeline the rest of the app uses — it lands
//        in Approvals as a normal proposed article. POST {action:"stop"} ends an experiment.
// Honest: never edits the user's site; the draft goes through the normal approve→publish flow.

import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { resolveEntity } from "@/lib/growth-memory";
import { ENTITY_TYPES } from "@/lib/entity";
import { getGscCountries } from "@/lib/gsc";
import { getValidAccessToken } from "@/lib/google";
import { scoreMarkets, COUNTRIES, flagEmoji } from "@/lib/markets";
import { callAI, AllProvidersFailedError } from "@/lib/ai-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // drafting the localized page calls the AI — give it room

const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "landing";
const jres = (o, status = 200) => Response.json(o, { status });

async function loadContext(supabase, userId, host) {
  let ai = {};
  if (!host) {
    const { data: scans } = await supabase.from("scans").select("ai, final_url, url, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5);
    if (scans?.length) { host = hostOf(scans[0]); ai = scans[0].ai || {}; }
  }
  let dims = null, name = ai.businessName || host || "Your business";
  try { if (host) { const e = await resolveEntity(supabase, userId, host, ai); dims = ENTITY_TYPES[e?.type]?.dims || null; name = e?.name || name; } } catch {}
  const keyword = (Array.isArray(ai.keywordsToOwn) && ai.keywordsToOwn[0]) || ai.whatTheySell || "";
  return { host, ai, dims, name, keyword };
}

async function getGsc(supabase, userId, host) {
  try {
    const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
    if (conn && host) { const token = await getValidAccessToken(supabase, conn); if (token) { const gc = await getGscCountries(token, host); if (gc?.available) return gc; } }
  } catch {}
  return null;
}

function defaultProfile(dims) {
  const audience = dims?.audience || "global";
  return { languages: ["en"], delivery: audience === "local" ? "local" : "anywhere", regions: [], payment: "global", paymentCountries: [], excluded: [] };
}
async function loadProfile(supabase, userId, dims) {
  try {
    const { data } = await supabase.from("actions").select("payload").eq("user_id", userId).eq("type", "market_profile").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.payload) return { ...defaultProfile(dims), ...data.payload };
  } catch {}
  return defaultProfile(dims);
}
function sanitizeProfile(p) {
  return {
    languages: Array.isArray(p?.languages) && p.languages.length ? p.languages.map((s) => String(s).toLowerCase()).slice(0, 8) : ["en"],
    delivery: ["anywhere", "regions", "local"].includes(p?.delivery) ? p.delivery : "anywhere",
    regions: Array.isArray(p?.regions) ? p.regions.slice(0, 12) : [],
    payment: p?.payment === "limited" ? "limited" : "global",
    paymentCountries: Array.isArray(p?.paymentCountries) ? p.paymentCountries.map((s) => String(s).toLowerCase()).slice(0, 80) : [],
    excluded: Array.isArray(p?.excluded) ? p.excluded.map((s) => String(s).toLowerCase()).slice(0, 80) : [],
  };
}

async function loadExperiments(supabase, userId, gsc) {
  const { data } = await supabase.from("actions").select("id, payload, created_at").eq("user_id", userId).eq("type", "market_experiment").eq("status", "active").order("created_at", { ascending: false }).limit(24);
  const gscMap = {}; if (gsc?.countries) for (const c of gsc.countries) gscMap[c.code] = c;
  const out = [];
  for (const a of data || []) {
    const p = a.payload || {};
    let draftStatus = p.draftStatus || "pending";
    if (p.articleActionId) {
      try { const { data: art } = await supabase.from("actions").select("status").eq("id", p.articleActionId).maybeSingle(); if (art) draftStatus = art.status === "proposed" ? "drafted" : (art.status === "done" || art.status === "published" ? "published" : art.status); } catch {}
    }
    const g = gscMap[p.code] || null;
    let prog = 20;
    if (draftStatus !== "pending") prog += 25;
    if (draftStatus === "published") prog += 25;
    if (g && g.impressions > 0) prog += 15;
    if (g && g.clicks > 0) prog += 15;
    out.push({ id: a.id, code: p.code, name: p.name, flag: p.flag, lang: p.lang, difficulty: p.difficulty, days: p.days, goal: p.goal, plan: p.plan || [], startedAt: p.startedAt || a.created_at, draftStatus, articleActionId: p.articleActionId || null, progress: Math.min(100, prog), searchTraction: g ? { impressions: g.impressions, clicks: g.clicks, position: g.position } : null });
  }
  return out;
}

export async function GET(req) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jres({ ok: false, reason: "not_authenticated" }, 401);
  const { searchParams } = new URL(req.url);
  const ctx = await loadContext(supabase, user.id, searchParams.get("host") || null);
  const profile = await loadProfile(supabase, user.id, ctx.dims);
  const gsc = await getGsc(supabase, user.id, ctx.host);
  const result = scoreMarkets({ entity: ctx.dims ? { dims: ctx.dims } : {}, profile, gsc });
  const experiments = await loadExperiments(supabase, user.id, gsc);
  return jres({ ok: true, host: ctx.host || null, audience: ctx.dims?.audience || "unknown", hasGsc: result.hasGsc, localOnly: result.localOnly, profile, rows: result.rows, experiments, generatedAt: new Date().toISOString() });
}

function marketPrompt({ name, country, keyword, host, language = "en" }) {
  const kw = keyword || `${name}`;
  const langLine = language === "en"
    ? `Write in clear, natural English (do NOT machine-translate), but make it locally relevant to ${country}.`
    : `Write natively and fluently in ${language.toUpperCase()} (the local language of ${country}) — natural, not machine-translated — for a local reader.`;
  return `Write ONE genuinely useful landing/answer page for "${name}"${host ? ` (${host})` : ""}, aimed at buyers in ${country} searching for "${kw}".
${langLine} Reference the local context, mention that ${name} serves customers in ${country}, and use local currency/examples where it reads naturally. Be specific and genuinely helpful — no generic filler, no fluff.
Return ONLY valid JSON (no markdown fences):
{"title":"a compelling H1","metaTitle":"<=60 chars","metaDescription":"<=155 chars, benefit-led","slug":"kebab-case-url","body":"an 800–1100 word article in markdown with ## subheadings, ending with a short FAQ of 2–3 real questions buyers in ${country} would ask, each with a helpful answer"}`;
}

export async function POST(req) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jres({ ok: false, reason: "not_authenticated" }, 401);
  const body = await req.json().catch(() => ({}));

  // stop an experiment
  if (body.action === "stop" && body.id) {
    try {
      const { data: row } = await supabase.from("actions").select("payload").eq("id", body.id).eq("user_id", user.id).maybeSingle();
      await supabase.from("actions").update({ status: "done", payload: { ...(row?.payload || {}), stoppedAt: new Date().toISOString() } }).eq("id", body.id).eq("user_id", user.id);
    } catch {}
    return jres({ ok: true, stopped: true });
  }

  // save the stored eligibility profile
  if (body.action === "profile") {
    const clean = sanitizeProfile(body.profile || {});
    try {
      const { data: ex } = await supabase.from("actions").select("id").eq("user_id", user.id).eq("type", "market_profile").maybeSingle();
      if (ex) await supabase.from("actions").update({ payload: clean, status: "active" }).eq("id", ex.id);
      else await supabase.from("actions").insert({ user_id: user.id, type: "market_profile", status: "active", title: "Market eligibility", payload: clean });
    } catch { return jres({ ok: false, error: "Couldn't save your settings." }, 500); }
    return jres({ ok: true, profile: clean });
  }

  const code = String(body.code || "").toLowerCase();
  const co = COUNTRIES.find((c) => c.code === code);
  if (!co) return jres({ ok: false, error: "Unknown market." }, 400);

  const ctx = await loadContext(supabase, user.id, null);
  if (!ctx.host) return jres({ ok: false, error: "Run your first website scan so Genie knows your business before expanding." }, 400);

  // already targeting?
  try {
    const { data: existing } = await supabase.from("actions").select("id").eq("user_id", user.id).eq("type", "market_experiment").eq("status", "active").contains("payload", { code }).maybeSingle();
    if (existing) return jres({ ok: true, already: true, id: existing.id });
  } catch {}

  // facts for this market under the user's REAL stored eligibility — gate before drafting
  const profile = await loadProfile(supabase, user.id, ctx.dims);
  const sc = scoreMarkets({ entity: ctx.dims ? { dims: ctx.dims } : {}, profile, gsc: null });
  const row = sc.rows.find((r) => r.code === code) || {};
  if (!row.eligible) return jres({ ok: false, error: "That market isn't eligible under your current serve & delivery settings." }, 400);
  if (row.needsLocalLang) return jres({ ok: false, needsLang: true, langName: row.langName, error: `${co.name} needs ${row.langName} content to reach the mainstream — an English-only page would be thin. Add ${row.langName} to your languages in Eligibility, or target an English-suitable market.` }, 400);
  const writeLang = row.supportsLang && co.lang !== "en" ? co.lang : "en";
  const keyword = ctx.keyword || co.name;
  const plan = [`Localized landing page for ${co.name}`, "3–5 useful local content pieces", "Local CTA + payment/delivery clarity", "One conversion goal (leads / sales)"];
  const goal = `First qualified leads from ${co.name} within ~${row.days || 60} days`;
  const expPayload = { code, name: co.name, flag: flagEmoji(co.iso2), lang: co.lang, writeLang, difficulty: row.difficulty || "Medium", days: row.days || 60, expTraffic: row.expTraffic || null, expSalesLow: row.expSalesLow ?? null, expSalesHigh: row.expSalesHigh ?? null, goal, plan, startedAt: new Date().toISOString(), draftStatus: "pending", articleActionId: null };

  // 1) persist the experiment first (so it exists even if the AI hiccups)
  let expId = null;
  try {
    const { data: expRow } = await supabase.from("actions").insert({ user_id: user.id, type: "market_experiment", status: "active", title: `Market: ${co.name}`, priority: "strategic", payload: expPayload, target: { host: ctx.host } }).select("id").maybeSingle();
    expId = expRow?.id || null;
  } catch (e) { return jres({ ok: false, error: "Couldn't start that experiment. Try again." }, 500); }

  // 2) draft ONE real, locally-relevant page → lands in Approvals as a proposed article
  let articleActionId = null, draftStatus = "pending", aiError = null;
  try {
    const result = await callAI({ system: "You are Genie, an expert SEO/AEO content writer. Write genuinely useful, specific content — never generic filler. Return ONLY valid JSON, no markdown fences.", json: true, maxTokens: 3600, temperature: 0.7, prompt: marketPrompt({ name: ctx.name, country: co.name, keyword, host: ctx.host, language: writeLang }) });
    const d = result?.json;
    if (d && d.title && d.body) {
      const artPayload = { title: String(d.title), metaTitle: String(d.metaTitle || d.title).slice(0, 60), metaDescription: String(d.metaDescription || "").slice(0, 200), slug: slugify(d.slug || `${keyword}-${co.code}`), body: String(d.body), targetKeyword: keyword, market: co.code, marketName: co.name, experimentId: expId };
      const { data: art } = await supabase.from("actions").insert({ user_id: user.id, type: "article", title: `${co.name}: ${String(d.title).slice(0, 80)}`, priority: "strategic", status: "proposed", payload: artPayload, target: { platform: "website", host: ctx.host, market: co.code } }).select("id").maybeSingle();
      articleActionId = art?.id || null;
      draftStatus = articleActionId ? "drafted" : "pending";
    }
  } catch (e) { aiError = e instanceof AllProvidersFailedError ? "busy" : "error"; }

  if (expId) { try { await supabase.from("actions").update({ payload: { ...expPayload, articleActionId, draftStatus } }).eq("id", expId); } catch {} }

  try {
    const { logActivity } = await import("@/lib/activity");
    await logActivity(supabase, user.id, { host: ctx.host, verb: "expanding", icon: "🌍", message: `Started a ${co.name} market experiment${articleActionId ? " — drafted a localized page" : ""}`, detail: articleActionId ? "Review the draft in Approvals." : "Genie will draft the localized page shortly.", meta: { market: co.code } });
  } catch {}

  return jres({ ok: true, id: expId, draftStatus, articleActionId, aiError });
}
