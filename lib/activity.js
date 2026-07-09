// lib/activity.js
// Genie's live work log. Every meaningful action he takes gets recorded here,
// so the UI can narrate "Genie is working right now" — making the invisible
// engine visible. Best-effort: logging never blocks or breaks the real work.

export async function logActivity(supabase, userId, entry) {
  if (!supabase || !userId || !entry?.message) return;
  try {
    await supabase.from("activity").insert({
      user_id: userId,
      host: entry.host || null,
      verb: entry.verb || "working",
      icon: entry.icon || VERB_ICON[entry.verb] || "•",
      message: entry.message,
      detail: entry.detail || null,
      meta: entry.meta || null,
    });
  } catch {}
}

// Log several at once (e.g. a radar run produced multiple discoveries).
export async function logActivityBatch(supabase, userId, entries) {
  if (!supabase || !userId || !Array.isArray(entries) || entries.length === 0) return;
  try {
    await supabase.from("activity").insert(
      entries.filter((e) => e?.message).map((e) => ({
        user_id: userId,
        host: e.host || null,
        verb: e.verb || "working",
        icon: e.icon || VERB_ICON[e.verb] || "•",
        message: e.message,
        detail: e.detail || null,
        meta: e.meta || null,
      }))
    );
  } catch {}
}

export const VERB_ICON = {
  scanning: "🔍",
  discovered: "✨",
  writing: "✍️",
  staged: "📋",
  published: "🚀",
  replied: "💬",
  learning: "🧠",
  traction: "📈",
  retired: "🗑️",
  keywords: "🎯",
};
