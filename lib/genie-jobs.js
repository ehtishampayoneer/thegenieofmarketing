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

// ── START IT AND LET GO ──
// Every engine below is its own serverless route, so it gets its own invocation and
// its own time limit. Waiting for it here bought nothing except the risk of this
// function being killed first — and that is exactly what was happening: on Vercel
// Hobby the orchestrator is stopped at 60 seconds whatever it declares, and with the
// content engine alone taking most of that, everything after it in the pipeline
// never ran at all. Not the tail: the radars, Get featured, the listings, the
// learning run, the notifications and the search-health checks, every night.
//
// So the engines are started and not awaited. Aborting the client fetch does not
// stop the invocation it already started — that is the whole mechanism lib/queue.js
// already relies on for dispatching a whole entity.
//
// Four seconds rather than the 2.5 that file uses, because this fires a dozen at
// once instead of one and a cold platform is slower to accept the twelfth than the
// first. They go in parallel, so four seconds is the cost of all of them, against
// the hundred seconds EACH that this used to wait.
const HANDOFF_MS = 4000;
async function fire(url, body) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-genie-cron": cronHeader() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(HANDOFF_MS),
    });
  } catch {
    // A timeout here is the expected case, not a failure: the work is running.
  }
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

  // The clock this whole pass runs against. The route declares 300 seconds and the
  // host may allow 60; every stage below asks how much is actually left. Eight
  // seconds are held back so that whatever else is skipped, the ledger event saying
  // the run happened still gets written — a run nothing can see is worse than a
  // short one.
  const clock = makeClock(8000);

  // 1) Pull REAL Google data (if connected) → health, dead/new, daily snapshot.
  // Waited for, because the keyword re-grade below reads what these write. Kept
  // short: a slow Google is not a reason to lose the rest of the night.
  await Promise.all([
    call(`${appUrl}/api/keywords/sync`, { host, _uid: userId }, 12000),
    call(`${appUrl}/api/analytics/sync`, { host, _uid: userId }, 12000), // GA4 traffic proof
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
      // The one call in the pipeline that must actually finish before anything else
      // is worth starting: every engine below works from keywords. It gets whatever
      // is left, and if that is not enough the entity is left for tomorrow rather
      // than dispatching sixteen engines that have nothing to work from.
      await call(`${appUrl}/api/keywords`, { host, ai: s.ai, _uid: userId }, Math.max(15000, clock.left() - 10000));
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
  await Promise.all([
    fire(`${appUrl}/api/outreach/campaign`, { host, _uid: userId }),
    // Draft real, publish-ready content into the Approvals queue.
    fire(`${appUrl}/api/content`, { host, ai, _uid: userId }),
    fire(`${appUrl}/api/radar/intent`, { host, ai, _uid: userId }),
  ]);
  let dispatched = 3;

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

  // Every route here is its own invocation, so all of them are started and none is
  // waited for. This used to be thirteen waits of up to 100 seconds inside a
  // function the host stops at 60.
  const engines = [
    niche ? fire(`${appUrl}/api/featured/discover`, { play, niche, host, _uid: userId }) : null,
    fire(`${appUrl}/api/radar/reddit`, { host, ai, _uid: userId }),
    fire(`${appUrl}/api/radar/quora`, { host, ai, _uid: userId }),
    fire(`${appUrl}/api/radar/web`, { host, ai, _uid: userId }),
    fire(`${appUrl}/api/ai-search`, { host, ai, _uid: userId }),
    fire(`${appUrl}/api/engagement`, { host, ai, _uid: userId }),
    fire(`${appUrl}/api/notifications`, { host, ai, _uid: userId }),
    fire(`${appUrl}/api/learn`, { host, ai, _uid: userId }),
    // Search Console checks: pages not on Google, losing clicks, or competing with
    // each other. A no-op until Google is connected.
    fire(`${appUrl}/api/search-health`, { host, _uid: userId }),
  ].filter(Boolean);
  dispatched += engines.length;
  await Promise.all(engines);

  // ── AND THE WORK THAT HAS NO ROUTE OF ITS OWN ──
  // These run inside THIS invocation, so each one spends the clock this function is
  // going to be killed on. They are attempted in order of what an owner would miss
  // most, and each is skipped — visibly, recorded in the ledger below — when there
  // is not enough time left. A step that is skipped and named can be fixed; a step
  // that is cut off mid-way cannot even be noticed.
  let escalated = 0, pillared = 0;
  const skipped = [];
  const step = async (name, ms, fn) => {
    if (!clock.room(ms)) { skipped.push(name); return; }
    try { await fn(); } catch {}
  };

  // Prepare the versions for other platforms for the newest article, so "spread
  // it" is ready to paste rather than something to remember to generate.
  await step("spread", 12000, () => prepareSpread(admin, appUrl, { userId, host }));
  // The next best places to be listed (review sites, launch days, directories)
  // go into Approvals as Copy & open items. Paced: a couple a night, never a pile.
  await step("listings", 6000, () => queueListings(admin, { userId, host, ai }));
  // Unstick stalled keywords with a supporting cluster piece that links to the
  // stuck page. The off-page half (get listed on trusted lists) is in the UI.
  await step("escalate", 12000, async () => { escalated = await escalateStalled(admin, appUrl, { userId, host }); });
  // Topical authority: one pillar (hub) page per night when a cluster exists.
  await step("pillar", 15000, async () => {
    const { buildPillar } = await import("@/lib/pillars");
    const r = await buildPillar(admin, userId, host, ai);
    pillared = r?.ok ? 1 : 0;
  });

  // Anything that started publishing and never finished goes back in front of the
  // owner. Runs nightly as well as on the Approvals list, because a business that
  // never opens Approvals should still not lose work silently.
  // Recovering stuck work is cheap and it is the one thing that must not wait for
  // a quiet night, so it goes first and is never skipped for time.
  try { const { recoverStuckActions } = await import("@/lib/stuck"); await recoverStuckActions(admin, { userId }); } catch {}

  await step("gsc-setup", 8000, async () => {
    const { autoSetupSearchConsole } = await import("@/lib/gsc-auto");
    await autoSetupSearchConsole(admin, { userId, host });
  });

  // Once a week the crowd reads the owner's own home page as first-time visitors,
  // and only speaks up when it found something real (lib/swarm/site-check.js).
  await step("site-check", 15000, async () => {
    const { weeklySiteCheck } = await import("@/lib/swarm/site-check");
    await weeklySiteCheck(admin, { userId, host });
  });

  // First learn from what really happened to earlier drafts, then test new ones.
  await step("calibrate", 10000, async () => {
    const { calibrate } = await import("@/lib/swarm/calibrate");
    await calibrate(admin, { userId, host });
  });

  // The other direction of the brain: what the engines have measured since the
  // plan was written — real Google clicks, recorded sales, replies that arrived —
  // becomes a proposed correction to the plan, waiting on /strategy. It proposes,
  // it never applies, and it stays quiet until there is real evidence.
  let proposed = 0;
  await step("plan-revision", 15000, async () => {
    const { proposePlanRevision } = await import("@/lib/brain-learn");
    const r = await proposePlanRevision(admin, { userId, host, ai });
    proposed = r?.ok ? 1 : 0;
  });

  // The crowd reads tonight's drafts in its own invocation. Started, not waited on.
  await fire(`${appUrl}/api/swarm/tick`, { _uid: userId });

  // ── A RECORD THAT THE RUN HAPPENED ──
  // Nothing marked the end of a nightly pass, so a cron that quietly stopped —
  // a changed secret, a plan limit, a platform hiccup — looked exactly like a
  // quiet night. The owner's dashboard simply did not change, and there was
  // nowhere to find out why. This is the heartbeat Today reads.
  // `staged` used to be a before/after count of what reached Approvals. It cannot
  // mean that any more: the engines that stage the work are now still running when
  // this line is reached, so the number would always be near zero and would read as
  // "Genie did nothing". What this pass can honestly report is what it STARTED, what
  // it finished itself, and what it ran out of time for. Overnight activity on Today
  // is counted from the engines' own events, which is where it belonged anyway.
  const metrics = {
    dispatched, retired, escalated, pillared, proposed,
    readyBefore: before,
    skipped,
    ms: clock.elapsed(),
    limitMs: functionLimitMs(),
  };

  try {
    const { recordEvent } = await import("@/lib/events");
    await recordEvent(admin, {
      userId, host, type: "system.run.done", actor: "genie",
      subject: host || "nightly run",
      data: metrics,
    });
  } catch {}

  return metrics;
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
