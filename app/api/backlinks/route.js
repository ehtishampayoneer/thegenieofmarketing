// app/api/backlinks/route.js
// What Genie's outreach actually earned. Reads the link.earned events recorded
// by the nightly scan (lib/backlinks.js).
//
// Honest about scope: these are links found on sites Genie pitched and the owner
// marked as applied. It is NOT a full backlink profile of the domain, and the UI
// says so plainly. A number that quietly overstates itself is worse than none.

import { createClient } from "@/lib/supabase/server";
import { earnedLinks } from "@/lib/backlinks";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let host = new URL(request.url).searchParams.get("host") || null;
  if (!host) {
    try {
      const { data: scan } = await supabase.from("scans").select("final_url, url")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      host = scan ? hostOf(scan) : null;
    } catch {}
  }
  if (!host) return json({ ok: true, live: true, total: 0, links: [], needsScan: true });

  const data = await earnedLinks(supabase, { userId: user.id, host });
  return json({ ok: true, live: true, host, ...data });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
