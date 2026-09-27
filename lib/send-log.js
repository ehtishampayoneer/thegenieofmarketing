// lib/send-log.js
// ── AN EMAIL THAT LEFT MUST BE WRITTEN DOWN ──
//
// Five places record a sent email in `outreach_log`, and none of them read the
// result. supabase-js RETURNS its errors rather than throwing them, so a failed
// insert looked exactly like a successful one.
//
// That row is not a history entry. It is what three things count:
//   - sentToday()        the daily sending cap. Miss the row and the cap goes
//                        blind: Genie keeps sending from the owner's own Gmail
//                        past the limit the ramp exists to enforce.
//   - sourceContacts()   the exclusion list. Miss the row and the same stranger
//                        is written to again.
//   - dueFollowUps()     the chase sequence. Miss the row and nobody follows up.
//
// The likeliest cause is not a network blip but a column the code writes that the
// live database does not have yet — a db/*.sql file that was never run. That fails
// every insert, every night, silently, which is the worst case: an uncapped sender.
//
// So: write the full row; if that fails, write only the fields those three
// readers need, which have existed since the table did; and if even that fails,
// say so loudly enough that the self-test goes red.

import { logger } from "@/lib/log";

// What sentToday, sourceContacts and dueFollowUps actually read.
const CORE = ["user_id", "host", "contact_email", "contact_name", "subject", "status", "email_id", "sent_at", "is_followup"];

/**
 * @returns {{ ok: boolean, degraded?: boolean, error?: string }}
 */
export async function logSend(supabase, row, { where = "unknown" } = {}) {
  if (!supabase || !row) return { ok: false, error: "no_client" };
  let first;
  try {
    const { error } = await supabase.from("outreach_log").insert(row);
    if (!error) return { ok: true };
    first = error;
  } catch (e) { first = e; }

  // The full row was refused. Try again with only what the cap and the
  // exclusion list need, so that at worst the owner loses a column of detail
  // rather than the one number that stops over-sending.
  const core = {};
  for (const k of CORE) if (row[k] !== undefined) core[k] = row[k];
  let second;
  try {
    const { error } = await supabase.from("outreach_log").insert(core);
    if (!error) {
      logger.warn("send_log.degraded", { where, error: String(first?.message || first).slice(0, 200) });
      return { ok: true, degraded: true };
    }
    second = error;
  } catch (e) { second = e; }

  // Neither landed. The email has gone and nothing counts it.
  const reason = String(second?.message || second || first?.message || first).slice(0, 300);
  logger.error("send_log.failed", { where, error: reason });
  try {
    const { recordEvent } = await import("@/lib/events");
    await recordEvent(supabase, {
      userId: row.user_id || null, host: row.host || null, type: "system.send_unlogged", actor: "genie",
      subject: row.contact_email || null, data: { where, error: reason },
      dedupeKey: `send-unlogged:${where}:${new Date().toISOString().slice(0, 10)}`,
    });
  } catch {}
  return { ok: false, error: reason };
}
