// app/api/diagnostics/reset/route.js
// ── FACTORY RESET (dev, self-scoped) ──
// Wipes THIS account's generated data so you can test Marketing Genie exactly
// like a brand-new user. Deletes only rows owned by the caller (eq user_id) from
// the content/engine tables — never touches auth, profile identity, or OAuth
// connections. Also flips onboarding_completed back to false so the first-run
// experience plays again. Auth-gated; POST only.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generated data only. Real connections/integrations are intentionally preserved.
const TABLES = ["placements", "actions", "keywords", "growth_memory", "events", "activity", "scans"];

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

  try { await supabase.from("profiles").update({ onboarding_completed: false }).eq("id", uid); } catch {}

  return json({ ok: true, deleted, message: "Your account is reset. Head to /welcome to run your first scan." });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
