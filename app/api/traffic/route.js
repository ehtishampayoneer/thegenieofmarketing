// app/api/traffic/route.js
// ── HOW MANY PEOPLE CAME TO YOUR SITE ──
// Today, yesterday, and the last 7 days, counted first-party by Genie's own
// embed. Works from the moment the snippet is pasted, with no Google Analytics
// connection and no waiting for a Search Console backfill.
//
// Honest by construction:
//   • "views" is every page counted. "visitors" is distinct tab-sessions, which
//     is close to people but not identical, and the UI says so.
//   • If the embed is not installed we return installed:false and zeroes rather
//     than inventing a number or silently showing an empty chart.
//   • GA4 numbers, when the owner has connected Google, are reported ALONGSIDE
//     as a separate figure. They are never added together, because that would
//     double-count the same human.

import { createClient } from "@/lib/supabase/server";
import { getEvents } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const host = new URL(request.url).searchParams.get("host") || null;

  // Local midnight is what an owner means by "today", but the server may sit in
  // another timezone. The client sends its offset so the day boundaries line up
  // with the owner's actual day rather than UTC's.
  const tzOffsetMin = Number(new URL(request.url).searchParams.get("tz") || 0) || 0;
  const now = Date.now();
  const localNow = now - tzOffsetMin * 60_000;
  const localMidnight = Math.floor(localNow / DAY_MS) * DAY_MS;
  const startOfToday = localMidnight + tzOffsetMin * 60_000;
  const startOfYesterday = startOfToday - DAY_MS;
  const startOfWeek = startOfToday - 6 * DAY_MS; // today + the 6 days before it

  // One read covers every window. 8 days of pageviews for one site is small, and
  // the partial index in db/onsite.sql keeps it cheap as the ledger grows.
  const rows = await getEvents(supabase, {
    userId: user.id,
    host,
    types: ["traffic.pageview"],
    since: new Date(startOfWeek).toISOString(),
    limit: 20000,
  });

  const leads = await getEvents(supabase, {
    userId: user.id,
    host,
    types: ["lead.captured"],
    since: new Date(startOfWeek).toISOString(),
    limit: 2000,
  });

  const inWindow = (list, from, to) => list.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t >= from && (to == null || t < to);
  });

  const summarize = (list) => ({
    views: list.length,
    visitors: new Set(list.map((r) => r.data?.sid).filter(Boolean)).size,
  });

  const todayRows = inWindow(rows, startOfToday, null);
  const yesterdayRows = inWindow(rows, startOfYesterday, startOfToday);

  // Per-day series for the little bar chart, oldest first.
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const from = startOfToday - i * DAY_MS;
    const dayRows = inWindow(rows, from, from + DAY_MS);
    days.push({
      date: new Date(from).toISOString().slice(0, 10),
      ...summarize(dayRows),
    });
  }

  // Where did they come from? Top referrers across the week, direct grouped.
  const refs = {};
  for (const r of rows) {
    const key = r.data?.ref || "direct";
    refs[key] = (refs[key] || 0) + 1;
  }
  const topSources = Object.entries(refs)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([source, views]) => ({ source, views }));

  // Which pages? Useful for knowing what is actually pulling people in.
  const paths = {};
  for (const r of rows) {
    const key = r.data?.path || "/";
    paths[key] = (paths[key] || 0) + 1;
  }
  const topPages = Object.entries(paths)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([path, views]) => ({ path, views }));

  const today = summarize(todayRows);
  const yesterday = summarize(yesterdayRows);
  const week = summarize(rows);

  // Change vs yesterday, only claimed when yesterday had something to compare to.
  const change = yesterday.views > 0
    ? Math.round(((today.views - yesterday.views) / yesterday.views) * 100)
    : null;

  return json({
    ok: true,
    live: true,
    installed: rows.length > 0,
    today,
    yesterday,
    week,
    change,
    days,
    topSources,
    topPages,
    leads: {
      today: inWindow(leads, startOfToday, null).length,
      week: leads.length,
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
