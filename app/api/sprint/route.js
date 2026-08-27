// app/api/sprint/route.js
// ── THE PROOF SPRINT ──
// A 30-day focused test that turns "it looks powerful" into "here's what it earned".
// The user commits to ONE customer type + ONE offer; Genie tracks the 7 numbers that
// prove (or disprove) traction, scoped to the sprint window so the evidence is honest.
// Config lives in actions (type "sprint", excluded from Approvals/Today); the live
// metrics are computed from real outreach + events since the start date.

import { resolveRadarUser } from "@/lib/radar-auth";
import { createClient } from "@/lib/supabase/server";
import { getEvents } from "@/lib/events";
import { dealNum } from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPE = "sprint";
const LEN_DAYS = 30;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const sprint = await loadSprint(supabase, user.id);
  if (!sprint) return json({ ok: true, active: false });

  const cfg = sprint.payload || {};
  const start = cfg.startDate ? new Date(cfg.startDate) : null;
  const metrics = await sprintMetrics(supabase, user.id, cfg.startDate);
  const dayNum = start ? Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000)) : 1;
  const daysLeft = Math.max(0, LEN_DAYS - dayNum + 1);

  return json({ ok: true, active: true, config: cfg, metrics, dayNum: Math.min(dayNum, LEN_DAYS), daysLeft, length: LEN_DAYS });
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);

  const existing = await loadSprint(supabase, userId);

  if (body.action === "end") {
    if (existing) await supabase.from("actions").update({ status: "done", payload: { ...(existing.payload || {}), status: "ended", endedAt: new Date().toISOString() } }).eq("id", existing.id);
    return json({ ok: true, active: false });
  }

  const cfg = {
    icp: str(body.icp, 240),
    offer: str(body.offer, 240),
    price: str(body.price, 60),
    goalSales: numOr(body.goalSales, 3),
    goalConvos: numOr(body.goalConvos, 10),
    manual: { meetings: numOr(body?.manual?.meetings, 0), proposals: numOr(body?.manual?.proposals, 0) },
    notes: Array.isArray(body.notes) ? body.notes.slice(0, 30) : (existing?.payload?.notes || []),
    startDate: body.startDate || existing?.payload?.startDate || new Date().toISOString(),
    status: "active",
  };

  try {
    if (existing) await supabase.from("actions").update({ status: "proposed", payload: cfg, title: "Proof sprint" }).eq("id", existing.id);
    else await supabase.from("actions").insert({ user_id: userId, type: TYPE, status: "proposed", title: "Proof sprint", payload: cfg });
  } catch (e) {
    return json({ ok: false, error: "Couldn't save the sprint. If this persists, the database may need db/setup.sql run." }, 500);
  }
  return json({ ok: true, active: true, config: cfg });
}

async function loadSprint(supabase, userId) {
  try {
    const { data } = await supabase.from("actions").select("id, payload").eq("user_id", userId).eq("type", TYPE).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data && data.payload?.status !== "ended" ? data : null;
  } catch { return null; }
}

// The real numbers, scoped to the sprint window (since startDate).
async function sprintMetrics(supabase, userId, startDate) {
  const since = startDate || null;
  let reached = 0, replied = 0;
  try {
    let q = supabase.from("outreach_log").select("contact_email, status, replied_at, sent_at").eq("user_id", userId);
    if (since) q = q.gte("sent_at", since);
    const { data } = await q.limit(1000);
    const rows = data || [];
    const emails = new Set();
    for (const r of rows) { const e = (r.contact_email || "").toLowerCase(); if (e) emails.add(e); }
    reached = emails.size;
    replied = rows.filter((r) => r.status === "replied" || r.replied_at).length;
  } catch {}

  let won = 0, revenue = 0, leads = 0, clicks = 0;
  try {
    const [outcomes, leadEv, clickEv] = await Promise.all([
      getEvents(supabase, { userId, types: ["deal.outcome"], since, limit: 500 }),
      getEvents(supabase, { userId, types: ["lead.captured"], since, limit: 1000 }),
      getEvents(supabase, { userId, types: ["click.recorded"], since, limit: 2000 }),
    ]);
    for (const e of outcomes) if (e.data?.outcome === "won") { won++; revenue += dealNum(e.data?.value); }
    leads = leadEv.length;
    clicks = clickEv.length;
  } catch {}

  const revPer100 = reached > 0 ? Math.round((revenue / reached) * 100) : 0;
  return { reached, replied, won, revenue, leads, clicks, revPer100 };
}

function str(v, n) { return typeof v === "string" ? v.trim().slice(0, n) : ""; }
function numOr(v, d) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n) : d; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
