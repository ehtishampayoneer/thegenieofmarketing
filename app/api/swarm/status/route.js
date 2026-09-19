// app/api/swarm/status/route.js
// What the three teams have done, for the team page. Every number is counted
// from real records, never estimated:
//   testers   - swarm.tested events: items tested, and people who reacted (1,000 each)
//   improvers - complaints turned into tickets, and items the improvers made better
//   doers     - Genie's real work, from the activity log every engine writes to
// Plus a live line per team (the latest thing it did) and what is still waiting.

import { createClient } from "@/lib/supabase/server";
import { getEvents } from "@/lib/events";
import { pendingItems } from "@/lib/swarm/engine";
import { freeProvidersReady } from "@/lib/ai-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const day = Date.now() - 864e5;
  const events = await getEvents(supabase, { userId: user.id, types: ["swarm.tested", "swarm.improved"], limit: 3000 });
  // The reality check: how the crowd's predictions compared with real results.
  const cal = (await getEvents(supabase, { userId: user.id, types: ["swarm.calibration"], limit: 1 }))[0] || null;
  const tested = events.filter((e) => e.type === "swarm.tested");
  const improved = events.filter((e) => e.type === "swarm.improved");
  const recent = (xs) => xs.filter((e) => Date.parse(e.created_at) > day);

  let doneAll = 0, done24 = 0, doerFeed = [];
  try {
    const { count } = await supabase.from("activity").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    doneAll = count || 0;
    const { count: c24 } = await supabase.from("activity").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", new Date(day).toISOString());
    done24 = c24 || 0;
    const { data } = await supabase.from("activity").select("message, icon, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(6);
    doerFeed = (data || []).map((a) => ({ text: a.message, at: a.created_at }));
  } catch {}

  let waiting = 0;
  try { waiting = (await pendingItems(supabase, { userId: user.id, limit: 500 })).length; } catch {}

  const reactions = tested.reduce((s, e) => s + (Number(e.data?.size) || 0), 0);
  const tickets = tested.reduce((s, e) => s + (Number(e.data?.tickets) || 0), 0);
  const gain = improved.length ? Math.round(improved.reduce((s, e) => s + ((e.data?.to || 0) - (e.data?.from || 0)), 0) / improved.length) : 0;
  const quick = tested.filter((e) => e.data?.mode === "rules").length;

  return json({
    ok: true,
    ai: freeProvidersReady().length > 0,
    waiting,
    testers: {
      people: reactions, items: tested.length, today: recent(tested).length, quick,
      feed: tested.slice(0, 6).map((e) => ({ text: `${e.subject} · ${e.data?.score ?? "?"}/100${e.data?.mode === "rules" ? " (quick check)" : ""}`, at: e.created_at })),
    },
    improvers: {
      tickets, fixed: improved.length, today: recent(improved).length, gain,
      feed: improved.slice(0, 6).map((e) => ({ text: `${e.subject}: ${e.data?.from} → ${e.data?.to}${e.data?.changed ? ` · ${e.data.changed}` : ""}`, at: e.created_at })),
    },
    doers: { jobs: doneAll, today: done24, feed: doerFeed },
    reality: cal ? { n: cal.data?.n || 0, verdict: cal.data?.lift?.verdict || "learning", text: cal.data?.lift?.text || "", at: cal.created_at } : null,
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
