// lib/gmail.js
// ── SEND AS THE USER, VIA THEIR OWN GMAIL ──
// When the user connects Google with the gmail.send scope, outreach goes out from
// THEIR real Gmail address (best deliverability, genuinely "from them"). Reuses the
// stored Google connection token. Best-effort; the caller falls back to the
// platform sender if this isn't available.

import { getValidAccessToken } from "@/lib/google";

// Build a raw RFC-822 message and base64url-encode it (what Gmail's API wants).
function buildRaw({ from, to, subject, html, replyTo }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean).join("\r\n");
  const msg = `${headers}\r\n\r\n${html}`;
  return Buffer.from(msg, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns { ok, id } | { ok:false, error, needsConnection }.
// gmailConn is the user's Google connection row (must include the gmail.send scope).
export async function sendViaGmail(supabase, gmailConn, { fromName, fromEmail, to, subject, html, replyTo }) {
  try {
    if (!gmailConn) return { ok: false, needsConnection: true, error: "Google not connected" };
    const scope = String(gmailConn.scope || "");
    if (!scope.includes("gmail.send")) return { ok: false, needsConnection: true, error: "Gmail permission not granted — reconnect Google" };
    const token = await getValidAccessToken(supabase, gmailConn);
    if (!token) return { ok: false, needsConnection: true, error: "Couldn't get Gmail access" };

    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
    const raw = buildRaw({ from, to, subject, html, replyTo });
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, error: `gmail_${res.status}: ${(await res.text()).slice(0, 160)}` };
    const j = await res.json().catch(() => ({}));
    return { ok: true, id: j.id || null };
  } catch (e) { return { ok: false, error: e?.message || "gmail_send_failed" }; }
}

// The Gmail address the user connected (from their profile/connection meta).
export async function gmailAddress(gmailConn) {
  return gmailConn?.account_email || gmailConn?.meta?.email || null;
}
