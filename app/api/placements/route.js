// app/api/placements/route.js
// Reads placement memory and returns today's "taps" plan (platform blocks with
// counts), and records what the user did (posted / skipped / snoozed) — feeding
// the cadence brain so Genie knows where he acted and when he can act again.

import { createClient } from "@/lib/supabase/server";
import { buildTapPlan, nextEligible } from "@/lib/cadence";
import { recordUsage } from "@/lib/keyword-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?host= → today's tap plan (grouped, capped, cooldown-aware)
export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const host = new URL(request.url).searchParams.get("host");

  let q = supabase.from("placements").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500);
  if (host) q = q.eq("host", host);
  const { data } = await q;

  const plan = buildTapPlan(data || []);
  // Results summary: what Genie already posted and how it's performing.
  const postedList = (data || []).filter((p) => p.status === "posted");
  const results = {
    total: postedList.length,
    winning: postedList.filter((p) => p.performance === "winning").length,
    flat: postedList.filter((p) => p.performance === "flat").length,
    dud: postedList.filter((p) => p.performance === "dud").length,
    pending: postedList.filter((p) => !p.performance || p.performance === "pending").length,
    top: postedList
      .filter((p) => p.performance === "winning")
      .sort((a, b) => (b.engagement?.score || 0) - (a.engagement?.score || 0))
      .slice(0, 5)
      .map((p) => ({ title: p.target_title, url: p.target_url, keyword: p.keyword, engagement: p.engagement || null })),
  };
  return json({ ok: true, ...plan, results });
}

// PATCH { id, action } → action: 'posted' | 'skipped' | 'snoozed'
export async function PATCH(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { id, action } = body || {};
  if (!id || !action) return json({ ok: false, error: "Missing id or action." }, 400);

  const { data: placement } = await supabase.from("placements").select("*").eq("id", id).single();
  if (!placement) return json({ ok: false, error: "Not found." }, 404);

  const now = new Date();
  let patch = { updated_at: now.toISOString() };

  if (action === "posted") {
    patch.status = "posted";
    patch.posted_at = now.toISOString();
    patch.next_eligible_at = nextEligible(placement.platform, now);
    // Advance coverage AND record the chain — this keyword is now seeded in one more
    // place, and the user can see the exact reply it went into.
    if (placement.keyword) {
      await recordUsage(supabase, user.id, placement.host, {
        primary: placement.keyword, channel: "reply", refType: "placement", refId: placement.id,
        title: placement.target_title || `${placement.platform} reply`, url: placement.target_url || null, status: "posted",
      });
    }
  } else if (action === "skipped") {
    patch.status = "skipped";
  } else if (action === "snoozed") {
    patch.status = "snoozed";
    const d = new Date(now); d.setDate(d.getDate() + 3); // come back in a few days
    patch.next_eligible_at = d.toISOString();
    patch.status = "ready"; // stays in the pool, just not eligible yet
  } else {
    return json({ ok: false, error: "Unknown action." }, 400);
  }

  const { error } = await supabase.from("placements").update(patch).eq("id", id);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
