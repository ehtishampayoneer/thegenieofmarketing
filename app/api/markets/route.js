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
    englishConfirmed: !!p?.englishConfirmed,
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
      try { const { data: art } = await supabase.from("actions").select("status").eq("id", p.articleActionId).eq("user_id", userId).maybeSingle(); if (art) draftStatus = art.status === "proposed" ? "drafted" : (art.status === "done" || art.status === "published" ? "published" : art.status); } catch {}
    }
    const g = gscMap[p.code] || null;
    let prog = 20;
    if (draftStatus !== "pending") prog += 25;
    if (draftStatus === "published") prog += 25;
    if (g && g.impressions > 0) prog += 15;
    if (g && g.clicks > 0) prog += 15;
    out.push({ id: a.id, code: p.code, name: p.name, flag: p.flag, lang: p.lang, difficulty: p.difficulty, days: p.days, goal: p.goal, plan: p.plan || [], taskCount: p.taskCount || 0, startedAt: p.startedAt || a.created_at, draftStatus, articleActionId: p.articleActionId || null, progress: Math.min(100, prog), searchTraction: g ? { impressions: g.impressions, clicks: g.clicks, position: g.position } : null });
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

// The full country KIT prompt — one AI call returns every piece of the market test,
// each of which becomes its own country-tagged task in Approvals.
function marketPlanPrompt({ name, country, keyword, host, language = "en" }) {
  const kw = keyword || name;
  const langLine = language === "en"
    ? `Write everything in clear, natural English (do NOT machine-translate), locally relevant to ${country}.`
    : `Write everything natively and fluently in ${language.toUpperCase()} (the local language of ${country}) — natural, not machine-translated, for a local reader.`;
  return `You are building a focused market-test kit for "${name}"${host ? ` (${host})` : ""} to win buyers in ${country} who search for "${kw}". ${langLine} Be specific and genuinely useful — no generic filler, no fluff. Reference real ${country} context and mention that ${name} serves customers there.
Return ONLY valid JSON (no markdown fences) with EXACTLY these keys:
{"landing":{"title":"compelling H1","metaTitle":"<=60 chars","metaDescription":"<=155 chars, benefit-led","slug":"kebab-case","body":"650–950 word markdown article with ## subheadings, ending with a 2–3 question FAQ that real buyers in ${country} would ask, each answered"},"social":{"platform":"linkedin","text":"a ready-to-post caption, max ~90 words, introducing ${name} to ${country}, with 2–3 relevant local hashtags"},"email":{"subject":"<=60 chars","body":"a 140–190 word outreach email to a local partner, blogger, or community in ${country}","audience":"one line: who to send this to"},"localSeo":{"title":"Local visibility setup","snippet":"copy-paste HTML: an hreflang tag and a geo/region meta targeting ${country}","note":"1–2 lines on where to paste it on their own site"},"distribution":[{"title":"short task name","where":"a real, specific ${country} directory, marketplace, or community","why":"one line on why it helps"}]}
Give EXACTLY 3 items in distribution.`;
}

