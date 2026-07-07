// app/api/placements/route.js
// Reads placement memory and returns today's "taps" plan (platform blocks with
// counts), and records what the user did (posted / skipped / snoozed) — feeding
// the cadence brain so Genie knows where he acted and when he can act again.

import { createClient } from "@/lib/supabase/server";
import { buildTapPlan, nextEligible } from "@/lib/cadence";

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
  return json({ ok: true, ...plan });
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
    // Advance keyword coverage — this keyword is now seeded in one more place.
    if (placement.keyword) {
      try {
        const { data: kw } = await supabase.from("keywords")
          .select("id, coverage").eq("user_id", user.id)
          .eq("host", placement.host).eq("keyword", placement.keyword).maybeSingle();
        if (kw) await supabase.from("keywords").update({ coverage: (kw.coverage || 0) + 1 }).eq("id", kw.id);
      } catch {}
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
