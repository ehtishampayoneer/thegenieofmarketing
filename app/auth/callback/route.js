// app/auth/callback/route.js
// Where Google (via Supabase) sends users back after login.
// Exchanges the one-time code for a real session, then redirects home.
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/today";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First-time users go through onboarding; returning users skip it.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("onboarding_completed")
            .eq("id", user.id)
            .maybeSingle();
          if (!profile) {
            // Create the profile row and send them to the intro.
            await supabase.from("profiles").upsert({ id: user.id, onboarding_completed: false });
            return NextResponse.redirect(`${origin}/welcome`);
          }
          if (!profile.onboarding_completed) {
            return NextResponse.redirect(`${origin}/welcome`);
          }
        }
      } catch {}
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send them to login with a flag.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
