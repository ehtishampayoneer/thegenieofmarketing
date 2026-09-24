// lib/swarm/engine.js
// ── THE SWARM: TESTERS, IMPROVERS, DOERS ──
// One pass ("tick") takes the drafts waiting for the owner that the crowd has not
// seen yet, and for each one:
//   1. TESTERS  - about 30 kinds of real buyer plus the gatekeepers for that kind
//                 of item react (AI, 2 calls), then 1,000 individuals built from
//                 them argue it out over 12 rounds (plain code, free).
//   2. IMPROVERS - if the crowd did not like it, every complaint becomes a ticket,
//                 three better versions are written and a panel picks the winner
//                 (2 calls), and the full crowd runs again on the winner.
//   3. The result is saved on the item, so Approvals shows what the crowd said,
//      and recorded as events, so the team page can count and show it live.
// The DOERS are Genie's existing engines (nightly run, publishing, checks); the
// team page counts their real work from the activity log.
//
// NEVER STOPS
//   • Uses only FREE AI providers, so it never spends the paid credit the core
//     features need (SWARM_ALLOW_PAID=true to change that).
//   • When every free AI is busy it keeps testing with the rules judge alone,
//     marks the item "quick check", and gives it the full crowd later, once AI
//     is back. Nothing is skipped and nothing is lost: what still needs testing
//     is simply "items without a result", read fresh from the database each tick.
//   • A tick stops itself well inside the serverless time limit and the next tick
//     carries on where it left off. Ticks come from the nightly run, and from the
//     free heartbeat (.github/workflows/genie-heartbeat.yml) every ten minutes.
//   • A failure on one item never touches the item itself: it simply stays
//     untested and is tried again next tick.

import { callAI, AllProvidersFailedError, freeProvidersReady } from "@/lib/ai-router";
import { recordEvent } from "@/lib/events";
import { hostOf } from "@/lib/business";
import { simulate, seedFrom, CROWD_SIZE } from "@/lib/swarm/sim";
import { kindOf, crowdFor, crowdPrompt, normalizeCrowd, fallbackCrowd, CROWD_TTL_DAYS } from "@/lib/swarm/crowd";
import { isFirstImpression, weakNote } from "@/lib/swarm/first-impression";
import { ownerSignal, alwaysImprove } from "@/lib/owner-signal";
import { functionLimitMs } from "@/lib/function-limit";
import { rulesJudge, judgePrompt, readJudgement, rulesReactions, meanOf } from "@/lib/swarm/judge";
import { needsImprovement, ticketsFrom, improvePrompt, readVariants, panelOf, screenPrompt, pickWinner, shiftReactions } from "@/lib/swarm/improve";

const TESTED_TYPES = ["article", "social_post", "outreach_email", "directory_submission", "community_engagement", "distribution", "media_outreach", "recovery"];
const BATCH = 18;           // people per AI judging call
const RETEST_AFTER_MS = 60 * 60 * 1000;

// ── What is waiting ──────────────────────────────────────────────────────────
/** Should the crowd look at this item (again)? */
export function needsTest(crowd, now = Date.now(), aiReady = true) {
  if (!crowd) return true;
  // A quick check done while AI was busy gets the full crowd once AI is back.
  return crowd.mode === "rules" && aiReady && !crowd.upgraded && now - Date.parse(crowd.at || 0) > RETEST_AFTER_MS;
}

export async function pendingItems(admin, { userId = null, aiReady = true, limit = 40 } = {}) {
  const items = [];
  try {
    let q = admin.from("actions").select("id, user_id, type, title, payload, target, status, created_at")
      .eq("status", "proposed").in("type", TESTED_TYPES).order("created_at", { ascending: false }).limit(300);
    if (userId) q = q.eq("user_id", userId);
    const { data } = await q;
    for (const a of data || []) {
      const p = a.payload || {};
      if (a.type === "media_outreach" && p.applied) continue;
      if (a.type === "recovery" && p.sent) continue;
      if (!needsTest(p.crowd, Date.now(), aiReady)) continue;
      const draft = draftOf({ source: "action", ...a });
      if (!draft.text) continue;
      items.push({ source: "action", ...a, ...draft });
    }
  } catch {}
  try {
    let q = admin.from("placements").select("id, user_id, host, platform, kind, draft, target_title, meta, status, created_at")
      .eq("status", "ready").order("created_at", { ascending: false }).limit(200);
    if (userId) q = q.eq("user_id", userId);
    const { data } = await q;
    for (const p of data || []) {
      if (!needsTest(p.meta?.crowd, Date.now(), aiReady)) continue;
      if (!String(p.draft || "").trim()) continue;
      items.push({ source: "placement", ...p, text: String(p.draft), title: p.target_title || "" });
    }
  } catch {}
  // Oldest first, so nothing waits forever behind a stream of new drafts.
  return items.sort((a, b) => Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0)).slice(0, limit);
}

