// app/api/pages/performance/route.js
// ── PER-PAGE RESULTS ──
// The honest "is the machine working?" readout: for every page Genie published, how
// many readers CLICKED through to the business (from the conversion CTA, counted via
// /go) and how many became LEADS (email opt-ins). Both are first-party — no analytics
// connection needed — so a user sees real results from day one, before revenue is even
// wired up. Reads the event ledger; degrades to an empty list if it's unavailable.

import { createClient } from "@/lib/supabase/server";
import { getEvents } from "@/lib/events";
import { pageUrl } from "@/lib/pages";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let host = new URL(request.url).searchParams.get("host");
  if (!host) {
    try {
      const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      host = data ? hostOf(data) : null;
    } catch {}
  }

  let pages = [];
  try {
    let q = supabase.from("published_pages").select("handle, slug, title, action_id, target_keyword, published_at").eq("user_id", user.id).eq("status", "published").order("published_at", { ascending: false }).limit(200);
    if (host) q = q.eq("host", host);
    const { data } = await q; pages = data || [];
  } catch {}

  // Leads are deduped per host+email at capture, so one event = one unique lead; we
  // attribute it to the page it opted in from. Clicks key on the action id the CTA
  // carries (utm/actionId), which maps to the page via published_pages.action_id.
  const evs = await getEvents(supabase, { userId: user.id, host: host || null, types: ["lead.captured", "click.recorded"], limit: 3000 });
  const leadsByPage = new Map();
  const clicksByAction = new Map();
  for (const e of evs) {
    if (e.type === "lead.captured") {
      const k = `${e.data?.handle || ""}/${e.data?.slug || ""}`;
      leadsByPage.set(k, (leadsByPage.get(k) || 0) + 1);
    } else if (e.type === "click.recorded") {
      const aid = e.data?.actionId;
      if (aid) clicksByAction.set(aid, (clicksByAction.get(aid) || 0) + 1);
    }
  }

  const rows = pages.map((p) => ({
    title: p.title,
    url: pageUrl(p.handle, p.slug),
    keyword: p.target_keyword || null,
    published_at: p.published_at,
    clicks: clicksByAction.get(p.action_id) || 0,
    leads: leadsByPage.get(`${p.handle}/${p.slug}`) || 0,
  }));
  rows.sort((a, b) => (b.clicks + b.leads) - (a.clicks + a.leads) || new Date(b.published_at || 0) - new Date(a.published_at || 0));

  const totals = rows.reduce((a, r) => ({ clicks: a.clicks + r.clicks, leads: a.leads + r.leads }), { clicks: 0, leads: 0 });
  return json({ ok: true, live: true, count: rows.length, totals, pages: rows });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
