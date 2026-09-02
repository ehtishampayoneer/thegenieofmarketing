// app/api/px/view/route.js
// ── THE PAGEVIEW BEACON ──
// Counts real visits to the owner's OWN website, so "traffic today" is a
// first-party number Genie measured itself rather than an estimate, and works
// on day one with no Google Analytics connection.
//
// Companion to /api/px/conversion: that one fires when a sale happens, this one
// fires when a person arrives. Same signed token, same entity resolution, so
// visits, leads and revenue all attach to the same business.
//
// Privacy: no cookie, no IP, no personal data. The referrer is reduced to its
// host, the path drops its query string, and the session id is generated in the
// visitor's own tab and dies with it — it exists only to tell one person's five
// pages apart from five different people.

import { createAdminClient } from "@/lib/supabase/admin";
import { recordEvent } from "@/lib/events";
import { userFromToken, resolveHost, limited, refHost, safePath, corsJson, CORS } from "@/lib/onsite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF, for the no-JS <img> fallback.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

async function ingest({ k, url, referrer, sid }) {
  const userId = userFromToken(k);
  if (!userId) return 401;
  // A busy site legitimately fires a lot of these, so the ceiling is high — but
  // it is still a ceiling, so a render loop on someone's page cannot flood us.
  if (limited(k, { max: 240 })) return 429;

  let admin;
  try { admin = createAdminClient(); } catch { return 500; }

  const host = await resolveHost(admin, userId, url);

  try {
    await recordEvent(admin, {
      userId,
      host,
      type: "traffic.pageview",
      actor: "system",
      subject: safePath(url),
      data: {
        path: safePath(url),
        ref: refHost(referrer),
        // Tab-scoped id from the visitor's browser. Used only to count people
        // rather than page-loads. Truncated so it can never carry a payload.
        sid: sid ? String(sid).slice(0, 40) : null,
        source: "onsite",
      },
    });
  } catch { return 500; }
  return 200;
}

export async function POST(request) {
  // sendBeacon delivers a Blob, fetch delivers JSON; accept either, and fall
  // back to query params so the beacon works in every browser.
  let body = {};
  try { body = await request.json(); }
  catch { try { body = JSON.parse(await request.text()); } catch {} }
  const q = new URL(request.url).searchParams;
  const status = await ingest({
    k: body.k || q.get("k"),
    url: body.url || q.get("url"),
    referrer: body.referrer || q.get("r"),
    sid: body.sid || q.get("s"),
  });
  return corsJson({ ok: status === 200 }, status);
}

// Image-beacon fallback. Always returns the pixel, even on error, so a Genie
// problem can never break the customer's page.
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  try {
    await ingest({ k: q.get("k"), url: q.get("url"), referrer: q.get("r"), sid: q.get("s") });
  } catch {}
  return new Response(GIF, {
    status: 200,
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate", Pragma: "no-cache" },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