/** The text the crowd reads, and which field it came from (for writing back). */
export function draftOf(item) {
  const p = item.payload || {};
  if (item.source === "placement") return { text: String(item.draft || ""), title: item.target_title || "", field: "draft" };
  if (item.type === "article") {
    const body = String(p.body || p.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return { text: `${p.metaDescription || ""}\n\n${body.slice(0, 1600)}`.trim(), title: p.title || item.title || "", field: "article" };
  }
  for (const f of ["body", "text", "draft"]) if (typeof p[f] === "string" && p[f].trim()) return { text: p[f], title: p.subject || item.title || "", field: f };
  if (Array.isArray(p.draft)) return { text: p.draft.join("\n\n"), title: item.title || "", field: "draftList" };
  return { text: "", title: "", field: null };
}

// ── The crowd for a business ─────────────────────────────────────────────────
export async function buyersFor(admin, userId, host, ctx, { market = "" } = {}) {
  // A crowd for a specific country is its own crowd, stored under its own key.
  const siteHost = host;
  if (market) host = `${host}|${String(market).toLowerCase().slice(0, 40)}`;
  const key = `${userId}::${host}`;
  if (ctx.crowds.has(key)) return ctx.crowds.get(key);
  let buyers = null, mode = "rules", cv = null;
  try {
    const { data } = await admin.from("events").select("data, created_at").eq("user_id", userId).eq("type", "swarm.crowd")
      .eq("host", host).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.data?.people?.length && Date.now() - Date.parse(data.created_at) < CROWD_TTL_DAYS * 864e5) { buyers = data.data.people; mode = "ai"; cv = data.data.cv || data.created_at; }
  } catch {}
  // What reality has taught about this crowd (lib/swarm/calibrate.js).
  let learned = null;
  try {
    const { data } = await admin.from("events").select("data").eq("user_id", userId).eq("type", "swarm.calibration")
      .eq("host", host).order("created_at", { ascending: false }).limit(1).maybeSingle();
    learned = data?.data || null;
  } catch {}
  let ai = {};
  try {
    const { data: s } = await admin.from("scans").select("ai, final_url, url").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(5);
    ai = (s || []).find((x) => hostOf(x) === siteHost)?.ai || s?.[0]?.ai || {};
  } catch {}
  if (!buyers && !ctx.aiDown) {
    // Real buyers' own words make the crowd sound like the market, not like an AI.
    let voices = [];
    try {
      const { data: pl } = market ? { data: [] } : await admin.from("placements").select("target_title").eq("user_id", userId)
        .order("created_at", { ascending: false }).limit(12);
      voices = (pl || []).map((x) => x.target_title).filter(Boolean);
    } catch {}
    // A rebuilt crowd keeps what reality taught the old one: the kinds of people
    // who predicted well are described to the new crowd's author.
    const trusted = learned?.weights && learned.cv
      ? Object.entries(learned.weights).filter(([, w]) => w >= 1.2).map(([id]) => (learned.names || {})[id]).filter(Boolean)
      : [];
    // The crowd is built to THE PLAN, like everything else. Without it the
    // author invents a room full of people already evaluating this product,
    // which is the one crowd that cannot tell the owner anything useful about
    // a product nobody has heard of.
    let plan = "";
    try { const { strategyPromptBlock } = await import("@/lib/strategy-store"); plan = await strategyPromptBlock(admin, { userId, host: siteHost, ai }); } catch {}
    const r = await ai_(ctx, { prompt: crowdPrompt(ai, siteHost, voices, trusted, market, plan), maxTokens: 5000, temperature: 0.9, userId, host });
    const people = r ? normalizeCrowd(r.json) : [];
    if (people.length >= 8) {
      buyers = people; mode = "ai"; cv = new Date().toISOString();
      await recordEvent(admin, { userId, host, type: "swarm.crowd", actor: "genie", subject: `${people.length} kinds of buyer`, data: { people, cv } });
    }
  }
  // Give more say to the people whose past verdicts matched real results.
  if (buyers && learned?.cv && learned.cv === cv && learned.weights) {
    buyers = buyers.map((b) => ({ ...b, weight: (Number(b.weight) || 1) * (learned.weights[b.id] || 1) }));
  }
  const out = { buyers: buyers || fallbackCrowd(ai), mode, cv, business: ai.businessName || siteHost };
  ctx.crowds.set(key, out);
  return out;
}

