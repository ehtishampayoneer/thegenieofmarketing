// app/api/selftest/route.js
// GET               -> the list of checks (id, group, label)
// POST { check }    -> run ONE check for the signed-in owner, with the real keys.
//
// One check per request on purpose: each gets its own time limit, the page shows
// results as they land, and a slow Google API cannot time out the whole test.

import { createClient } from "@/lib/supabase/server";
import { CHECKS, CHECK_INDEX, loadContext } from "@/lib/selftest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  // Which account is being tested. Owners often have more than one login, and a
  // test run on the empty one reports "no scan" for a business that is set up.
  let business = null;
  try {
    const { data } = await supabase.from("scans").select("final_url, url, ai").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) business = data.ai?.businessName || data.final_url || data.url;
  } catch {}
  return json({ ok: true, account: user.email || user.id, business, checks: CHECKS.map(({ id, group, label }) => ({ id, group, label })) });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body = {};
  try { body = await request.json(); } catch {}
  const check = CHECK_INDEX[body?.check];
  if (!check) return json({ ok: false, error: "Unknown check." }, 400);

  const origin = new URL(request.url).origin;
  const started = Date.now();
  let result;
  let timer;
  try {
    const ctx = await loadContext(supabase, user.id);
    result = await Promise.race([
      check.run(ctx, { origin, sendTestEmail: body?.sendTestEmail === true }),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ status: "fail", summary: "Took longer than 105 seconds.", fix: "Run it again. If it keeps timing out, that service is too slow from the server." }), 105000); }),
    ]);
    clearTimeout(timer);
  } catch (e) {
    clearTimeout(timer);
    // A crash is a finding too: it is exactly the kind of bug this page exists for.
    result = { status: "fail", summary: `The check crashed: ${String(e?.message || e).slice(0, 240)}`, fix: "Send this report to your developer.", details: String(e?.stack || "").split("\n").slice(0, 4) };
  }
  return json({ ok: true, id: check.id, ms: Date.now() - started, ...result });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
