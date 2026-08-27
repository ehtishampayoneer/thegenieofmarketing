// app/go/route.js
// ── CLICK TRACKING REDIRECT ──
// The conversion CTA on a hosted Genie Page points here (/go?a=<actionId>) instead of
// straight at the business. We record the click on the event ledger (attributed to the
// page's owner) and 302 to the business's own site, UTM-tagged so a later sale traces
// back. The destination is reconstructed server-side from the action's own host — the
// query never carries a URL — so this can't be abused as an open redirect. Best-effort:
// if anything is off, it still redirects somewhere safe rather than erroring.

import { createAdminClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/events";
import { taggedLink } from "@/lib/attribution";
import { appBase } from "@/lib/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const home = appBase();
  let a = "";
  try { a = new URL(request.url).searchParams.get("a") || ""; } catch {}
  // Action ids are UUIDs — reject anything else rather than looking it up.
  if (!/^[0-9a-f-]{10,40}$/i.test(a)) return redirect(home);

  try {
    const admin = createAdminClient();
    const { data: action } = await admin.from("actions").select("user_id, target, payload").eq("id", a).maybeSingle();
    const host = action?.target?.host;
    if (!action || !host) return redirect(home);

    const dest = taggedLink(`https://${host}`, { channel: "genie_pages", campaign: "genie", ref: a });
    // Record the click (never blocks the redirect).
    recordEvent(admin, {
      userId: action.user_id, host, type: "click.recorded", actor: "visitor", subject: host,
      data: { actionId: a, keyword: action.payload?.targetKeyword || null, title: action.payload?.title || null },
    }).catch(() => {});
    return redirect(dest);
  } catch {
    return redirect(home);
  }
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}
