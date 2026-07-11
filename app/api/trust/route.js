// app/api/trust/route.js
// Read/set the Trust Ramp per entity + channel.
//   GET  ?host=  → the effective level for each channel (earned or overridden)
//   POST { host, channel, level } → the user grants/revokes autonomy on a channel

import { createClient } from "@/lib/supabase/server";
import { getTrustLevel, setTrustLevel, TRUST_LEVELS } from "@/lib/trust";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS = ["blog", "x", "linkedin", "medium", "reddit", "quora", "email"];

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let host = new URL(request.url).searchParams.get("host");
  try {
    if (!host) {
      const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      host = data ? hostOf(data) : null;
    }
  } catch {}

  const channels = {};
  await Promise.all(CHANNELS.map(async (c) => { channels[c] = await getTrustLevel(supabase, { userId: user.id, host, channel: c }); }));

  return json({ ok: true, host, channels, levels: TRUST_LEVELS });
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, channel, level } = body || {};
  if (!channel || !TRUST_LEVELS.includes(level)) return json({ ok: false, error: "channel and a valid level are required." }, 400);

  const okSet = await setTrustLevel(supabase, { userId: user.id, host: host || null, channel, level });
  if (!okSet) return json({ ok: false, error: "Couldn't set trust level." }, 400);
  return json({ ok: true, channel, level });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
