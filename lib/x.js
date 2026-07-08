// lib/x.js
// Server-side X (Twitter) posting. Handles token refresh transparently and
// posts single tweets or threads. Used by the execution layer to auto-publish
// to the user's OWN X account (owned platform → real auto-post, no tap).

async function refreshIfNeeded(supabase, userId, conn) {
  const meta = conn.meta || {};
  const expiresAt = meta.expires_at ? new Date(meta.expires_at).getTime() : 0;
  // Refresh a couple minutes before expiry.
  if (Date.now() < expiresAt - 120000) return conn.access_token;
  if (!meta.refresh_token) return conn.access_token; // best effort; may 401

  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: meta.refresh_token, client_id: clientId }),
  });
  const tokens = await res.json();
  if (!res.ok || !tokens.access_token) return conn.access_token;

  const expires_at = new Date(Date.now() + (tokens.expires_in || 7200) * 1000).toISOString();
  await supabase.from("connections").update({
    access_token: tokens.access_token,
    meta: { ...meta, refresh_token: tokens.refresh_token || meta.refresh_token, expires_at },
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("provider", "x");

  return tokens.access_token;
}

export async function getXConnection(supabase, userId) {
  const { data } = await supabase.from("connections").select("access_token, meta")
    .eq("user_id", userId).eq("provider", "x").maybeSingle();
  return data || null;
}

// Post a tweet (or thread if given an array). Returns { ok, id, url } or { ok:false, error }.
export async function postToX(supabase, userId, content) {
  const conn = await getXConnection(supabase, userId);
  if (!conn?.access_token) return { ok: false, error: "X not connected." };

  let token;
  try { token = await refreshIfNeeded(supabase, userId, conn); }
  catch { token = conn.access_token; }

  const tweets = Array.isArray(content) ? content : [content];
  let replyTo = null;
  let firstId = null;

  for (const raw of tweets) {
    const text = String(raw || "").slice(0, 280);
    if (!text.trim()) continue;
    const body = { text };
    if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok || !j?.data?.id) {
      const detail = j?.detail || j?.title || `status ${res.status}`;
      return { ok: false, error: `X rejected the post: ${detail}` };
    }
    replyTo = j.data.id;
    if (!firstId) firstId = j.data.id;
  }

  const handle = conn.meta?.handle;
  return { ok: true, id: firstId, url: handle && firstId ? `https://x.com/${handle}/status/${firstId}` : null };
}
