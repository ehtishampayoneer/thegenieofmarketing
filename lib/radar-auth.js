// lib/radar-auth.js
// Resolves who a radar call runs for. Two modes:
//   - Normal: the signed-in user (session client, RLS-scoped).
//   - Cron:   the overnight loop calls with header x-genie-cron === CRON_SECRET
//             and body._uid; we then use the admin client scoped to that user.
// Returns { supabase, userId } or { userId: null } when unauthorized.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveRadarUser(request, body) {
  const cronHeader = request.headers.get("x-genie-cron");
  if (cronHeader && process.env.CRON_SECRET && cronHeader === process.env.CRON_SECRET && body?._uid) {
    // Trusted overnight call: admin client, explicit user.
    return { supabase: createAdminClient(), userId: body._uid, cron: true };
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id || null, cron: false };
}
