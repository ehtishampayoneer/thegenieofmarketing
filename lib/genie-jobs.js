// lib/genie-jobs.js
// The per-entity nightly pipeline — the work that used to run inline in the cron
// monolith, now isolated so it executes in its own serverless invocation with its
// own time budget. One slow or failing entity can no longer sink the whole run.
// Best-effort internal calls (each capability route is idempotent / cooldown-aware).

import { gradePortfolio } from "@/lib/keyword-health";
import { nicheSuggestions } from "@/lib/suggest";
import { queueListings } from "@/lib/launch-queue";

function cronHeader() { return process.env.CRON_SECRET || ""; }

async function call(url, body, ms = 90000) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-genie-cron": cronHeader() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
  } catch {}
}

async function countReady(admin, userId, host) {
  try {
    const { count } = await admin.from("placements").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("host", host).eq("status", "ready");
    return count || 0;
  } catch { return 0; }
}

// Run the full growth pipeline for ONE entity. Returns metrics for the ledger.
export async function runEntityPipeline(admin, appUrl, { userId, host }) {
  let retired = 0;

  // 1) Pull REAL Google data (if connected) → health, dead/new, daily snapshot.
  await Promise.all([
    call(`${appUrl}/api/keywords/sync`, { host, _uid: userId }, 50000),
    call(`${appUrl}/api/analytics/sync`, { host, _uid: userId }, 50000), // GA4 traffic proof
  ]);



  // 2) Re-grade + persist keyword health (retire proven losers).
  const kwSelect = "user_id, host, keyword, health, coverage, traffic_potential, competition, gsc_clicks, gsc_impressions";
  let { data: kwRows } = await admin.from("keywords").select(kwSelect).eq("user_id", userId).eq("host", host);

  // No keywords means the first derivation failed. Every radar, the content engine
  // and outreach run on keywords, so rebuild them before anything else rather than
  // spending the whole night producing nothing.
  if (!kwRows?.length) {
    const { data: s } = await admin.from("scans").select("ai")
      .eq("user_id", userId).or(`final_url.ilike.%${host}%,url.ilike.%${host}%`)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (s?.ai) {
      await call(`${appUrl}/api/keywords`, { host, ai: s.ai, _uid: userId }, 110000);
      ({ data: kwRows } = await admin.from("keywords").select(kwSelect).eq("user_id", userId).eq("host", host));
    }
  }
  const { graded } = gradePortfolio(kwRows || []);
  for (const g of graded) {
    await admin.from("keywords").update({ health: g.health, last_scored_at: new Date().toISOString() })
      .eq("user_id", userId).eq("host", host).eq("keyword", g.keyword);
    if (g.health === "retired") retired++;
  }

  // 3) The business's AI profile (radars need it).
  const { data: scan } = await admin.from("scans").select("ai, final_url, url")
    .eq("user_id", userId).or(`final_url.ilike.%${host}%,url.ilike.%${host}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const ai = scan?.ai || null;

  const before = await countReady(admin, userId, host);

  // 4) Radars + capabilities (each enforces its own cooldowns/caps).
  //
  // These used to run one after another: nine calls of up to 90-110s each inside a
  // job that Vercel stops at 300s. Outreach, the step that actually emails
  // prospects, was second to last, so on any slow night it never ran, and the job
  // died before recording "done" so nothing noticed. They are independent of each
  // other, so they now run in two parallel waves, the ones that make money first.
  // Each capability is its own serverless invocation: when `call` stops waiting at
  // its timeout, that invocation keeps running to completion on its own, so a
  // shorter wait here costs nothing but lets this job finish inside its limit.
  // Two waves rather than one keeps a single business from firing nine model-heavy
  // requests at the free AI tiers in the same second.
  const WAIT = 100000;
  await Promise.all([
    call(`${appUrl}/api/outreach/campaign`, { host, _uid: userId }, WAIT),
    // Draft real, publish-ready content into the Approvals queue.
    call(`${appUrl}/api/content`, { host, ai, _uid: userId }, WAIT),
    call(`${appUrl}/api/radar/intent`, { host, ai, _uid: userId }, WAIT),
  ]);

  // ── NEW PLACES, EVERY NIGHT ──
  // Get featured found sites only when the owner pressed a button, so the one
  // thing that compounds — being published and linked on OTHER people's sites —
  // never happened on its own. A different play each night keeps finding new
  // sites (already-pitched domains are held back by the route), and each arrives
  // with a drafted pitch waiting for approval. Nothing is sent without the owner.
  const PLAY_ROTATION = ["backlinks", "guest", "directory", "press", "partners", "broken"];
  const dayIndex = Math.floor(Date.now() / 86400000);
  const play = PLAY_ROTATION[dayIndex % PLAY_ROTATION.length];
  const niche = nightlyNiche(ai, kwRows, dayIndex);

  let escalated = 0, pillared = 0;
  await Promise.all([
    niche ? call(`${appUrl}/api/featured/discover`, { play, niche, host, _uid: userId }, WAIT) : Promise.resolve(),
    // Prepare the versions for other platforms for the newest article, so "spread
    // it" is ready to paste rather than something to remember to generate.
    prepareSpread(admin, appUrl, { userId, host }),
    // The next best places to be listed (review sites, launch days, directories)
    // go into Approvals as Copy & open items. Paced: a couple a night, never a pile.
    queueListings(admin, { userId, host, ai }),
    call(`${appUrl}/api/radar/reddit`, { host, ai, _uid: userId }, WAIT),
    call(`${appUrl}/api/radar/quora`, { host, ai, _uid: userId }, WAIT),
    call(`${appUrl}/api/radar/web`, { host, ai, _uid: userId }, WAIT),
    call(`${appUrl}/api/ai-search`, { host, ai, _uid: userId }, WAIT),
    call(`${appUrl}/api/engagement`, { host, ai, _uid: userId }, 60000),
    call(`${appUrl}/api/notifications`, { host, ai, _uid: userId }, 60000),
    call(`${appUrl}/api/learn`, { host, ai, _uid: userId }, 60000),
    // Search Console checks: pages not on Google, losing clicks, or competing with
    // each other. A no-op until Google is connected.
    call(`${appUrl}/api/search-health`, { host, _uid: userId }, WAIT),
    // Unstick stalled keywords with a supporting cluster piece that links to the
    // stuck page. The off-page half (get listed on trusted lists) is in the UI.
    escalateStalled(admin, appUrl, { userId, host }).then((n) => { escalated = n; }).catch(() => {}),
    // Topical authority: one pillar (hub) page per night when a cluster exists.
    import("@/lib/pillars").then(({ buildPillar }) => buildPillar(admin, userId, host, ai)).then((r) => { pillared = r?.ok ? 1 : 0; }).catch(() => {}),
  ]);

  // The swarm: 1,000 simulated customers test tonight's drafts and the improvers
  // fix the weak ones before the owner sees them (lib/swarm). Its own invocation,
  // so a short wait here is enough; it runs on and stops itself inside its limit.
  // "Genie sets Search Console up for you" used to need a button press. Finish it
  // unattended whenever that can be done honestly (lib/gsc-auto.js).
  // Anything that started publishing and never finished goes back in front of
  // the owner. Runs nightly as well as on the Approvals list, because a business
  // that never opens Approvals should still not lose work silently.
  try { const { recoverStuckActions } = await import("@/lib/stuck"); await recoverStuckActions(admin, { userId }); } catch {}

  try { const { autoSetupSearchConsole } = await import("@/lib/gsc-auto"); await autoSetupSearchConsole(admin, { userId, host }); } catch {}

  // Once a week the crowd reads the owner's own home page as first-time visitors,
  // and only speaks up when it found something real (lib/swarm/site-check.js).
  try { const { weeklySiteCheck } = await import("@/lib/swarm/site-check"); await weeklySiteCheck(admin, { userId, host }); } catch {}

  // First learn from what really happened to earlier drafts, then test new ones.
  try { const { calibrate } = await import("@/lib/swarm/calibrate"); await calibrate(admin, { userId, host }); } catch {}
  await call(`${appUrl}/api/swarm/tick`, { _uid: userId }, 8000);

  const after = await countReady(admin, userId, host);
  return { staged: Math.max(0, after - before), retired, escalated, pillared };
}

// Stalled keywords need MORE than another page — they need authority. Genie
// auto-does the on-page half: one supporting cluster piece that deepens and links
// to the stuck page (topical authority + internal links). Bounded to one per night
// to respect the free-tier AI budget. The off-page half is surfaced in the UI.
async function escalateStalled(admin, appUrl, { userId, host }) {
  try {
    const { data: kws } = await admin.from("keywords")
      .select("keyword, competition, volume, traffic_potential, coverage")
      .eq("user_id", userId).eq("host", host).neq("health", "retired").limit(200);
    if (!kws?.length) return 0;

    const { data: hist } = await admin.from("keyword_history")
      .select("keyword, position, recorded_on")
      .eq("user_id", userId).eq("host", host).order("recorded_on", { ascending: true }).limit(1000);
    const series = {};
    for (const r of hist || []) (series[r.keyword] ||= []).push({ date: r.recorded_on, position: r.position });

    const { planPortfolio } = await import("@/lib/keyword-plan");
    const stalled = planPortfolio(kws, series).plan.filter((p) => p.status.state === "stalled");
    if (!stalled.length) return 0;

    const target = stalled[0].keyword;
    await call(`${appUrl}/api/content`, {
      host, _uid: userId,
      topic: `A specific, genuinely useful supporting guide that deepens and links to our main page on "${target}" (a fresh angle, not a rewrite) — written to build topical authority for it.`,
    }, 90000);
    return stalled.length;
  } catch { return 0; }
}

// A different niche phrase each night, from what the owner told Genie and the
// keyword strategy, so the search for new places does not ask the same question
// for months. Falls back to nothing (the nightly find is skipped) when Genie has
// no idea what the business is about yet.
function nightlyNiche(ai, kwRows, dayIndex) {
  try {
    const list = nicheSuggestions({ ai: ai || {}, keywords: kwRows || [], limit: 6 }).map((s) => s.text);
    return list.length ? list[dayIndex % list.length] : "";
  } catch { return ""; }
}

// Write the per-platform versions for the newest published article that has none.
// One AI call, and only when there is something new to spread.
async function prepareSpread(admin, appUrl, { userId, host }) {
  try {
    const { data: pages } = await admin.from("published_pages")
      .select("id").eq("user_id", userId).order("published_at", { ascending: false }).limit(5);
    if (!pages?.length) return;
    const { data: packs } = await admin.from("events")
      .select("data").eq("user_id", userId).eq("type", "spread.pack").limit(200);
    const done = new Set((packs || []).map((e) => e?.data?.pageId).filter(Boolean));
    const next = pages.find((p) => !done.has(p.id));
    if (!next) return;
    await call(`${appUrl}/api/spread`, { pageId: next.id, _uid: userId, host }, 90000);
  } catch {}
}
