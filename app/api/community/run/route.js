// app/api/community/run/route.js
// Manual "Find conversations now" — lets the user trigger the Reddit + Quora radars
// on demand instead of waiting for the nightly run. Resolves the signed-in user, pulls
// host + AI profile from their latest scan, then runs both radars internally (with the
// cron header so they auth for this user) and reports how many openings were staged.

import { resolveRadarUser } from "@/lib/radar-auth";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  let host = null, ai = null;
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { host = hostOf(scan); ai = scan.ai || null; }
  } catch {}
  if (!host) return json({ ok: false, error: "Run your first scan first — Genie needs to know your business." }, 400);

  const appUrl = process.env.APP_URL || (() => { try { return new URL(request.url).origin; } catch { return "https://thegenieofmarketing.vercel.app"; } })();
  const cron = process.env.CRON_SECRET || "";
  const callRadar = async (path) => {
    try {
      const r = await fetch(`${appUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-genie-cron": cron },
        body: JSON.stringify({ host, ai, _uid: userId }),
        signal: AbortSignal.timeout(160000),
      });
      return await r.json().catch(() => ({}));
    } catch { return {}; }
  };

  const [reddit, quora] = await Promise.all([
    callRadar("/api/radar/reddit"),
    callRadar("/api/radar/quora"),
  ]);

  const staged = (reddit?.staged || 0) + (quora?.staged || 0);
  return json({
    ok: true,
    staged,
    reddit: { staged: reddit?.staged || 0, message: reddit?.message || null, needsKeywords: !!reddit?.needsKeywords },
    quora: { staged: quora?.staged || 0, message: quora?.message || null },
  });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
