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
  await call(`${appUrl}/api/engagement`, { host, ai, _uid: userId });
  await call(`${appUrl}/api/notifications`, { host, ai, _uid: userId });
  await call(`${appUrl}/api/outreach/campaign`, { host, _uid: userId }, 110000);
  await call(`${appUrl}/api/learn`, { host, ai, _uid: userId }, 60000);

  const after = await countReady(admin, userId, host);
  return { staged: Math.max(0, after - before), retired };
}