// Turn a parsed plan into concrete country-tagged action rows (pure — unit-testable).
// Every task carries market/marketName/marketFlag so Approvals can group them on one tab.
function buildMarketTasks({ plan, name, host, co, keyword, expId, writeLang }) {
  if (!plan || typeof plan !== "object") return [];
  const tasks = [];
  const base = { market: co.code, marketName: co.name, marketFlag: flagEmoji(co.iso2), experimentId: expId, writeLang };
  const L = plan.landing;
  if (L && L.title && L.body) {
    tasks.push({
      type: "article", priority: "high",
      title: `${co.name}: ${String(L.title).slice(0, 80)}`,
      payload: { ...base, title: String(L.title), metaTitle: String(L.metaTitle || L.title).slice(0, 60), metaDescription: String(L.metaDescription || "").slice(0, 200), slug: slugify(L.slug || `${keyword}-${co.code}`), body: String(L.body), targetKeyword: keyword, rationale: `The anchor page for your ${co.name} market test — a locally-relevant answer page aimed at buyers there. Publishes to your own blog through the normal approve → publish flow.` },
      target: { platform: "website", host, market: co.code },
    });
  }
  const S = plan.social;
  if (S && S.text) {
    const platform = String(S.platform || "linkedin").toLowerCase();
    tasks.push({
      type: "social_post", priority: "strategic",
      title: `${co.name}: intro post`,
      payload: { ...base, platform, text: String(S.text), targetKeyword: keyword, rationale: `A ready-to-post caption introducing you to ${co.name}. Draft-and-you-post — Genie never auto-posts to your social accounts.` },
      target: { channel: platform, market: co.code },
    });
  }
  const E = plan.email;
  if (E && E.body) {
    tasks.push({
      type: "outreach_email", priority: "strategic",
      title: `${co.name}: local outreach email`,
      payload: { ...base, subject: String(E.subject || `Partner with ${name} in ${co.name}`).slice(0, 120), body: String(E.body), text: String(E.body), audience: String(E.audience || ""), rationale: `Reach a local partner, blogger, or community in ${co.name}${E.audience ? ` (${String(E.audience).slice(0, 80)})` : ""}. Draft-and-you-send.` },
      target: { market: co.code },
    });
  }
  const Q = plan.localSeo;
  if (Q && Q.snippet) {
    tasks.push({
      type: "seo_fix", priority: "strategic",
      title: `${co.name}: local visibility snippet`,
      payload: { ...base, title: String(Q.title || "Local visibility setup"), body: `\`\`\`html\n${String(Q.snippet)}\n\`\`\`\n\n${String(Q.note || "")}`.trim(), text: String(Q.snippet), copyPaste: true, rationale: `Copy-paste hreflang + geo signals so ${co.name} searchers find your page. Genie recommends — you (or your dev) paste it on your own site. Genie never edits your site.` },
      target: { market: co.code },
    });
  }
  (Array.isArray(plan.distribution) ? plan.distribution.slice(0, 3) : []).forEach((d) => {
    if (!d || !(d.title || d.where)) return;
    const bodyParts = [];
    if (d.where) bodyParts.push(`**Where:** ${d.where}`);
    if (d.why) bodyParts.push(`**Why:** ${d.why}`);
    tasks.push({
      type: "distribution", priority: "strategic",
      title: `${co.name}: ${String(d.title || d.where).slice(0, 70)}`,
      payload: { ...base, body: bodyParts.join("\n\n") || String(d.title), text: String(d.where || d.title), rationale: `A local placement in ${co.name} to get your page seen faster.` },
      target: { market: co.code },
    });
  });
  return tasks;
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
      if (ex) await supabase.from("actions").update({ payload: clean, status: "active" }).eq("id", ex.id).eq("user_id", user.id);
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
  if (row.englishTest) return jres({ ok: false, needsConfirm: true, error: `${co.name} is an English-test market — English isn't its first language. Confirm you're OK selling in English there (toggle it in Eligibility), or pick a market where you already get English search traffic.` }, 400);
  const writeLang = row.supportsLang && co.lang !== "en" ? co.lang : "en";
  const keyword = ctx.keyword || co.name;
  const days = row.days || 60;
  const plan = ["Localized landing page", "Local intro post", "Local outreach email", "Copy-paste local-SEO snippet", "A few local placements"];
  const goal = `First qualified leads from ${co.name} within ~${days} days`;
  const expPayload = { code, name: co.name, flag: flagEmoji(co.iso2), lang: co.lang, writeLang, difficulty: row.difficulty || "Medium", days, expTraffic: row.expTraffic || null, expSalesLow: row.expSalesLow ?? null, expSalesHigh: row.expSalesHigh ?? null, goal, plan, startedAt: new Date().toISOString(), draftStatus: "pending", articleActionId: null, taskCount: 0 };

  // 1) persist the experiment first (so it exists even if the AI hiccups)
  let expId = null;
  try {
    const { data: expRow } = await supabase.from("actions").insert({ user_id: user.id, type: "market_experiment", status: "active", title: `Market: ${co.name}`, priority: "strategic", payload: expPayload, target: { host: ctx.host } }).select("id").maybeSingle();
    expId = expRow?.id || null;
  } catch (e) { return jres({ ok: false, error: "Couldn't start that experiment. Try again." }, 500); }

  // 2) draft the country-specific KIT in ONE AI call. Each piece becomes its own
  //    proposed action tagged with this country → Approvals groups them on one tab.
  let planJson = null, aiError = null;
  try {
    const result = await callAI({ system: "You are Genie, an expert multilingual SEO/AEO marketer. Write genuinely useful, specific, locally-relevant content — never generic filler. Return ONLY valid JSON, no markdown fences.", json: true, maxTokens: 4200, temperature: 0.7, prompt: marketPlanPrompt({ name: ctx.name, country: co.name, keyword, host: ctx.host, language: writeLang }) });
    planJson = result?.json || null;
  } catch (e) { aiError = e instanceof AllProvidersFailedError ? "busy" : "error"; }

  let tasks = buildMarketTasks({ plan: planJson, name: ctx.name, host: ctx.host, co, keyword, expId, writeLang });
  // Graceful fallback: always guarantee at least the anchor landing page.
  if (!tasks.some((t) => t.type === "article")) {
    try {
      const r2 = await callAI({ system: "You are Genie, an expert SEO/AEO content writer. Return ONLY valid JSON, no markdown fences.", json: true, maxTokens: 3200, temperature: 0.7, prompt: marketPrompt({ name: ctx.name, country: co.name, keyword, host: ctx.host, language: writeLang }) });
      if (r2?.json?.title && r2?.json?.body) tasks = [...buildMarketTasks({ plan: { landing: r2.json }, name: ctx.name, host: ctx.host, co, keyword, expId, writeLang }), ...tasks];
    } catch (e) { if (!aiError) aiError = e instanceof AllProvidersFailedError ? "busy" : "error"; }
  }

  // 3) insert every kit task as a normal proposed action (country-tagged)
  let inserted = [];
  if (tasks.length) {
    try {
      const rows = tasks.map((t) => ({ user_id: user.id, type: t.type, status: "proposed", title: t.title, priority: t.priority, payload: t.payload, target: t.target }));
      const { data } = await supabase.from("actions").insert(rows).select("id, type, title");
      inserted = data || [];
    } catch {}
  }
  const articleActionId = inserted.find((r) => r.type === "article")?.id || null;
  const draftStatus = articleActionId ? "drafted" : "pending";
  const tasksAdded = inserted.length;

  if (expId) { try { await supabase.from("actions").update({ payload: { ...expPayload, articleActionId, draftStatus, taskCount: tasksAdded } }).eq("id", expId).eq("user_id", user.id); } catch {} }

  try {
    const { logActivity } = await import("@/lib/activity");
    await logActivity(supabase, user.id, { host: ctx.host, verb: "expanding", icon: "🌍", message: `Started a ${co.name} market test${tasksAdded ? ` — added ${tasksAdded} ${co.name}-specific ${tasksAdded === 1 ? "task" : "tasks"} to Approvals` : ""}`, detail: tasksAdded ? "Review them in Approvals — they're tagged by country." : "Genie will add the country tasks shortly.", meta: { market: co.code } });
  } catch {}

  return jres({ ok: true, id: expId, draftStatus, tasksAdded, tasks: inserted.map((r) => ({ kind: r.type, title: r.title })), country: co.name, flag: flagEmoji(co.iso2), aiError });
}