// ── One run of the crowd ─────────────────────────────────────────────────────
/**
 * Testers, then (when needed or asked) improvers, on one piece of text. Used by
 * the nightly/heartbeat testing of drafts and by "Test it before you launch".
 * Returns the saved-shape verdict plus the working parts the caller may need.
 */
export async function runCrowd(admin, ctx, { userId, host, kind, text, title = "", meta = "", seedKey, market = "", question = "", improve = "auto", previous = null }) {
  const { buyers, mode: crowdMode, business, cv } = await buyersFor(admin, userId, host, ctx, { market });
  const people = crowdFor(buyers, kind);
  // The testers judge against the plan, and the improvers rewrite towards it.
  // Without it they graded a draft on whether it read well, which is how a
  // perfectly written post about the wrong thing scored 80.
  let plan = "";
  try { const { strategyPromptBlock } = await import("@/lib/strategy-store"); plan = await strategyPromptBlock(admin, { userId, host }); } catch {}
  const rules = rulesJudge(`${title ? title + "\n" : ""}${text}`, kind);
  const seed = seedFrom(String(seedKey || text.slice(0, 200)));

  // TESTERS
  let reactions = null, quotes = [], mode = "rules";
  if (!ctx.aiDown) {
    reactions = {}; let answered = 0;
    for (let i = 0; i < people.length; i += BATCH) {
      const batch = people.slice(i, i + BATCH);
      const r = await ai_(ctx, { prompt: judgePrompt({ text, kind, title, business, people: batch, question, market, plan }), maxTokens: 3000, temperature: 0.9, userId, host });
      if (!r) break;
      const j = readJudgement(r.json, batch, rules);
      Object.assign(reactions, j.reactions); quotes.push(...j.quotes); answered += j.answered;
    }
    if (answered >= Math.min(8, people.length / 2)) {
      mode = crowdMode === "ai" ? "ai" : "ai-basic";
      // Anyone the AI did not get to is read by the rules, so the crowd is whole.
      const rest = rulesReactions(people.filter((p) => !reactions[p.id]), rules);
      Object.assign(reactions, rest);
    } else reactions = null;
  }
  if (!reactions) reactions = rulesReactions(people, rules);

  const before = simulate(people, reactions, { size: CROWD_SIZE, seed });
  let after = null, improvement = null, afterReactions = null;

  // IMPROVERS
  const wantImprove = improve === true || (improve === "auto" && needsImprovement(before));
  if (mode !== "rules" && wantImprove && !ctx.aiDown) {
    const tickets = ticketsFrom(before);
    const isArticle = kind === "article";
    const original = isArticle ? `${title}\n${meta}` : text;
    const w = await ai_(ctx, {
      prompt: improvePrompt({ text: isArticle ? meta : text, kind, title, business, tickets, quotes, isArticle, plan }),
      maxTokens: isArticle ? 900 : 2800, temperature: 0.8, userId, host,
    });
    const variants = w ? readVariants(w.json, isArticle) : [];
    if (variants.length) {
      const panel = panelOf(people);
      const shown = variants.map((v) => (isArticle ? `${v.title}\n${v.meta}` : v.text));
      const sc = await ai_(ctx, { prompt: screenPrompt({ kind, business, original, variants: shown, panel }), maxTokens: 1500, temperature: 0.4, userId, host });
      const win = sc ? pickWinner(sc.json, panel, variants.length) : { index: -1 };
      if (win.index >= 0) {
        afterReactions = shiftReactions(reactions, win.deltas);
        after = simulate(people, afterReactions, { size: CROWD_SIZE, seed });
        if (after.score > before.score) improvement = { variant: variants[win.index], gain: win.gain, tickets };
        else { after = null; afterReactions = null; }
      }
    }
  }

  const final = after || before;
  const finalReactions = afterReactions || reactions;
  const crowd = {
    v: 1, mode, size: final.size, kinds: people.length, kind, cv,
    // How each kind of buyer felt, kept so the reality check can learn who to trust.
    am: mode === "rules" ? undefined : Object.fromEntries(people.filter((p) => !p.gate).map((p) => [p.id, Math.round(meanOf(finalReactions[p.id]?.dist || [0, 0, 1, 0, 0]) * 100) / 100])),
    score: final.score, positive: final.positive, negative: final.negative, act: final.act, backlash: final.backlash,
    objections: final.objections.slice(0, 4), gate: final.gate ? { ...final.gate, name: people.find((p) => p.id === final.gate.id)?.name || "" } : null,
    quotes: quotes.sort((a, b) => a.mean - b.mean).slice(0, 2).concat(quotes.sort((a, b) => b.mean - a.mean).slice(0, 2)).map(({ who, q }) => ({ who, q })),
    series: final.series,
    before: after ? { score: before.score, positive: before.positive } : null,
    improved: improvement ? { changed: improvement.variant.changed, gain: improvement.gain, tickets: improvement.tickets.length } : null,
    signals: rules.signals.slice(0, 4),
    upgraded: previous?.mode === "rules" ? true : undefined,
    at: new Date().toISOString(),
  };
  return { crowd, improvement, people, reactions: finalReactions, before, after, quotes, business };
}

