// app/api/business/delete/route.js
// Cleanly removes a business and everything Genie generated for it — so
// deleting a site wipes its scans, tasks, keywords, placements, notifications,
// activity and chat. No orphan tasks lingering with no business behind them.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host } = body || {};

  // Tables keyed by host → delete for this user+host.
  const byHost = ["keywords", "placements", "notifications", "activity", "cadence_plans", "chat_messages"];
  // Actions/scans may not carry host directly the same way — handle below.

  const results = {};
  if (host) {
    for (const t of byHost) {
      try { const { error } = await supabase.from(t).delete().eq("user_id", user.id).eq("host", host); results[t] = error ? error.message : "ok"; } catch (e) { results[t] = "skip"; }
    }
    // Scans: match by final_url/url containing host.
    try { await supabase.from("scans").delete().eq("user_id", user.id).ilike("final_url", `%${host}%`); } catch {}
    try { await supabase.from("scans").delete().eq("user_id", user.id).ilike("url", `%${host}%`); } catch {}
    // Actions: match by scan target host if stored, else clear ones with this host in target.
    try { await supabase.from("actions").delete().eq("user_id", user.id).ilike("target->>host", `%${host}%`); } catch {}
  }

  return json({ ok: true, results });
}

// Nuke EVERYTHING for this user (used when they clear all scans).
export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const tables = ["keywords", "placements", "notifications", "activity", "cadence_plans", "chat_messages", "actions", "scans"];
  for (const t of tables) {
    try { await supabase.from(t).delete().eq("user_id", user.id); } catch {}
  }
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
