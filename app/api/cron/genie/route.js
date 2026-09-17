// app/api/cron/genie/route.js
// STAGE 6 (Phase 3) — THE DISPATCHER.
// Runs nightly (Vercel cron). Was a monolith that processed every business inline
// in one 300s invocation — which silently died past a handful of entities. Now it
// is a thin, fast fan-out: it lists active entities and enqueues ONE isolated job
// per entity (see lib/queue → /api/jobs/entity), each with its own time budget,
// retries, idempotency, and observability. One slow/failing entity can no longer
// sink the run.
//
// Guarded by CRON_SECRET. Provider-agnostic queue: dependency-free fan-out today,
// QStash by setting QSTASH_TOKEN (zero code change).

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueue } from "@/lib/queue";
import { recordEvent } from "@/lib/events";
import { logger } from "@/lib/log";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  const appUrl = process.env.APP_URL || "https://thegenieofmarketing.vercel.app";
  const admin = createAdminClient();
  logger.info("cron.dispatch.start");

  // Every scanned business is an active entity. This used to be "every business
  // that has keywords", which silently dropped anyone whose first keyword build
  // failed: no hunts, no content, no outreach, every night, with no error. The job
  // now rebuilds missing keywords itself, so it has to be dispatched to find out.
  const seen = new Set();
  const entities = [];
  const addEntity = (userId, host) => {
    if (!userId || !host) return;
    const key = `${userId}::${host}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push({ userId, host });
  };
  const { data: scans } = await admin.from("scans").select("user_id, final_url, url")
    .order("created_at", { ascending: false }).limit(20000);
  // Only each user's most recent scan: someone who also scanned a competitor or a
  // test site should not get a nightly run for it.
  const latestByUser = new Set();
  for (const s of scans || []) {
    if (!s.user_id || latestByUser.has(s.user_id)) continue;
    latestByUser.add(s.user_id);
    addEntity(s.user_id, hostOf(s));
  }
  const { data: kw } = await admin.from("keywords").select("user_id, host").limit(20000);
  for (const k of kw || []) addEntity(k.user_id, k.host);

  // Fan out — one isolated, idempotent job per entity.
  await Promise.allSettled(entities.map((e) => enqueue(appUrl, "/api/jobs/entity", { userId: e.userId, host: e.host })));

  await recordEvent(admin, { type: "system.cron.dispatch", actor: "system", data: { entities: entities.length } });
  logger.info("cron.dispatch.done", { entities: entities.length });
  return json({ ok: true, dispatched: entities.length });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
