// lib/google.js
// Google OAuth + token helpers for the data connection (Search Console, later Analytics).
// Uses Google's REST endpoints directly — no SDK.

import { recordEvent } from "@/lib/events";
import { logActivity } from "@/lib/activity";

const SCOPES = [
  "openid",
  "email",
  // Search Console read AND write: write is what lets Genie add the site as a
  // property for the owner, so they never open Search Console themselves.
  "https://www.googleapis.com/auth/webmasters",
  // Prove the owner owns the site (Genie requests the verification tag, installs
  // it where it can, and asks Google to check) — the other half of that.
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/analytics.readonly",        // GA4 (read) — traffic proof
  "https://www.googleapis.com/auth/adwords",                   // Keyword Planner — real search volume
  "https://www.googleapis.com/auth/gmail.send",                // Send outreach as the user, from their own Gmail
  "https://www.googleapis.com/auth/indexing",                  // Google Indexing API — nudge fast (re)crawl of new/updated pages
  "https://www.googleapis.com/auth/gmail.readonly",            // Read replies so the Genie Inbox can thread them (your own inbox)
];

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CONNECT_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_CONNECT_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // so we get a refresh_token
    prompt: "consent", // force refresh_token every time
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CONNECT_CLIENT_ID,
      client_secret: process.env.GOOGLE_CONNECT_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_CONNECT_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json(); // { access_token, refresh_token, expires_in, scope, id_token }
}

export async function refreshAccessToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CONNECT_CLIENT_ID,
      client_secret: process.env.GOOGLE_CONNECT_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Token refresh failed: ${body}`);
    // Google answers `invalid_grant` when the grant is gone for good: the owner
    // revoked access, changed their password, or — the common one — the OAuth
    // app is still in Testing mode, where Google expires every refresh token
    // after seven days. That is not a blip to retry; it needs a human to
    // reconnect, and until now nothing ever said so.
    err.permanent = /invalid_grant|invalid_client|unauthorized_client/i.test(body);
    throw err;
  }
  return res.json(); // { access_token, expires_in, scope }
}

export async function getGoogleEmail(accessToken) {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

/**
 * Given a stored connection row, return a currently-valid access token,
 * refreshing it (and updating the DB) if it has expired.
 *
 * Thirty-one places call this, and every one of them wraps it in a try/catch
 * that swallows the error, so a dead Google connection used to take rankings,
 * analytics, indexing and outreach with it in complete silence — for weeks.
 * The fix belongs here rather than in thirty-one callers:
 *   • a permanent failure is announced once a day (activity + event), and
 *     returns null, which every caller already treats as "no Google today"
 *   • a transient failure still throws, so it is retried on the next run
 *     instead of being mistaken for a revoked account
 *   • a refresh that works again clears the alarm, so reconnecting is enough
 * @param {object} supabase - a server Supabase client (RLS as the user)
 * @param {object} conn - the connection row
 */
export async function getValidAccessToken(supabase, conn) {
  const now = Date.now();
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  // Still valid (with 60s buffer)?
  if (conn.access_token && exp - 60_000 > now) return conn.access_token;

  if (!conn.refresh_token) return null;

  let refreshed;
  try {
    refreshed = await refreshAccessToken(conn.refresh_token);
  } catch (e) {
    if (!e?.permanent) throw e;          // a blip: let the caller retry later
    await announceBroken(supabase, conn);
    return null;
  }

  const newExpiry = new Date(now + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("connections")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);
  await announceFixed(supabase, conn);
  return refreshed.access_token;
}

// ── SAYING SO ───────────────────────────────────────────────────────────────
// Deduped to one telling per connection per day: the nightly run touches Google
// from a dozen places, and an owner does not need a dozen identical alarms.
const PROVIDER_LABEL = { google: "Google", wordpress: "WordPress" };

async function announceBroken(supabase, conn) {
  const userId = conn.user_id;
  if (!userId) return;
  const label = PROVIDER_LABEL[conn.provider] || conn.provider || "A connection";
  const day = new Date().toISOString().slice(0, 10);
  try {
    const id = await recordEvent(supabase, {
      userId, type: "connection.broken", actor: "genie", subject: label,
      data: { provider: conn.provider, at: new Date().toISOString() },
      dedupeKey: `conn-broken:${conn.provider}:${day}`,
    });
    // recordEvent returns null when the dedupe key already exists today, which
    // is how the activity line stays at one a day too.
    if (!id) return;
    await logActivity(supabase, userId, {
      verb: "connected", icon: "⚠️",
      message: `${label} disconnected — reconnect it to keep your rankings and sending working`,
      detail: label === "Google"
        ? "Google ended the connection. Until you reconnect, Genie cannot read your real rankings, run analytics, ask for indexing, or send outreach from your address — it will not guess or send from a shared sender instead."
        : "Genie could not use this connection. Reconnect it on the Connections page.",
      meta: { provider: conn.provider, action: "reconnect" },
    });
  } catch {}
}

async function announceFixed(supabase, conn) {
  const userId = conn.user_id;
  if (!userId) return;
  try {
    // Only worth saying if it had actually been broken.
    const { data } = await supabase.from("events").select("id")
      .eq("user_id", userId).eq("type", "connection.broken")
      .order("created_at", { ascending: false }).limit(1);
    if (!data?.length) return;
    const { data: fixed } = await supabase.from("events").select("id, created_at")
      .eq("user_id", userId).eq("type", "connection.restored")
      .order("created_at", { ascending: false }).limit(1);
    // A restore already recorded after the last break means nothing to say.
    if (fixed?.length && Date.parse(fixed[0].created_at) > Date.parse(data[0].created_at || 0)) return;
    await recordEvent(supabase, {
      userId, type: "connection.restored", actor: "genie",
      subject: PROVIDER_LABEL[conn.provider] || conn.provider,
      data: { provider: conn.provider },
    });
  } catch {}
}
