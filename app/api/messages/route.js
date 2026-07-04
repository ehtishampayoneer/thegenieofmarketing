// app/api/messages/route.js
// Per-business Genie chat history. GET loads a business's conversation;
// POST appends a message. Scoped to the user by RLS.

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const host = new URL(request.url).searchParams.get("host");
  if (!host) return json({ ok: true, messages: [] });

  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("user_id", user.id)
    .eq("host", host)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, messages: data || [] });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, role, content } = body || {};
  if (!host || !role || !content) return json({ ok: false, error: "Missing fields." }, 400);

  const { error } = await supabase.from("chat_messages").insert({
    user_id: user.id, host, role, content,
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
