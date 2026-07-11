// app/api/jobs/entity/route.js
// One entity's nightly run, isolated in its own invocation. Idempotent: it skips
// entities already completed today (guarded by a done-event on the ledger), so
// re-dispatching is safe. On success it records system.entity.run + .done; on
// failure it records system.error and returns 500 (leaving no done-event, so the
// next dispatch retries it). This is what makes the loop reliable at scale.

import { createAdminClient } from "@/lib/supabase/admin";
import { runEntityPipeline } from "@/lib/genie-jobs";
import { recordEvent, getEvents } from "@/lib/events";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { userId, host } = body || {};
  if (!userId || !host) return json({ ok: false, error: "userId and host are required." }, 400);

  const appUrl = process.env.APP_URL || "https://thegenieofmarketing.vercel.app";
  const admin = createAdminClient();
  const day = new Date().toISOString().slice(0, 10);

  // Idempotency: already completed today? skip (safe re-dispatch).
  const done = await getEvents(admin, { userId, host, types: ["system.entity.done"], since: `${day}T00:00:00.000Z`, limit: 1 });
  if (done.length) return json({ ok: true, skipped: "already_done_today" });

  try {
    const metrics = await runEntityPipeline(admin, appUrl, { userId, host });
    await recordEvent(admin, { userId, host, type: "system.entity.run", actor: "system", data: metrics });
    await recordEvent(admin, { userId, host, type: "system.entity.done", actor: "system", dedupeKey: `entity-done:${userId}:${host}:${day}`, data: { day } });
    logger.info("entity.done", { userId, host, ...metrics });
    return json({ ok: true, ...metrics });
  } catch (e) {
    recordEvent(admin, { userId, host, type: "system.error", actor: "system", subject: "entity.job", data: { message: String(e?.message || e).slice(0, 200) } }).catch(() => {});
    logger.error("entity.failed", { userId, host, message: String(e?.message || e).slice(0, 200) });
    return json({ ok: false, error: "job_failed" }, 500);
  }
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
