// app/api/connect/x/start/route.js
// Begins X (Twitter) OAuth 2.0 with PKCE. Generates a code verifier/challenge,
// stashes verifier + state in a short-lived httpOnly cookie, and redirects the
// user to X to authorize posting from their account.

import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const clientId = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI;
  const from = new URL(request.url).searchParams.get("from"); // "welcome" → resume onboarding
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(absolute("/connections?x_error=not_configured"));
  }

  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(24));

  const scope = ["tweet.read", "tweet.write", "users.read", "offline.access"].join(" ");
  const url = new URL("https://twitter.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(url.toString());
  // Short-lived, httpOnly — verifier never reaches the browser JS.
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 };
  res.cookies.set("x_pkce_verifier", verifier, cookieOpts);
  res.cookies.set("x_oauth_state", state, cookieOpts);
  if (from === "welcome") res.cookies.set("oauth_from", "welcome", cookieOpts);
  return res;
}

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function absolute(path) {
  const base = process.env.APP_URL || "https://thegenieofmarketing.vercel.app";
  return base + path;
}
