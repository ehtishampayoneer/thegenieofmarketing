// lib/growth-memory.js
// ── GROWTH MEMORY + DECISION LEDGER ──
// The "employee brain". One substrate every capability reads and writes so that:
//   • Genie ADAPTS      — resolveEntity() gives the entity + adaptive playbook
//   • Genie LEARNS       — recordLearning() / getBrief() compound outcomes over time
//   • Genie EXPLAINS     — recordDecision() logs choice + rationale for every action
//   • Capabilities COMPOUND — buyer-intent, AEO, content, outreach all share it
//
// Every function is BEST-EFFORT and never throws (mirrors lib/activity.js): if the
// tables don't exist yet, callers degrade gracefully instead of breaking. Run
// db/growth-memory.sql in Supabase to enable persistence.

import { classifyEntity, derivePlaybook, entityBriefing, ENTITY_TYPES } from "@/lib/entity";
import { recordEvent } from "@/lib/events";

// Resolve (and remember) what Genie is growing. Returns a full entity object
// { type, label, dims, playbook, confidence, source } — always, even offline.
export async function resolveEntity(supabase, userId, host, ai = {}, override = null) {
  const classified = classifyEntity(ai, override);
  if (!supabase || !userId || !host) return classified;

  try {
    // Stored preference wins unless the caller explicitly overrides.
    if (!override) {
      const { data: row } = await supabase
        .from("entities")
        .select("*")
        .eq("user_id", userId)
        .eq("host", host)
        .maybeSingle();
      if (row?.type && ENTITY_TYPES[row.type]) {
        const dims = row.dims || ENTITY_TYPES[row.type].dims;
        return {
          type: row.type,
          label: ENTITY_TYPES[row.type].label,
          group: ENTITY_TYPES[row.type].group,
          dims,
          playbook: derivePlaybook(dims),
          confidence: row.confidence ?? 1,
          source: row.source || "stored",
          name: row.name || ai.businessName || host,
        };
      }
    }
    // Persist the classification (or override) so it sticks and can be corrected.
    await supabase.from("entities").upsert(
      {
        user_id: userId,
        host,
        type: classified.type,
        dims: classified.dims,
        name: ai.businessName || host,
        confidence: classified.confidence,
        source: override ? "user" : classified.source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,host" }
    );
  } catch {
    // table missing / RLS / offline — fall through to the in-memory classification
  }
  return { ...classified, name: ai.businessName || host };
}

// Log a decision Genie made, with its reasoning. Returns the row id (or null).
// kind e.g. "channel_pick" | "radar_pick" | "content_topic" | "outreach" | "aeo_gap"
export async function recordDecision(supabase, { userId, host, kind, choice, rationale, confidence = null, meta = null }) {
  if (!supabase || !userId || !kind) return null;
  try {
    const { data } = await supabase
      .from("decisions")
      .insert({ user_id: userId, host: host || null, kind, choice: choice || null, rationale: rationale || null, confidence, meta })
      .select("id")
      .maybeSingle();
    recordEvent(supabase, { userId, host: host || null, type: `decision.${kind}`, actor: "genie", subject: choice || null, data: { rationale, confidence, ...(meta || {}) } }).catch(() => {});
    return data?.id || null;
  } catch {
    return null;
  }
}

// Close the loop: attach the real outcome of a past decision so Genie can learn.
export async function recordOutcome(supabase, { decisionId, outcome, metrics = null }) {
  if (!supabase || !decisionId) return;
  try {
    await supabase
      .from("decisions")
      .update({ outcome: outcome || null, metrics, resolved_at: new Date().toISOString() })
      .eq("id", decisionId);
    recordEvent(supabase, { type: "outcome.recorded", actor: "genie", subject: String(decisionId), data: { outcome, metrics } }).catch(() => {});
  } catch {}
}

// Persist a durable learning about this entity (upsert by key so it strengthens
// rather than duplicates). weight lets winners accumulate influence.
export async function recordLearning(supabase, { userId, host, key, insight, weight = 1, meta = null }) {
  if (!supabase || !userId || !key || !insight) return;
  try {
    await supabase.from("growth_memory").upsert(
      { user_id: userId, host: host || null, mkey: key, insight, weight, meta, updated_at: new Date().toISOString() },
      { onConflict: "user_id,host,mkey" }
    );
    recordEvent(supabase, { userId, host: host || null, type: "learning.recorded", actor: "genie", subject: key, data: { insight, weight } }).catch(() => {});
  } catch {}
}

// The compounding READ: entity playbook + everything Genie has learned, compiled
// into a compact briefing that gets injected into future AI decisions. This is
// what makes Genie smarter for this entity every day.
export async function getBrief(supabase, userId, host, ai = {}) {
  const entity = await resolveEntity(supabase, userId, host, ai);
  let learnings = [];
  try {
    if (supabase && userId && host) {
      const { data } = await supabase
        .from("growth_memory")
        .select("insight, weight")
        .eq("user_id", userId)
        .eq("host", host)
        .order("weight", { ascending: false })
        .limit(8);
      learnings = (data || []).map((r) => r.insight);
    }
  } catch {}

  const parts = [entityBriefing(entity)];
  if (learnings.length) {
    parts.push("\nWhat Genie has already learned about this entity (apply it):");
    parts.push(...learnings.map((l) => `- ${l}`));
  }
  return { entity, learnings, brief: parts.join("\n") };
}
