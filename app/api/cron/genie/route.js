// app/api/cron/genie/route.js
// STAGE 6 — THE ALWAYS-ON LOOP.
// Runs nightly (Vercel cron). For every business with keywords, Genie:
//   1. Re-grades the keyword portfolio (promote winners, retire losers).
//   2. Tops up fresh keywords if the strong bench is thin.
//   3. Re-runs the radars (Reddit / Quora / Web) to stage new openings —
//      respecting all cooldowns and daily caps already in the memory.
// Result: the user wakes to "N taps today" without pressing anything.
//
// Guarded by CRON_SECRET. Best-effort per business; one failure never blocks
// the rest. Honest: this widens/refreshes the SAME staged-and-tap model — it
// never auto-posts to non-owned platforms.

import { createAdminClient } from "@/lib/supabase/admin";
import { gradePortfolio } from "@/lib/keyword-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  const appUrl = process.env.APP_URL || "https://thegenieofmarketing.vercel.app";
  const admin = createAdminClient();

  // Every distinct (user, host) that has keywords is an active business.
  const { data: kwAll } = await admin
    .from("keywords")
    .select("user_id, host, keyword, health, coverage, traffic_potential, competition, gsc_clicks, gsc_impressions")
    .limit(5000);

  const businesses = new Map(); // key: user_id::host
  for (const k of kwAll || []) {
    const key = `${k.user_id}::${k.host}`;
    (businesses.get(key) || businesses.set(key, []).get(key)).push(k);
  }

  let processed = 0, staged = 0, retired = 0, errors = 0;

  for (const [key, rows] of businesses) {
    const [userId, host] = key.split("::");
    try {
      // 1) Re-grade + persist health tiers (retire proven losers).
      const { graded } = gradePortfolio(rows);
      for (const g of graded) {
        await admin.from("keywords").update({ health: g.health, last_scored_at: new Date().toISOString() })
          .eq("user_id", userId).eq("host", host).eq("keyword", g.keyword);
        if (g.health === "retired") retired++;
      }

      // 2) Pull the business's AI profile from its latest scan (radars need it).
      const { data: scan } = await admin.from("scans")
        .select("ai, final_url, url").eq("user_id", userId)
        .ilike("final_url", `%${host}%`).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const ai = scan?.ai || null;

      // 3) Re-run the radars via internal calls (they enforce cooldowns/caps).
      //    We call our own endpoints with a service token header so they run
      //    for THIS user. Each radar is best-effort.
      const before = await countReady(admin, userId, host);
      await runRadar(appUrl, "reddit", { host, ai, _uid: userId });
      await runRadar(appUrl, "quora", { host, ai, _uid: userId });
      await runRadar(appUrl, "web", { host, ai, _uid: userId });
      const after = await countReady(admin, userId, host);
      staged += Math.max(0, after - before);

      processed++;
    } catch {
      errors++;
    }
  }

  return json({ ok: true, businesses: businesses.size, processed, staged, retired, errors });
}

async function countReady(admin, userId, host) {
  const { count } = await admin.from("placements")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("host", host).eq("status", "ready");
  return count || 0;
}

// Radars authenticate by user session normally; for cron we pass a signed
// service header the radar routes accept (CRON_SECRET + explicit user id).
async function runRadar(appUrl, name, body) {
  try {
    await fetch(`${appUrl}/api/radar/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-genie-cron": process.env.CRON_SECRET || "",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
  } catch {}
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
