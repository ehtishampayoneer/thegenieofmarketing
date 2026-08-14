// app/api/media/options/route.js
// ── SWAP-PHOTO OPTIONS ──
// Powers "Swap photo" in the approval editor: a handful of candidate images for a
// post — the business's own site imagery first, then free stock matched to the
// topic. Read-only, best-effort, graceful (empty lists if nothing is found).

import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";
import { harvestSiteImages, pexelsSearch } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const url = new URL(request.url);
  const topic = url.searchParams.get("topic") || "";
  let host = url.searchParams.get("host");
  if (!host) {
    try {
      const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      host = data ? hostOf(data) : null;
    } catch {}
  }

  const [site, stock] = await Promise.all([
    host ? harvestSiteImages(host, { limit: 16 }) : Promise.resolve([]),
    pexelsSearch(topic || "business marketing", { perPage: 8 }),
  ]);

  return json({
    ok: true,
    site: site.map((i) => ({ url: i.url, alt: i.alt })),
    stock: stock.map((s) => ({ url: s.url, alt: s.alt, credit: `${s.photographer} / Pexels` })),
  });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
