// app/api/reset/route.js
// ── START FRESH ──
// After weeks of building and testing, an owner's account carries work that was
// never meant to be their real history. This wipes everything Genie GENERATED so
// the numbers on every page start from a true zero, and keeps the things that
// took real effort to set up or that must never be lost.
//
// GET  -> exactly what would be deleted and what would be kept, with row counts,
//         so the decision is made with real numbers rather than a scary word.
// POST { confirm: "START FRESH" } -> does it, and reports what went.
//
// KEPT, deliberately:
//   connections      the Google, blog and WordPress setup (hard-won; unaffected
//                    by clearing results)
//   profiles         company and sender details
//   safety_settings  the kill switch and autonomy limits
//   suppressions     people who asked never to be emailed again. Deleting these
//                    would email someone who opted out, which is illegal and
//                    exactly the kind of thing a "fresh start" must not undo.
//   directory_contacts  shared across every account, not this owner's to clear.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Everything Genie generated for this owner. Order matters only for readability;
// each is scoped to user_id, so nothing can reach another account.
const WIPE = [
  ["scans", "what Genie learned about your site"],
  ["keywords", "keyword strategy"],
  ["keyword_history", "ranking history"],
  ["keyword_usage", "which keyword each piece targeted"],
  ["actions", "drafts, pitches and listings"],
  ["action_outcomes", "what happened to them"],
  ["placements", "community replies and posts"],
  ["published_pages", "articles Genie published"],
  ["events", "the ledger: crowd tests, links, leads, publishes"],
  ["activity", "the activity feed"],
  ["notifications", "notifications"],
  ["cadence_plans", "posting schedule"],
  ["chat_messages", "your chat with Genie"],
  ["outreach_log", "emails sent and replies"],
  ["growth_memory", "what Genie learned from results"],
  ["decisions", "the decision ledger"],
  ["links", "links earned"],
  ["entities", "your business profile"],
  ["citation_targets", "AI citation targets"],
];

const KEEP = [
  ["connections", "Google, your blog and WordPress stay connected"],
  ["profiles", "company and sender details"],
  ["safety_settings", "kill switch and autonomy limits"],
  ["suppressions", "people who opted out of email (never cleared, by law)"],
];

async function countAll(supabase, userId) {
  const out = {};
  for (const [table] of WIPE) {
    try {
      const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId);
      if (count) out[table] = count;
    } catch {}
  }
  return out;
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const counts = await countAll(supabase, user.id);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return json({
    ok: true, total,
    rows: WIPE.filter(([t]) => counts[t]).map(([t, what]) => ({ table: t, what, n: counts[t] })),
    keep: KEEP.map(([table, what]) => ({ table, what })),
  });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body = {};
  try { body = await request.json(); } catch {}
  // Typed in full, on purpose: this cannot be undone and there is no backup.
  if (String(body?.confirm || "").trim().toUpperCase() !== "START FRESH") {
    return json({ ok: false, error: 'Type START FRESH to confirm.' }, 400);
  }

  const before = await countAll(supabase, user.id);
  const deleted = {}, failed = {};
  for (const [table] of WIPE) {
    try {
      const { error } = await supabase.from(table).delete().eq("user_id", user.id);
      if (error) failed[table] = error.message; else if (before[table]) deleted[table] = before[table];
    } catch (e) { failed[table] = String(e?.message || e).slice(0, 120); }
  }
  return json({
    ok: true,
    deleted, failed,
    total: Object.values(deleted).reduce((a, b) => a + b, 0),
    next: "Scan your website again to start. Your connections and settings are untouched.",
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
