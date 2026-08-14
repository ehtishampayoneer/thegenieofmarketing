// app/api/subscribe/route.js
// ── EMAIL CAPTURE (owned audience) ──
// A visitor on a published Genie Page opts in; we attribute the lead to the page's
// owner via the service-role admin client and record it on the event ledger (deduped
// per host+email), so the owner builds a list the outreach engine can later re-reach.
// Anonymous + public by design; only a valid email is accepted, nothing else stored.

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedPage } from "@/lib/pages";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_request" }, 400); }
  const email = String(body?.email || "").trim().toLowerCase();
  const handle = String(body?.handle || "").trim();
  const slug = String(body?.slug || "").trim();
  const source = String(body?.source || "article").slice(0, 40);
  if (!EMAIL.test(email) || email.length > 200) return json({ ok: false, error: "invalid_email" }, 400);

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

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
