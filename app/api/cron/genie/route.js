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

  // Every distinct (user, host) that has keywords is an active entity.
  const { data: kw } = await admin.from("keywords").select("user_id, host").limit(20000);
  const seen = new Set();
  const entities = [];
  for (const k of kw || []) {
    if (!k.user_id || !k.host) continue;
    const key = `${k.user_id}::${k.host}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push({ userId: k.user_id, host: k.host });
  }

  // Fan out — one isolated, idempotent job per entity.
  await Promise.allSettled(entities.map((e) => enqueue(appUrl, "/api/jobs/entity", { userId: e.userId, host: e.host })));

  await recordEvent(admin, { type: "system.cron.dispatch", actor: "system", data: { entities: entities.length } });
  logger.info("cron.dispatch.done", { entities: entities.length });
  return json({ ok: true, dispatched: entities.length });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
