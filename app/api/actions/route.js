// app/api/actions/route.js
// The actions spine. Every generated item Genie can DO lives here with a
// lifecycle. This is what F2 (approval/safety) and F3 (execution) build on.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set([
  "proposed", "approved", "executing", "done", "failed", "rolled_back", "dismissed",
]);

// List the user's actions (optionally filtered by status).
export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const status = new URL(request.url).searchParams.get("status");
  let q = supabase
    .from("actions")
    .select("id, type, title, status, priority, payload, target, created_at, scan_id")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, actions: data });
}

// Create one or many actions (status defaults to 'proposed').
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const incoming = Array.isArray(body?.actions) ? body.actions : body?.action ? [body.action] : [];
  if (incoming.length === 0) return json({ ok: false, error: "No actions provided." }, 400);

  const rows = incoming.map((a) => ({
    user_id: user.id,
    scan_id: a.scanId || a.scan_id || null,
    type: a.type,
    title: a.title || null,
    payload: a.payload || null,
    target: a.target || null,
    status: "proposed",
  }));

  const { data, error } = await supabase.from("actions").insert(rows).select("id");
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, ids: data.map((r) => r.id) });
}

// Update an action's status (approve / dismiss now; execute later in F3).
export async function PATCH(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const { id, status } = body || {};
  if (!id || !ALLOWED_STATUS.has(status)) {
    return json({ ok: false, error: "Missing id or invalid status." }, 400);
  }

  const { error } = await supabase
    .from("actions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return json({ ok: false, error: error.message }, 500);

  // G6 signal capture: log the transition as an outcome event (best-effort).
  try {
    await supabase.from("action_outcomes").insert({
      action_id: id,
      user_id: user.id,
      event: status, // 'approved' | 'dismissed' | 'executed' | ...
      meta: body.meta || null,
    });
  } catch {}

  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
