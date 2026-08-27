// app/api/deliverability/route.js
// Runs the email deliverability preflight for the signed-in user. Resolves the domain
// they send from (their connected Gmail address, else a domain they pass in) and checks
// its real SPF/DKIM/DMARC so the UI can warn BEFORE outreach silently lands in spam.

import { createClient } from "@/lib/supabase/server";
import { checkDeliverability } from "@/lib/deliverability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const override = new URL(request.url).searchParams.get("domain");
  let email = override || null;
  if (!email) {
    try {
      const { data: g } = await supabase.from("connections").select("account_email, meta").eq("user_id", user.id).eq("provider", "google").maybeSingle();
      email = g?.account_email || g?.meta?.email || null;
    } catch {}
  }
  if (!email) return json({ ok: true, connected: false, message: "Connect Google to send from your Gmail, then Genie can check your deliverability." });

  const report = await checkDeliverability(email);
  if (!report.ok) return json({ ok: true, connected: true, sendingAs: email, invalid: true, message: "Couldn't read a valid sending domain from your address." });
  return json({ ok: true, connected: true, sendingAs: email, report });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
