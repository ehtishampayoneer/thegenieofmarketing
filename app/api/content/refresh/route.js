// app/api/content/refresh/route.js
// Manual "refresh a stale page" (from Growth) + the programmatic entry the nightly
// loop uses. Produces an improved, expanded version of the stalest published page
// and stages it as a "refresh" approval that republishes in place.

import { resolveRadarUser } from "@/lib/radar-auth";
import { hostOf } from "@/lib/business";
import { refreshStalePage } from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  let { host, pageId, minStaleDays } = body || {};
  if (!host && !pageId) {
    try {
      const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      host = data ? hostOf(data) : null;
    } catch {}
  }

  const r = await refreshStalePage(supabase, { userId, host: host || null, pageId: pageId || null, minStaleDays: Number(minStaleDays) || 0 });
  if (!r.ok) {
    const message = r.reason === "no_stale_page" ? "No published pages to refresh yet. Once articles are live, I keep them fresh automatically."
      : r.reason === "already_queued" ? "A refresh for your stalest page is already waiting in Approvals."
      : r.reason === "ai_failed" || r.reason === "no_output" ? "I couldn’t rewrite it just then. Try again in a moment."
      : "Nothing to refresh right now.";
    return json({ ok: false, reason: r.reason, message }, 200);
  }
  return json({ ok: true, actionId: r.actionId, title: r.title });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
