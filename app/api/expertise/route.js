// app/api/expertise/route.js
// ── FIRST-PARTY FACTS (real Information Gain) ──
// The honest fix for "AI content only claims to be original": capture the business's
// OWN data, signature process, proof/results, and expert take — the things an AI can't
// invent — and store them so the content engine weaves them into every article. This
// is what turns "not obviously AI" into "genuinely worth citing". Stored per business
// in growth_memory (mkey "first_party"); the content engine reads it.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = ["data", "process", "proof", "take"];
const MKEY = "first_party";

async function hostFor(supabase, userId, hint) {
  if (hint) return hint;
  try {
    const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ? hostOf(data) : null;
  } catch { return null; }
}

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const host = await hostFor(supabase, user.id, new URL(request.url).searchParams.get("host"));
  let facts = {};
  try {
    let q = supabase.from("growth_memory").select("meta").eq("user_id", user.id).eq("mkey", MKEY);
    if (host) q = q.eq("host", host);
    const { data } = await q.limit(1).maybeSingle();
    facts = data?.meta || {};
  } catch {}
  return json({ ok: true, host, facts: pick(facts) });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  const host = await hostFor(supabase, userId, body?.host);
  if (!host) return json({ ok: false, error: "Run your first scan so Genie knows which business these facts belong to." }, 400);

  const facts = pick(body?.facts || body || {});
  const filled = FIELDS.filter((f) => facts[f]).length;
  const insight = filled
    ? `First-party facts on file (${filled}/4) — weave the business's real data, process, proof and expert take into content for genuine information gain.`
    : "No first-party facts provided yet.";
  try {
    await supabase.from("growth_memory").upsert(
      { user_id: userId, host, mkey: MKEY, insight, weight: 3, meta: { ...facts, updatedAt: new Date().toISOString() } },
      { onConflict: "user_id,host,mkey" }
    );
  } catch (e) {
    return json({ ok: false, error: "Couldn't save right now. If this persists, the database may need db/setup.sql run." }, 500);
  }
  return json({ ok: true, host, facts, filled, message: filled ? `Saved. Genie will weave these into your content (${filled}/4 fields).` : "Saved." });
}

function pick(o) {
  const out = {};
  for (const f of FIELDS) { const v = o?.[f]; if (typeof v === "string" && v.trim()) out[f] = v.trim().slice(0, 600); }
  return out;
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
