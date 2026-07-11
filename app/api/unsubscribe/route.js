// app/api/unsubscribe/route.js
// One-click unsubscribe (RFC 8058 friendly). Clicked from an email (no session),
// verified by a signed token, honored immediately by adding to the suppression
// list. Also handles POST for List-Unsubscribe-Post one-click.

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsub, addSuppression } from "@/lib/compliance";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(u, e, k) {
  if (!u || !e || !k || !verifyUnsub(u, e, k)) return { ok: false };
  const admin = createAdminClient();
  await addSuppression(admin, u, e, "unsubscribe");
  await recordEvent(admin, { userId: u, type: "suppression.added", actor: "user", subject: String(e).toLowerCase(), data: { reason: "unsubscribe" } });
  return { ok: true };
}

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const r = await handle(p.get("u"), p.get("e"), p.get("k"));
  return html(r.ok
    ? "<h1>You're unsubscribed</h1><p>You won't receive any more emails. Sorry to see you go.</p>"
    : "<h1>Link invalid</h1><p>This unsubscribe link is invalid or expired.</p>", r.ok ? 200 : 400);
}

export async function POST(request) {
  const p = new URL(request.url).searchParams;
  const r = await handle(p.get("u"), p.get("e"), p.get("k"));
  return new Response(null, { status: r.ok ? 200 : 400 });
}

function html(body, status) {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:520px;margin:12vh auto;padding:0 24px;color:#11202E;text-align:center">${body}</body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
