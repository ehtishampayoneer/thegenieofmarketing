// app/api/diagnostics/route.js
// ── INTERNAL ENGINE CONSOLE (dev) ──
// One honest snapshot of what the engine is actually doing: which providers are
// configured, whether the database is reachable, how much each engine has
// produced for this account, and the most recent activity. Everything is real —
// counts come straight from the tables; API status from env presence. Auth-gated.

import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MANIFEST } from "@/lib/schema-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const has = (k) => !!(process.env[k] && String(process.env[k]).trim());

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const uid = user.id;

  // Real counts per table (best-effort; a missing table/column → null = unknown).
  const tables = ["scans", "keywords", "actions", "placements", "events", "activity", "growth_memory"];
  const counts = {};
  let dbOk = false;
  for (const t of tables) {
    try {
      const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true }).eq("user_id", uid);
      if (error) throw error;
      counts[t] = count ?? 0;
      dbOk = true; // at least one table answered
    } catch { counts[t] = null; }
  }

  // ── SCHEMA HEALTH ──
  // The database is edited by hand (db/setup.sql pasted into Supabase), so it can
  // silently fall behind the code — which is exactly how a saved Google connection
  // read back as "disconnected" for days. Rather than a migration framework for a
  // single database, check what the code actually NEEDS and name what's missing.
  const schema = { ok: true, missing: [] };
  const need = [
    { kind: "table", name: "keyword_usage", probe: () => supabase.from("keyword_usage").select("id").limit(1), why: "the keyword → content trail" },
    { kind: "column", name: "connections.meta", probe: () => supabase.from("connections").select("meta").limit(1), why: "Google/GA4 connection state" },
    { kind: "column", name: "connections.gsc_site", probe: () => supabase.from("connections").select("gsc_site").limit(1), why: "Search Console site binding" },
    { kind: "column", name: "keywords.source", probe: () => supabase.from("keywords").select("source").limit(1), why: "AI-search targets + rebuild" },
    { kind: "column", name: "keywords.ai_cited", probe: () => supabase.from("keywords").select("ai_cited").limit(1), why: "per-keyword AI-citation status" },
    { kind: "column", name: "keywords.volume", probe: () => supabase.from("keywords").select("volume").limit(1), why: "real search volume" },
    { kind: "table", name: "keyword_history", probe: () => supabase.from("keyword_history").select("keyword").limit(1), why: "the rank-climb chart" },
  ];
  for (const n of need) {
    try {
      const { error } = await n.probe();
      if (error) throw error;
    } catch {
      schema.ok = false;
      schema.missing.push({ kind: n.kind, name: n.name, why: n.why });
    }
  }
  try {
    const { error } = await supabase.rpc("increment_keyword_coverage", { p_user: uid, p_host: "__schema_check__", p_keyword: "__schema_check__" });
    if (error) throw error;
  } catch {
    schema.ok = false;
    schema.missing.push({ kind: "function", name: "increment_keyword_coverage", why: "coverage counts that can't be lost" });
  }
  // Everything else the code reads, generated from the code (lib/schema-manifest.js).
  // One probe per table with all its columns; only when that fails, one per column
  // to name exactly which is missing. `limit(0)` reads no rows, just the shape.
  const known = new Set(schema.missing.map((m) => m.name));
  // Plus columns that are only ever WRITTEN, which the generator cannot see from
  // selects: saving a Google connection writes these, and fails without them.
  const writeOnly = { scans: ["page_text"], connections: ["token_expires_at", "updated_at", "scopes", "google_email"] };
  const manifest = { ...SCHEMA_MANIFEST };
  for (const [t, cols] of Object.entries(writeOnly)) manifest[t] = [...new Set([...(manifest[t] || []), ...cols])];
  for (const [table, cols] of Object.entries(manifest)) {
    const list = cols.length ? cols.join(",") : "*";
    const { error } = await supabase.from(table).select(list).limit(0);
    if (!error) continue;
    const { error: tableErr } = await supabase.from(table).select("*").limit(0);
    if (tableErr) {
      if (!known.has(table)) { schema.ok = false; schema.missing.push({ kind: "table", name: table, why: "used by the code, not found in the database" }); }
      continue;
    }
    for (const c of cols) {
      const { error: colErr } = await supabase.from(table).select(c).limit(0);
      if (colErr && !known.has(`${table}.${c}`)) { schema.ok = false; schema.missing.push({ kind: "column", name: `${table}.${c}`, why: "used by the code, not found in the database" }); }
    }
  }
  if (!schema.ok) schema.fix = "Run db/setup.sql in Supabase → SQL Editor. It only adds what's missing and never deletes data. Anything still listed after that needs its own migration: send this list to your developer.";

  let activity = [];
  try {
    const { data } = await supabase.from("activity").select("verb, message, detail, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(24);
    activity = data || [];
  } catch {}

  const apis = [
    { id: "supabase", label: "Supabase", group: "Core", configured: has("NEXT_PUBLIC_SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY") },
    { id: "gemini", label: "Gemini", group: "AI models", configured: has("GEMINI_API_KEY") },
    { id: "groq", label: "Groq", group: "AI models", configured: has("GROQ_API_KEY") },
    { id: "openrouter", label: "OpenRouter", group: "AI models", configured: has("OPENROUTER_API_KEY") },
    { id: "claude", label: "Claude (paid fallback)", group: "AI models", configured: has("PAID_LLM_API_KEY") },
    { id: "google", label: "Google Search Console", group: "Integrations", configured: has("GOOGLE_CONNECT_CLIENT_ID") && has("GOOGLE_CONNECT_CLIENT_SECRET") },
    { id: "x", label: "X / Twitter", group: "Integrations", configured: has("X_CLIENT_ID") && has("X_CLIENT_SECRET") },
    { id: "resend", label: "Resend (email)", group: "Integrations", configured: has("RESEND_API_KEY") },
    { id: "serpapi", label: "SerpAPI (search data)", group: "Data", configured: has("SERPAPI_KEY") },
    { id: "pagespeed", label: "PageSpeed", group: "Data", configured: has("PAGESPEED_API_KEY") || has("GOOGLE_API_KEY") },
    { id: "qstash", label: "QStash (queue)", group: "Infra", configured: has("QSTASH_TOKEN") },
    { id: "cron", label: "Cron secret", group: "Infra", configured: has("CRON_SECRET") },
    { id: "webhook", label: "Revenue webhook", group: "Infra", configured: has("WEBHOOK_SECRET") },
  ];

  // Engines: "ready" if their surface is reachable; count = what they've produced.
  const engines = [
    { id: "audit", label: "Website Audit", ready: counts.scans != null, count: counts.scans, unit: "scans" },
    { id: "entity", label: "Entity Detection", ready: dbOk, count: null },
    { id: "keywords", label: "Keyword Engine", ready: counts.keywords != null, count: counts.keywords, unit: "keywords" },
    { id: "intent", label: "Buyer Intent Engine", ready: counts.placements != null, count: counts.placements, unit: "openings" },
    { id: "aisearch", label: "AI Search Engine", ready: dbOk, count: null },
    { id: "content", label: "Content / Outreach Engine", ready: counts.actions != null, count: counts.actions, unit: "actions" },
    { id: "learning", label: "Learning Engine", ready: counts.growth_memory != null, count: counts.growth_memory, unit: "learnings" },
    { id: "impact", label: "Impact Engine", ready: counts.events != null, count: counts.events, unit: "events" },
    { id: "activity", label: "Activity Stream", ready: counts.activity != null, count: counts.activity, unit: "logged" },
    { id: "database", label: "Database", ready: dbOk, count: null },
  ];

  return json({ ok: true, generatedAt: new Date().toISOString(), db: { ok: dbOk }, schema, counts, apis, engines, activity });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
