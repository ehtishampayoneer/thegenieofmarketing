// app/l/[id]/route.js
// The tracked redirect. An anonymous visitor hits /l/<id>; we log a click.recorded
// event (funnel: impression → CLICK → conversion) and 302 to the destination.
// Resolved with the service role so anonymous clicks work. Fast and best-effort —
// a logging hiccup never blocks the redirect.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLink } from "@/lib/links";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const admin = createAdminClient();
  const fallback = process.env.APP_URL || new URL(request.url).origin;

  const link = await resolveLink(admin, params.id);
  if (!link?.url) return NextResponse.redirect(fallback, 302);

  recordEvent(admin, {
    userId: link.user_id, host: link.host, type: "click.recorded", actor: "user",
    subject: link.channel || "link", data: { url: link.url, channel: link.channel, ref: link.ref },
  }).catch(() => {});

  return NextResponse.redirect(link.url, 302);
}
