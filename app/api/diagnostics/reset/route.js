// app/api/diagnostics/reset/route.js
// ── FACTORY RESET (dev, self-scoped) — TOTAL WIPE ──
// Makes THIS account genuinely brand-new: deletes every row the caller owns
// (eq user_id) across ALL data tables, INCLUDING connected accounts (Google / X /
// WordPress) and history, and flips onboarding_completed back to false so the
// first-run experience replays. Only the auth login and the profile row survive.
// Auth-gated; POST only. Cannot be undone.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every user-scoped table. `profiles` is intentionally excluded (only its
// onboarding flag is reset, below) so the login itself survives.
// Child/reference tables first (keyword_usage, citation_targets, published_pages,
// action_outcomes) so any foreign keys to keywords/actions/scans don't block a
// delete. Keep this in sync with every user-scoped table in the app.
const TABLES = [
  "keyword_usage", "citation_targets", "published_pages", "action_outcomes",
  "actions", "activity", "cadence_plans", "chat_messages",
  "connections", "decisions", "directory_contacts", "entities", "events",
  "growth_memory", "keyword_history", "keywords", "links", "notifications",
  "outreach_log", "placements", "safety_settings", "scans", "suppressions",
];

export async function POST() {
  // Verify the caller with their own session…
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const uid = user.id;

  // …then wipe with the service role so RLS can never silently block a delete.
  // Still strictly scoped to THIS user's rows (eq user_id / id).
  const admin = createAdminClient();

  const deleted = {};
  let hadErrors = false;
  for (const t of TABLES) {
    let ok = false, note = "";
    // Service role first (bypasses RLS).
    try {
      const { error } = await admin.from(t).delete().eq("user_id", uid);
      if (!error) ok = true; else note = `admin: ${error.message}`;
    } catch (e) { note = `admin: ${e.message || "failed"}`; }
    // Fallback: the user's own session — RLS lets a user delete their own rows, so if
    // the service role is misconfigured for a table this still clears it.
    if (!ok) {
      try {
        const { error } = await supabase.from(t).delete().eq("user_id", uid);
        if (!error) ok = true; else note += ` | user: ${error.message}`;
      } catch (e) { note += ` | user: ${e.message || "failed"}`; }
    }
    if (ok) deleted[t] = "cleared";
    else { hadErrors = true; deleted[t] = `error: ${note}`; }
  }

  // Clear the business info too (but keep the row so the login survives), and
  // replay onboarding. This makes it genuinely brand-new for the project.
  try {
    const { error } = await admin.from("profiles").update({
      onboarding_completed: false, setup_completed: false,
      company_name: null, company_pitch: null, company_website: null,
      company_phone: null, company_address: null,
      sender_name: null, sender_email: null, logo_url: null,
    }).eq("id", uid);
    if (error) hadErrors = true;
  } catch { hadErrors = true; }

  return json({ ok: true, hadErrors, deleted, message: "Your account is reset. Head to /welcome to run your first scan." });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
