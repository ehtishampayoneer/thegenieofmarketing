// app/api/connect/google/start/route.js
// Kicks off the Google connection: sets a CSRF state cookie, sends the user to Google.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { buildAuthUrl } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { origin } = new URL(request.url);

  // Must be logged in to connect.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
