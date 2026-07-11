// app/api/health/route.js
// Operator health from the event ledger: did the nightly loop run, how much did
// Genie do in the last 24h, and were there failures? Gated by CRON_SECRET (ops
// endpoint). No third-party APM needed — the ledger is the source of truth.

import { createAdminClient } from "@/lib/supabase/admin";
import { getEvents } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [cronRuns, recent, errors, usage] = await Promise.all([
    getEvents(admin, { types: ["system.cron.dispatch"], limit: 1 }),
    getEvents(admin, { since, limit: 500 }),
    getEvents(admin, { types: ["system.error"], since, limit: 50 }),
    getEvents(admin, { types: ["usage.llm", "usage.data"], since, limit: 3000 }),
  ]);

  const byType = {};
  for (const e of recent) byType[e.type] = (byType[e.type] || 0) + 1;

  // Unit economics + resilience from usage events (real data, not assumptions).
  const u = { llmCalls: 0, dataCalls: 0, tokensIn: 0, tokensOut: 0, estCostUsd: 0, cacheHits: 0, failures: 0 };
  for (const e of usage) {
    const d = e.data || {};
    if (e.type === "usage.llm") u.llmCalls++; else u.dataCalls++;
    u.tokensIn += d.tokensIn || 0; u.tokensOut += d.tokensOut || 0; u.estCostUsd += d.costUsd || 0;
    if (d.cached) u.cacheHits++;
    if (d.ok === false) u.failures++;
  }
  const totalCalls = u.llmCalls + u.dataCalls;
  u.estCostUsd = Math.round(u.estCostUsd * 1e4) / 1e4;
  u.cacheHitRate = totalCalls ? Math.round((u.cacheHits / totalCalls) * 100) : 0;
  u.failureRate = totalCalls ? Math.round((u.failures / totalCalls) * 100) : 0;

  const lastCron = cronRuns[0] || null;
  const lastCronAgeH = lastCron ? Math.round((Date.now() - new Date(lastCron.created_at).getTime()) / 3.6e6) : null;

  return json({
    ok: true,
    status: lastCronAgeH != null && lastCronAgeH <= 26 ? "healthy" : "stale",
    lastCronRun: lastCron ? { at: lastCron.created_at, agoHours: lastCronAgeH, ...(lastCron.data || {}) } : null,
    last24h: { totalEvents: recent.length, byType },
    usage24h: u,
    errors24h: { count: errors.length, recent: errors.slice(0, 10).map((e) => ({ at: e.created_at, host: e.host, subject: e.subject, data: e.data })) },
  });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
