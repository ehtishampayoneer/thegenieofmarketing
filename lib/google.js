// lib/google.js
// Google OAuth + token helpers for the data connection (Search Console, later Analytics).
// Uses Google's REST endpoints directly — no SDK.

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/webmasters.readonly",      // Search Console (read)
  "https://www.googleapis.com/auth/analytics.readonly",        // GA4 (read) — traffic proof
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
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
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
 * refreshing it (and updating the DB) if it has expired. Used by Phase C3.
 * @param {object} supabase - a server Supabase client (RLS as the user)
 * @param {object} conn - the connection row
 */
export async function getValidAccessToken(supabase, conn) {
  const now = Date.now();
  const exp = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  // Still valid (with 60s buffer)?
  if (conn.access_token && exp - 60_000 > now) return conn.access_token;

  if (!conn.refresh_token) return null;
  const refreshed = await refreshAccessToken(conn.refresh_token);
  const newExpiry = new Date(now + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("connections")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiry,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);
  return refreshed.access_token;
}
