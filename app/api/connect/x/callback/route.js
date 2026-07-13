// app/api/connect/x/callback/route.js
// X sends the user back here with a code. We verify state, exchange the code
// (with the PKCE verifier) for access + refresh tokens, fetch the handle, and
// store the connection. Refresh token + expiry live in the meta jsonb.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get("x_oauth_state")?.value;
  const verifier = request.cookies.get("x_pkce_verifier")?.value;

  const back = (q) => NextResponse.redirect(absolute(`/connections${q}`));

  if (!code || !state || !verifier || state !== cookieState) {
    return back("&x_error=state_mismatch");
  }

  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI;

  // Exchange the code for tokens.
  let tokens;
  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        client_id: clientId,
      }),
    });
    tokens = await res.json();
    if (!res.ok || !tokens.access_token) return back("&x_error=token_exchange");
  } catch {
    return back("&x_error=token_exchange");
  }

  // Fetch the handle so we can show "Connected as @handle".
  let handle = null, xUserId = null;
  try {
    const me = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const j = await me.json();
    handle = j?.data?.username || null;
    xUserId = j?.data?.id || null;
  } catch {}

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(absolute("/login"));

  const expiresAt = new Date(Date.now() + (tokens.expires_in || 7200) * 1000).toISOString();
  await supabase.from("connections").upsert(
    {
      user_id: user.id,
      provider: "x",
      access_token: tokens.access_token,
      meta: { refresh_token: tokens.refresh_token || null, expires_at: expiresAt, handle, x_user_id: xUserId },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  const res = back(handle ? `&x_connected=${encodeURIComponent(handle)}` : "&x_connected=1");
  res.cookies.delete("genie_return");
  res.cookies.delete("x_pkce_verifier");
  res.cookies.delete("x_oauth_state");
  return res;
}

function absolute(path) {
  const base = process.env.APP_URL || "https://thegenieofmarketing.vercel.app";
  return base + path;
}