// ── WHAT THE CROWD ACTUALLY SAID ─────────────────────────────────────────────
// The team page is a live feed, not a scoreboard, so the event has to carry the
// human part: what people objected to, and two things they said in their own
// words. Without this the feed can only ever say "78/100", which tells an owner
// nothing about what their buyers are arguing about.
export function testedData(crowd, before, extra = {}) {
  return {
    kind: crowd.kind, score: crowd.score, size: crowd.size, mode: crowd.mode,
    positive: crowd.positive, negative: crowd.negative, act: crowd.act,
    tickets: before.objections.length,
    objections: (crowd.objections || []).slice(0, 3).map((o) => ({ tag: o.tag, count: o.count })),
    quotes: (crowd.quotes || []).slice(0, 2),
    blocked: crowd.gate?.blocked ? (crowd.gate.name || "") : null,
    ...extra,
  };
}

// ── One queued item ──────────────────────────────────────────────────────────
export async function testItem(admin, item, ctx) {
  const userId = item.user_id;
  const host = item.host || item.target?.host || item.payload?.host || "";
  const kind = kindOf(item);

  // ── THE FIRST FEW AN OWNER EVER READS ──
  // Improvement is normally conditional: it fires when the first read comes back
  // weak. That is the right economy for the hundredth draft and the wrong one for
  // the first, where a merely-adequate email costs the whole account and the AI
  // call that would have sharpened it costs a fraction of a cent.
  const first = await isFirstImpression(admin, userId);

  // ── AND THE KINDS THE OWNER KEEPS REWRITING ──
  // A rewrite is the owner saying "not in those words". Once they have said it
  // twice about a kind of draft, that kind stops waiting to be judged weak before
  // the improvers touch it. Cached per tick: one read per owner, not per item.
  ctx.signals ||= new Map();
  if (!ctx.signals.has(userId)) ctx.signals.set(userId, await ownerSignal(admin, userId));
  const rewritten = alwaysImprove(ctx.signals.get(userId), item.type, item.platform);

  const { crowd, improvement, before } = await runCrowd(admin, ctx, {
    userId, host, kind, text: item.text, title: item.title, meta: item.payload?.metaDescription || "",
    seedKey: item.id, previous: item.payload?.crowd || item.meta?.crowd || null,
    improve: first || rewritten ? true : "auto",
  });

  // Nothing is held back. A weak draft still reaches the owner, carrying a line
  // that says to read it properly rather than approve it on trust — hiding it
  // would risk the worst possible day two, an empty queue and no explanation.
  const note = weakNote(crowd, { first });
  if (note) crowd.weakNote = note;

  await save(admin, item, crowd, improvement);
  await recordEvent(admin, {
    userId, host, type: "swarm.tested", actor: "genie", subject: item.title || labelOf(kind),
    data: testedData(crowd, before, { itemId: item.id, source: item.source, improved: !!improvement }),
  });
  if (improvement) {
    await recordEvent(admin, {
      userId, host, type: "swarm.improved", actor: "genie", subject: item.title || labelOf(kind),
      data: { itemId: item.id, kind, from: before.score, to: crowd.score, tickets: improvement.tickets.map((t) => t.tag), changed: improvement.variant.changed },
    });
  }
  return crowd;
}

