// app/auth/callback/route.js
// Where Google (via Supabase) sends users back after login.
// Exchanges the one-time code for a real session, then redirects home.
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send them to login with a flag.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
