// app/api/diagnostics/reset/route.js
// ── FACTORY RESET (dev, self-scoped) — TOTAL WIPE ──
// Makes THIS account genuinely brand-new: deletes every row the caller owns
// (eq user_id) across ALL data tables, INCLUDING connected accounts (Google / X /
// WordPress) and history, and flips onboarding_completed back to false so the
// first-run experience replays. Only the auth login and the profile row survive.
// Auth-gated; POST only. Cannot be undone.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every user-scoped table. `profiles` is intentionally excluded (only its
// onboarding flag is reset, below) so the login itself survives.
const TABLES = [
  "action_outcomes", "actions", "activity", "cadence_plans", "chat_messages",
  "connections", "decisions", "directory_contacts", "entities", "events",
  "growth_memory", "keyword_history", "keywords", "links", "notifications",
  "outreach_log", "placements", "safety_settings", "scans", "suppressions",
];

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const uid = user.id;

  const deleted = {};
  for (const t of TABLES) {
    try {
      const { error } = await supabase.from(t).delete().eq("user_id", uid);
      deleted[t] = error ? `error: ${error.message}` : "cleared";
    } catch (e) { deleted[t] = `error: ${e.message || "failed"}`; }
  }

  // Clear the business info too (but keep the row so the login survives), and
  // replay onboarding. This makes it genuinely brand-new for the project.
  try {
    await supabase.from("profiles").update({
      onboarding_completed: false, setup_completed: false,
      company_name: null, company_pitch: null, company_website: null,
      company_phone: null, company_address: null,
      sender_name: null, sender_email: null, logo_url: null,
    }).eq("id", uid);
  } catch {}

  return json({ ok: true, deleted, message: "Your account is reset. Head to /welcome to run your first scan." });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
