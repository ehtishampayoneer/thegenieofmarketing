// app/api/subscribe/route.js
// ── EMAIL CAPTURE (owned audience) ──
// A visitor on a published Genie Page opts in; we attribute the lead to the page's
// owner via the service-role admin client and record it on the event ledger (deduped
// per host+email), so the owner builds a list the outreach engine can later re-reach.
// Anonymous + public by design; only a valid email is accepted, nothing else stored.

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedPage } from "@/lib/pages";
import { recordEvent } from "@/lib/events";
import { CORS } from "@/lib/onsite";
import { ipOf, isLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Articles served on the owner's own domain (/b, behind their /blog rewrite)
// post here from that domain, so the endpoint answers cross-origin.
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_request" }, 400); }
  const email = String(body?.email || "").trim().toLowerCase();
  const handle = String(body?.handle || "").trim();
  const slug = String(body?.slug || "").trim();
  const source = String(body?.source || "article").slice(0, 40);
  if (!EMAIL.test(email) || email.length > 200) return json({ ok: false, error: "invalid_email" }, 400);

  // ── A PUBLIC LIST THE OWNER LATER EMAILS FROM THEIR OWN GMAIL ──
  // Every address accepted here joins "People who left their email on your site",
  // and "Send an update" mails that list from the owner's own mailbox. With no
  // limit, a script could fill a customer's list with strangers or spam-trap
  // addresses, and the owner's next update would spend their sending reputation —
  // the one thing the daily ramp exists to protect — on people who never asked.
  // A real person signs up once. The honest fix is double opt-in, which needs a
  // verified sending domain this product does not have yet; this is the speed
  // bump until then, and it says so.
  const ip = ipOf(request);
  if (isLimited(ip, { key: "subscribe", max: 5, windowMs: 60 * 60 * 1000 })
    || isLimited(`${ip}:${handle}`, { key: "subscribe-page", max: 3, windowMs: 60 * 60 * 1000 })) {
    // Answer like a success: a bot learns nothing about the limit, and a real
    // person who somehow hit it is not shown an error on the owner's own site.
    return json({ ok: true });
  }

  try {
    const admin = createAdminClient();
    const page = handle && slug ? await getPublishedPage(admin, handle, slug) : null;
    if (!page?.user_id) return json({ ok: false, error: "unknown_page" }, 404);
    await recordEvent(admin, {
      userId: page.user_id, host: page.host, type: "lead.captured", actor: "visitor",
      subject: email, data: { email, source, handle, slug, title: page.title },
      dedupeKey: `lead:${page.host}:${email}`,
    });
    return json({ ok: true });
  } catch { return json({ ok: false, error: "failed" }, 500); }
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } }); }
