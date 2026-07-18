// app/api/connect/google/callback/route.js
// Google sends the user back here. Verify state, swap the code for tokens,
// figure out which Google account it is, and save the connection.
import { NextResponse } from "next/server";
import { exchangeCode, getGoogleEmail } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get("g_oauth_state")?.value;
  const err = searchParams.get("error");

  // Return to wherever the connect flow began: the onboarding welcome step, or
  // the Connections page.
  const fromWelcome = request.cookies.get("oauth_from")?.value === "welcome";
  const dest = fromWelcome ? "/welcome" : "/connections";
  const back = (q) => {
    const sep = q ? (fromWelcome ? `${q}&resume=connect` : q) : (fromWelcome ? "?resume=connect" : "");
    const r = NextResponse.redirect(`${origin}${dest}${sep}`);
    r.cookies.set("oauth_from", "", { maxAge: 0, path: "/" });
    return r;
  };

  if (err) return back(`?connect_error=${encodeURIComponent(err)}`);
  if (!code || !state || state !== cookieState) {
    return back("?connect_error=state");
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch {
    return back("?connect_error=exchange");
  }

  const email = await getGoogleEmail(tokens.access_token);
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  // Google only returns refresh_token on first consent — keep the old one if absent.
  let refresh = tokens.refresh_token || null;
  if (!refresh) {
    const { data: existing } = await supabase
      .from("connections")
      .select("refresh_token")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();
    refresh = existing?.refresh_token || null;
  }

  const { error } = await supabase.from("connections").upsert(
    {
      user_id: user.id,
      provider: "google",
      access_token: tokens.access_token,
      refresh_token: refresh,
      token_expires_at: expiresAt,
      scopes: tokens.scope || null,
      google_email: email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  if (error) return back("?connect_error=save");

  const res = back("?connected=1");
  res.cookies.set("g_oauth_state", "", { maxAge: 0, path: "/" }); // clear state
  return res;
}