async function save(admin, item, crowd, improvement) {
  if (item.source === "placement") {
    const patch = { meta: { ...(item.meta || {}), crowd } };
    if (improvement?.variant?.text) { patch.draft = improvement.variant.text; patch.meta.originalDraft = item.meta?.originalDraft || item.draft; }
    await admin.from("placements").update(patch).eq("id", item.id).eq("user_id", item.user_id);
    return;
  }
  const payload = { ...(item.payload || {}), crowd };
  const v = improvement?.variant;
  if (v && item.field === "article") {
    payload.originalTitle = payload.originalTitle || payload.title; payload.originalMeta = payload.originalMeta || payload.metaDescription;
    if (v.title) payload.title = v.title;
    if (v.meta) payload.metaDescription = v.meta;
  } else if (v?.text && ["body", "text", "draft"].includes(item.field)) {
    payload.originalDraft = payload.originalDraft || payload[item.field];
    payload[item.field] = v.text;
  }
  await admin.from("actions").update({ payload }).eq("id", item.id).eq("user_id", item.user_id);
}

// ── A tick ───────────────────────────────────────────────────────────────────
/**
 * Test what is waiting until the time budget runs out. Returns counts. Never
 * throws: a failed item is left untested and picked up next time.
 */
export async function tick(admin, { userId = null, budgetMs = null } = {}) {
  const budget = Number(budgetMs) > 0 ? Number(budgetMs) : Math.max(20000, functionLimitMs() - 10000);
  const started = Date.now();
  const ready = freeProvidersReady();
  const ctx = { admin, crowds: new Map(), aiDown: !ready.length, deadline: started + budget, calls: 0 };
  const items = await pendingItems(admin, { userId, aiReady: !ctx.aiDown });
  let tested = 0, improved = 0, quick = 0, failed = 0;
  for (const item of items) {
    // Leave room for a full item (up to ~5 AI calls) inside the limit.
    if (Date.now() > ctx.deadline - (ctx.aiDown ? 3000 : 70000)) break;
    try {
      const c = await testItem(admin, item, ctx);
      tested++; if (c.improved) improved++; if (c.mode === "rules") quick++;
    } catch { failed++; }
  }
  return { waiting: items.length, tested, improved, quick, failed, aiDown: ctx.aiDown, calls: ctx.calls, ms: Date.now() - started };
}

// Free AI only (unless the owner allows paid). Returns null instead of throwing,
// and marks AI as down for the rest of the tick once every provider has failed.
/** A fresh run context (crowd cache, AI state, time budget) for a caller outside tick(). */
export function newContext(admin, budgetMs = null) {
  const budget = Number(budgetMs) > 0 ? Number(budgetMs) : Math.max(20000, functionLimitMs() - 10000);
  return { admin, crowds: new Map(), aiDown: !freeProvidersReady().length, deadline: Date.now() + budget, calls: 0 };
}

export async function ai_(ctx, { prompt, maxTokens, temperature, userId, host }) {
  if (ctx.aiDown || Date.now() > ctx.deadline - 5000) return null;
  const allowPaid = /^(1|true|yes)$/i.test(process.env.SWARM_ALLOW_PAID || "");
  const only = allowPaid ? null : freeProvidersReady();
  if (only && !only.length) { ctx.aiDown = true; return null; }
  try {
    ctx.calls++;
    const r = await callAI({
      system: "You simulate real people's honest reactions for market research. Return ONLY valid JSON.",
      prompt, json: true, maxTokens, temperature, timeoutMs: 45000, ...(only ? { only } : {}),
      ctx: { supabase: ctx.admin || null, userId, host, tag: "swarm" },
    });
    return r?.json ? r : null;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) ctx.aiDown = true;
    return null;
  }
}

export function labelOf(kind) { return ({ article: "Article", pitch: "Pitch", listing: "Listing", email: "Email", reply: "Reply", reddit: "Reddit post", quora: "Quora answer", winback: "Win-back email" })[kind] || "Post"; }
