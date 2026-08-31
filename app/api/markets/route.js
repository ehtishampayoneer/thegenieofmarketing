// ── MARKET EXPANSION ── ranks countries this business can genuinely serve where demand is
// real and competition is thin. Backbone = REAL Search Console per-country data (verified);
// the curated model fills the rest (estimated); ineligible/local-only businesses are gated.
// Read-only. Never promises results — projections are labelled as such on the page.

import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { resolveEntity } from "@/lib/growth-memory";
import { ENTITY_TYPES } from "@/lib/entity";
import { getGscCountries } from "@/lib/gsc";
import { getValidAccessToken } from "@/lib/google";
import { scoreMarkets } from "@/lib/markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, reason: "not_authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const profile = {
    serveReach: searchParams.get("reach") || "", // global | regions | local
    languages: (searchParams.get("langs") || "en").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  };

  // host + entity dims
  let host = searchParams.get("host") || null;
  let ai = {};
  try {
    if (!host) {
      const { data: scans } = await supabase.from("scans").select("ai, final_url, url, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
      if (scans?.length) { host = hostOf(scans[0]); ai = scans[0].ai || {}; }
    }
  } catch {}

  let dims = null, audience = "unknown";
  try {
    if (host) {
      const e = await resolveEntity(supabase, user.id, host, ai);
      dims = ENTITY_TYPES[e?.type]?.dims || null;
      audience = dims?.audience || "unknown";
    }
  } catch {}

  // REAL per-country Search Console data (only if the account owns the property)
  let gsc = null;
  try {
    const { data: conn } = await supabase.from("connections").select("*").eq("user_id", user.id).eq("provider", "google").maybeSingle();
    if (conn && host) {
      const token = await getValidAccessToken(supabase, conn);
      if (token) { const gc = await getGscCountries(token, host); if (gc?.available) gsc = gc; }
    }
  } catch {}

  const result = scoreMarkets({ entity: dims ? { dims } : {}, profile, gsc });
  return Response.json({
    ok: true, host: host || null, audience,
    hasGsc: result.hasGsc, localOnly: result.localOnly,
    rows: result.rows,
    generatedAt: new Date().toISOString(),
  });
}
