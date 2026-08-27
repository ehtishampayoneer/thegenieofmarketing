// lib/genie-jobs.js
// The per-entity nightly pipeline — the work that used to run inline in the cron
// monolith, now isolated so it executes in its own serverless invocation with its
// own time budget. One slow or failing entity can no longer sink the whole run.
// Best-effort internal calls (each capability route is idempotent / cooldown-aware).

import { gradePortfolio } from "@/lib/keyword-health";

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
  await call(`${appUrl}/api/keywords/sync`, { host, _uid: userId }, 60000);
  await call(`${appUrl}/api/analytics/sync`, { host, _uid: userId }, 60000); // GA4 traffic proof



  // 2) Re-grade + persist keyword health (retire proven losers).
  const { data: kwRows } = await admin.from("keywords")
    .select("user_id, host, keyword, health, coverage, traffic_potential, competition, gsc_clicks, gsc_impressions")
    .eq("user_id", userId).eq("host", host);
  const { graded } = gradePortfolio(kwRows || []);
  for (const g of graded) {
    await admin.from("keywords").update({ health: g.health, last_scored_at: new Date().toISOString() })
      .eq("user_id", userId).eq("host", host).eq("keyword", g.keyword);
    if (g.health === "retired") retired++;
  }

  // 3) The business's AI profile (radars need it).
  const { data: scan } = await admin.from("scans").select("ai, final_url, url")
    .eq("user_id", userId).ilike("final_url", `%${host}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const ai = scan?.ai || null;

  const before = await countReady(admin, userId, host);

  // 4) Radars + capabilities (each enforces its own cooldowns/caps).
  await call(`${appUrl}/api/radar/reddit`, { host, ai, _uid: userId });
  await call(`${appUrl}/api/radar/quora`, { host, ai, _uid: userId });
  await call(`${appUrl}/api/radar/web`, { host, ai, _uid: userId });
  await call(`${appUrl}/api/radar/intent`, { host, ai, _uid: userId }, 110000);
  await call(`${appUrl}/api/ai-search`, { host, ai, _uid: userId }, 110000);
  // Draft real, publish-ready content into the Approvals queue (the thing the
  // user actually approves). Without this the content engine never runs.
  await call(`${appUrl}/api/content`, { host, ai, _uid: userId }, 90000);
  // Unstick stalled keywords (real effort, no rank movement) with the on-page
  // authority lever Genie can auto-do: a supporting cluster piece that links to the
  // stuck page. The off-page half (get listed on trusted lists) is flagged in the UI.
  const escalated = await escalateStalled(admin, appUrl, { userId, host });
  // Topical authority: when a cluster of related pages exists, assemble ONE pillar
  // (hub) page that links them all together, dropped into Approvals. Bounded to one
  // per night. Best-effort — never sinks the run.
  let pillared = 0;
  try { const { buildPillar } = await import("@/lib/pillars"); const r = await buildPillar(admin, userId, host, ai); pillared = r?.ok ? 1 : 0; } catch {}
  await call(`${appUrl}/api/engagement`, { host, ai, _uid: userId });
  await call(`${appUrl}/api/notifications`, { host, ai, _uid: userId });
  await call(`${appUrl}/api/outreach/campaign`, { host, _uid: userId }, 110000);
  await call(`${appUrl}/api/learn`, { host, ai, _uid: userId }, 60000);

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
