// lib/keyword-sync.js
// Pulls REAL Google Search Console data and reconciles it with Genie's keyword
// portfolio: updates real clicks/impressions/position, records a daily snapshot
// (for the climbing progress bars), marks keywords DEAD when they stop
// performing, and surfaces NEW high-performing queries to add to the rotation.

import { getGscData } from "@/lib/gsc";
import { getValidAccessToken } from "@/lib/google";

// Returns a summary of what changed. Best-effort; never throws.
export async function syncKeywordsFromGsc(supabase, userId, host) {
  try {
    // 1. Get the user's Google connection + a valid token.
    const { data: conn } = await supabase.from("connections")
      .select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
    if (!conn) return { available: false, reason: "not_connected" };

    const token = await getValidAccessToken(supabase, conn);
    if (!token) return { available: false, reason: "no_token" };

    // 2. Pull real GSC data.
    const gsc = await getGscData(token, host);
    if (!gsc?.available) return { available: false, reason: "no_data" };

    const today = new Date().toISOString().slice(0, 10);
    const byQuery = new Map();
    for (const q of gsc.topQueries || []) byQuery.set(q.query.toLowerCase().trim(), q);

    // 3. Load current keywords.
    const { data: keywords } = await supabase.from("keywords")
      .select("*").eq("user_id", userId).eq("host", host);

    let updated = 0, revived = 0, killed = 0;
    const historyRows = [];

    for (const k of keywords || []) {
      const match = byQuery.get(k.keyword.toLowerCase().trim());
      if (match) {
        // Real data present → update + snapshot + revive if it was dead.
        await supabase.from("keywords").update({
          gsc_clicks: match.clicks,
          gsc_impressions: match.impressions,
          gsc_position: match.position,
          last_synced_at: new Date().toISOString(),
          dead: false,
          health: match.clicks > 0 ? "growing" : k.health,
        }).eq("id", k.id);
        if (k.dead) revived++;
        updated++;
        historyRows.push({
          user_id: userId, host, keyword: k.keyword,
          clicks: match.clicks, impressions: match.impressions, position: match.position, recorded_on: today,
        });
      } else {
        // No GSC data. If it USED to have data and now doesn't → mark dead.
        const hadData = (k.gsc_impressions || 0) > 0 || (k.gsc_clicks || 0) > 0;
        if (hadData && !k.dead) {
          await supabase.from("keywords").update({ dead: true, health: "retired" }).eq("id", k.id);
          killed++;
        }
      }
    }

    // 4. Record daily snapshots (idempotent per day).
    if (historyRows.length) {
      await supabase.from("keyword_history").upsert(historyRows, { onConflict: "user_id,host,keyword,recorded_on", ignoreDuplicates: true });
    }

    // 5. Discover NEW winning queries GSC shows that we're NOT tracking → add them.
    const known = new Set((keywords || []).map((k) => k.keyword.toLowerCase().trim()));
    const fresh = (gsc.topQueries || [])
      .filter((q) => q.clicks > 0 && !known.has(q.query.toLowerCase().trim()))
      .slice(0, 5);
    let added = 0;
    for (const q of fresh) {
      const { error } = await supabase.from("keywords").insert({
        user_id: userId, host, keyword: q.query.toLowerCase().trim(),
        intent: "informational", priority: 2, source: "gsc",
        traffic_potential: Math.min(100, 40 + q.clicks * 2),
        competition: 50, coverage: 0, health: "growing",
        gsc_clicks: q.clicks, gsc_impressions: q.impressions, gsc_position: q.position,
        last_synced_at: new Date().toISOString(),
        rationale: "Real Google traffic — Genie found this bringing you visitors.",
      });
      if (!error) added++;
    }

    return { available: true, updated, added, killed, revived, totalReal: byQuery.size };
  } catch (e) {
    return { available: false, reason: "error" };
  }
}
