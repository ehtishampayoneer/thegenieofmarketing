// lib/google-index.js
// ── GOOGLE INDEXING API (fast (re)crawl) ──
// Nudges Google to crawl a new or updated URL right away instead of waiting for it
// to be discovered. Uses the owner's own Google connection (the indexing scope must
// be granted — reconnect Google once to add it), so pages are attributed to their
// verified Search Console property. Best-effort and fully graceful: no connection,
// missing scope, or an API error just means we fall back to normal discovery +
// IndexNow. Never throws.
//
// (Google documents this API for JobPosting/BroadcastEvent; in practice it is widely
//  used by SEO tools to accelerate crawl of any owned URL. Treat it as a nudge, not
//  a guarantee.)

import { getValidAccessToken } from "@/lib/google";

export async function pingGoogleIndex(supabase, userId, url, type = "URL_UPDATED") {
  if (!supabase || !userId || !url) return { ok: false, reason: "bad_args" };
  try {
    const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
    if (!conn) return { ok: false, reason: "not_connected" };
    // Skip if we can see the indexing scope wasn't granted (avoids a guaranteed 403).
    if (typeof conn.scope === "string" && conn.scope && !/auth\/indexing/.test(conn.scope)) return { ok: false, reason: "no_scope" };
    const token = await getValidAccessToken(supabase, conn);
    if (!token) return { ok: false, reason: "no_token" };
    const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, type }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    return { ok: true };
  } catch (e) { return { ok: false, reason: "error", error: String(e?.message || e).slice(0, 120) }; }
}
