// app/api/pillars/route.js
// On-demand "build a topic hub" — lets the user assemble a pillar page now instead of
// waiting for the nightly run. Resolves the signed-in user (or trusted cron), pulls
// host + AI profile from their latest scan, and runs buildPillar (which drops a
// proposed pillar into Approvals). Honest about the "not enough pages yet" case.

import { resolveRadarUser } from "@/lib/radar-auth";
import { hostOf } from "@/lib/business";
import { buildPillar } from "@/lib/pillars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  let host = body?.host || null, ai = body?.ai || null;
  if (!host || !ai) {
    try {
      const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (scan) { host = host || hostOf(scan); ai = ai || scan.ai || null; }
    } catch {}
  }
  if (!host) return json({ ok: false, error: "Run your first scan first — Genie needs to know your business." }, 400);

  const r = await buildPillar(supabase, userId, host, ai || {});
  if (!r.ok) {
    const msg = r.reason === "no_cluster"
      ? "Not enough related pages yet to build a topic hub. Genie needs at least 3 published pages on the same theme — keep publishing and it'll assemble one automatically."
      : "Genie couldn't build the hub just now. Try again in a moment.";
    return json({ ok: false, reason: r.reason, message: msg }, r.reason === "no_cluster" ? 200 : 503);
  }
  return json({ ok: true, theme: r.theme, members: r.members, title: r.title, message: `Built a topic hub on “${r.theme}” linking ${r.members} of your pages. Review it in Approvals.` });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
