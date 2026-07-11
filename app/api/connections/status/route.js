// app/api/connections/status/route.js
// One source of truth for "what's actually connected" — powers the Connections UI
// and the beta-readiness view. Reports each real integration's live state so a
// user (and we) can see at a glance what's wired and what still needs setup.

import { createClient } from "@/lib/supabase/server";
import { getEvents } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let conns = [];
  try { const { data } = await supabase.from("connections").select("provider, meta, gsc_site").eq("user_id", user.id); conns = data || []; } catch {}
  const byProvider = Object.fromEntries(conns.map((c) => [c.provider, c]));

  const google = byProvider.google;
  // Has GA4 activated? (property discovered, or a GA4 traffic event recorded)
  let ga4 = false;
  try {
    const t = await getEvents(supabase, { userId: user.id, types: ["traffic.recorded"], limit: 1 });
    ga4 = !!google?.meta?.ga4_property || t.length > 0;
  } catch {}
  // Are we receiving real revenue? (any conversion event from a commerce webhook)
  let commerce = false;
  try { const c = await getEvents(supabase, { userId: user.id, types: ["conversion.recorded"], limit: 1 }); commerce = c.length > 0; } catch {}

  const integrations = {
    search_console: { label: "Google Search Console", connected: !!google?.gsc_site, category: "measure" },
    ga4: { label: "Google Analytics (GA4)", connected: ga4, category: "measure", needs: google ? null : "connect_google" },
    wordpress: { label: "WordPress", connected: !!byProvider.wordpress, category: "publish" },
    x: { label: "X (Twitter)", connected: !!byProvider.x, category: "publish" },
    email: { label: "Outreach email (Resend)", connected: !!process.env.RESEND_API_KEY, category: "reach", system: true },
    commerce: { label: "Revenue (any provider webhook)", connected: commerce, category: "measure" },
  };

  // System-level capabilities (env-gated), for our own readiness view.
  const capabilities = {
    pagespeed: !!(process.env.PAGESPEED_API_KEY || process.env.GOOGLE_API_KEY),
    paid_llm_fallback: !!process.env.PAID_LLM_API_KEY,
    paid_search_fallback: !!process.env.SERPAPI_KEY,
    durable_queue: !!process.env.QSTASH_TOKEN,
  };

  return json({ ok: true, integrations, capabilities });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
