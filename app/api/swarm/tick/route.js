// app/api/swarm/tick/route.js
// Runs one pass of the swarm (lib/swarm/engine.js): test and improve whatever is
// waiting, until the time budget is used, then stop. The next tick carries on.
//
// Called by: the nightly run for each business (x-genie-cron + _uid), the free
// heartbeat every ten minutes (.github/workflows/genie-heartbeat.yml, all
// businesses), and Vercel cron. Guarded by CRON_SECRET either way.

import { createAdminClient } from "@/lib/supabase/admin";
import { tick } from "@/lib/swarm/engine";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const bearer = request.headers.get("authorization") === `Bearer ${secret}`;
  const header = request.headers.get("x-genie-cron") === secret;
  return bearer || header;
}

async function run(request) {
  if (!authorized(request)) return json({ ok: false, error: "Unauthorized" }, 401);
  let body = {};
  try { body = await request.json(); } catch {}
  const userId = typeof body?._uid === "string" ? body._uid : null;
  const admin = createAdminClient();
  const r = await tick(admin, { userId, budgetMs: 230000 });
  // One line per tick so the team page can show whether the swarm is awake.
  if (r.tested || r.waiting) {
    await recordEvent(admin, { userId, type: "swarm.tick", actor: "genie", subject: `${r.tested} tested`, data: r });
  }
  return json({ ok: true, ...r });
}

export async function POST(request) { return run(request); }
export async function GET(request) { return run(request); }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
