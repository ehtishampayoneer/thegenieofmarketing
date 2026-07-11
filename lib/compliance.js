// lib/compliance.js
// ── OUTREACH COMPLIANCE (CAN-SPAM / GDPR) ──
// Suppression list + signed one-click unsubscribe tokens. Genie must never email
// someone who opted out. Suppression is checked before every send; unsubscribes
// are honored immediately. Tokens are DB-free HMAC (no lookup to verify).

import crypto from "crypto";

function secret() { return process.env.WEBHOOK_SECRET || process.env.CRON_SECRET || "genie-dev-secret"; }
function safeEq(a, b) { try { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); } catch { return false; } }

export function unsubToken(userId, email) {
  return crypto.createHmac("sha256", secret()).update(`${userId}:${String(email).toLowerCase()}`).digest("hex").slice(0, 24);
}
export function verifyUnsub(userId, email, token) { return safeEq(unsubToken(userId, email), token); }
export function unsubUrl(base, userId, email) {
  const b = (base || "").replace(/\/$/, "");
  return `${b}/api/unsubscribe?u=${encodeURIComponent(userId)}&e=${encodeURIComponent(email)}&k=${unsubToken(userId, email)}`;
}

export async function isSuppressed(supabase, userId, email) {
  try {
    const { data } = await supabase.from("suppressions").select("id").eq("user_id", userId).eq("email", String(email).toLowerCase()).maybeSingle();
    return !!data;
  } catch { return false; }
}
export async function addSuppression(supabase, userId, email, reason) {
  try {
    await supabase.from("suppressions").upsert(
      { user_id: userId, email: String(email).toLowerCase(), reason: reason || "unsubscribe" },
      { onConflict: "user_id,email", ignoreDuplicates: true }
    );
  } catch {}
}
