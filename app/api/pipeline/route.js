// app/api/pipeline/route.js
// The unified deal pipeline: EVERYONE Genie has reached across every channel (Find
// clients, Revenue Recovery, Get featured, partners — they all send via the outreach
// engine and log here), the funnel (reached → opened → replied → won), each reply
// classified (interested / question / objection / not now / wrong person / auto), and
// the money closed. This is where hunts actually turn into revenue.

import { createClient } from "@/lib/supabase/server";
import { getEvents } from "@/lib/events";
import { aiList } from "@/lib/prospects";
import { dealNum } from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data: sent } = await supabase.from("outreach_log")
    .select("contact_email, contact_name, subject, status, sent_at, replied_at")
    .eq("user_id", user.id).order("sent_at", { ascending: false }).limit(600);
  const rows = sent || [];

  const replyEvents = await getEvents(supabase, { userId: user.id, types: ["outreach.reply"], limit: 500 });
  const replyByEmail = {};
  for (const e of replyEvents) { const em = (e.data?.email || e.subject || "").toLowerCase(); if (em && !replyByEmail[em]) replyByEmail[em] = e.data || {}; }

  const outcomeEvents = await getEvents(supabase, { userId: user.id, types: ["deal.outcome"], limit: 1000 });
  const outcomeByEmail = {};
  for (const e of outcomeEvents) { const em = (e.data?.email || "").toLowerCase(); if (em && !outcomeByEmail[em]) outcomeByEmail[em] = e.data; } // newest first → keep first

  const seen = new Set();
  const contacts = [];
  for (const s of rows) {
    const em = (s.contact_email || "").toLowerCase();
    if (!em || seen.has(em)) continue;
    seen.add(em);
    const reply = replyByEmail[em] || null;
    const outcome = outcomeByEmail[em] || null;
    contacts.push({
      email: s.contact_email, name: s.contact_name || null, subject: s.subject || "",
      status: s.status || "sent", sentAt: s.sent_at, repliedAt: s.replied_at || reply?.date || null,
      replied: !!reply || s.status === "replied", replySnippet: reply?.snippet || "",
      outcome: outcome?.outcome || null, value: outcome?.value ?? null, replyClass: null,
    });
  }

  // Classify the replies that still need a decision (best-effort, one batched call).
  const toClassify = contacts.filter((c) => c.replied && c.replySnippet && !c.outcome);
  if (toClassify.length) {
    const cls = await classifyReplies(toClassify);
    for (const c of contacts) { const k = c.email.toLowerCase(); if (cls[k]) c.replyClass = cls[k]; }
  }

  const funnel = {
    reached: contacts.length,
    opened: contacts.filter((c) => ["opened", "replied"].includes(c.status) || c.replied).length,
    replied: contacts.filter((c) => c.replied).length,
    won: contacts.filter((c) => c.outcome === "won").length,
  };
  const recovered = contacts.filter((c) => c.outcome === "won").reduce((s, c) => s + dealNum(c.value), 0);

  return json({ ok: true, contacts, funnel, recovered });
}

async function classifyReplies(items) {
  const compact = items.map((c, i) => ({ i, from: c.name || c.email, text: String(c.replySnippet || "").slice(0, 240) }));
  let arr = [];
  try {
    arr = await aiList({
      system: "You classify sales-email replies. For EACH reply choose ONE label: interested, question, objection, not_now, wrong_person, unsubscribe, or auto (an out-of-office/auto-reply). Return ONLY a JSON array, one object per reply, same order.",
      json: true, maxTokens: 900, temperature: 0.2,
      prompt: `Replies (JSON): ${JSON.stringify(compact)}\nReturn ONLY: [{ "i": 0, "label": "interested" }]`,
    });
  } catch { arr = []; }
  const byIdx = new Map((arr || []).map((p) => [Number(p.i), String(p.label || "").toLowerCase()]));
  const out = {};
  items.forEach((c, i) => { const l = byIdx.get(i); if (l) out[c.email.toLowerCase()] = l; });
  return out;
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
