// lib/events.js
// ── THE EVENT LEDGER (canonical append-only stream) ──
// Everything meaningful Genie or the user does becomes one typed, immutable event.
// Deliberately tiny: record + read, best-effort (never throws). This single stream
// naturally supports observability, attribution, learning, auditing, replay, and
// idempotency (dedupe_key). The activity/decisions/growth_memory tables remain as
// specialized projections; the app dual-writes here through the central helpers,
// so the whole system is event-sourced with a handful of edits — not a rewrite.

// type: dotted namespace, e.g. "activity.discovered", "decision.aeo_gap",
//       "outcome.recorded", "conversion.recorded", "system.cron.run".
export async function recordEvent(supabase, { userId = null, host = null, type, actor = "genie", subject = null, data = null, dedupeKey = null }) {
  if (!supabase || !type) return null;
  const row = { user_id: userId, host, type, actor, subject, data, dedupe_key: dedupeKey };
  try {
    if (dedupeKey) {
      const { data: d } = await supabase.from("events")
        .upsert(row, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
        .select("id").maybeSingle();
      return d?.id || null;
    }
    const { data: d } = await supabase.from("events").insert(row).select("id").maybeSingle();
    return d?.id || null;
  } catch {
    return null; // table missing / offline — the app keeps working
  }
}

// Read the stream (for observability, health, and future projections).
export async function getEvents(supabase, { userId = null, host = null, types = null, since = null, limit = 200 } = {}) {
  try {
    let q = supabase.from("events").select("type, actor, subject, data, host, created_at").order("created_at", { ascending: false }).limit(limit);
    if (userId) q = q.eq("user_id", userId);
    if (host) q = q.eq("host", host);
    if (Array.isArray(types) && types.length) q = q.in("type", types);
    if (since) q = q.gte("created_at", since);
    const { data } = await q;
    return data || [];
  } catch {
    return [];
  }
}
