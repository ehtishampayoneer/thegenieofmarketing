// app/api/launch-test/route.js
// ── TEST IT BEFORE YOU LAUNCH ──
// The same 1,000-person crowd that tests Genie's drafts, pointed at anything the
// owner is about to put out: an ad, a launch post, a price, a landing page, a
// product description, an email. Optionally for a specific country, and with the
// owner's own question ("would they trust this?").
//
// POST { action: "run", text | url, kind, question?, market?, improve? }
//        -> testers + improvers; the result is kept so it can be revisited
// POST { action: "ask", testId, personId, question }
//        -> ask one person in that crowd a follow-up, answered in their voice
// GET  -> the owner's recent tests
//
// Free AI only (lib/swarm/engine.js). When every free AI is busy it still runs
// the crowd with the rules judge, and says so. Capped per day so one owner can
// never use up the free AI everyone's drafts depend on.

import * as cheerio from "cheerio";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeFetch } from "@/lib/ssrf";
import { extractText } from "@/lib/audit";
import { hostOf } from "@/lib/business";
import { recordEvent } from "@/lib/events";
import { runCrowd, newContext, ai_ } from "@/lib/swarm/engine";
import { KINDS } from "@/lib/swarm/crowd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const TEST_KINDS = ["ad", "launch", "offer", "landing", "product", "email", "social", "reddit", "pitch", "article"];
const DAILY_LIMIT = 30;
const TEXT_MAX = 3000;

async function context() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null };
  let host = "";
  try {
    const { data } = await supabase.from("scans").select("final_url, url").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) host = hostOf(data);
  } catch {}
  return { supabase, user, host };
}

export async function GET(request) {
  const { supabase, user } = await context();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  // ?id= -> one past test in full, to reopen it.
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const { data: ev } = await supabase.from("events").select("id, data").eq("id", id).eq("user_id", user.id).eq("type", "launch.test").maybeSingle();
    if (!ev) return json({ ok: false, error: "Not found." }, 404);
    return json({ ok: true, id: ev.id, input: ev.data?.input || {}, ...(ev.data?.result || {}) });
  }
  const { data } = await supabase.from("events").select("id, data, created_at").eq("user_id", user.id).eq("type", "launch.test")
    .order("created_at", { ascending: false }).limit(12);
  return json({
    ok: true,
    tests: (data || []).map((e) => ({
      id: e.id, at: e.created_at, kind: e.data?.input?.kind, market: e.data?.input?.market || "",
      text: String(e.data?.input?.text || "").slice(0, 140), score: e.data?.result?.crowd?.score ?? null,
      improvedTo: e.data?.result?.crowd?.improved ? e.data.result.crowd.score : null,
    })),
  });
}

export async function POST(request) {
  const { supabase, user, host } = await context();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  let body = {};
  try { body = await request.json(); } catch {}
  if (body?.action === "ask") return ask(supabase, user, host, body);
  return run(supabase, user, host, body);
}

async function run(supabase, user, host, body) {
  const kind = TEST_KINDS.includes(body?.kind) ? body.kind : "launch";
  const question = String(body?.question || "").trim().slice(0, 300);
  const market = String(body?.market || "").trim().slice(0, 40);

  // Fair use: the free AI is shared with every draft Genie tests overnight.
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await supabase.from("events").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("type", "launch.test").gte("created_at", since);
  if ((count || 0) >= DAILY_LIMIT) return json({ ok: false, error: `That's ${DAILY_LIMIT} tests in 24 hours, the daily limit. More tomorrow.` }, 429);

  // A web address: read the page the way the scanner does.
  let text = String(body?.text || "").trim();
  let url = null;
  if (!text && body?.url) {
    url = String(body.url).trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const { res } = await safeFetch(url, { headers: { "User-Agent": "MarketingGenie/1.0 (+launch test)" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return json({ ok: false, error: `That page answered ${res.status}. Paste the text instead.` }, 400);
      text = extractText(cheerio.load(await res.text()));
    } catch { return json({ ok: false, error: "Genie couldn't open that page. Paste the text instead." }, 400); }
  }
  text = text.slice(0, TEXT_MAX);
  if (text.length < 15) return json({ ok: false, error: "Paste what you want tested: at least a sentence." }, 400);

  const admin = createAdminClient();
  const ctx = newContext(admin, 150000);
  const r = await runCrowd(admin, ctx, {
    userId: user.id, host, kind, text, question, market,
    seedKey: `${kind}:${text.slice(0, 300)}`,
    improve: body?.improve === false ? false : true,
  });

  // Who loved it and who did not, by kind of person, strongest first.
  const buyers = r.people.map((p) => {
    const dist = r.reactions[p.id]?.dist || [0, 0, 1, 0, 0];
    const mean = dist.reduce((s, x, i) => s + x * (i + 1), 0);
    const q = r.quotes.find((x) => x.id === p.id);
    return { id: p.id, name: p.name, who: p.who, gate: !!p.gate, mean: Math.round(mean * 100) / 100, objection: r.reactions[p.id]?.objections?.[0] || null, quote: q?.q || null };
  }).sort((a, b) => b.mean - a.mean);

  const v = r.improvement?.variant;
  const result = {
    crowd: r.crowd, business: r.business,
    people: buyers,
    improved: v ? { text: v.text || [v.title, v.meta].filter(Boolean).join("\n"), changed: v.changed, from: r.before.score, to: r.crowd.score } : null,
  };

  const testId = await recordEvent(admin, {
    userId: user.id, host, type: "launch.test", actor: "human", subject: `${KINDS[kind]?.label || kind}: ${text.slice(0, 80)}`,
    data: { input: { kind, text, question, market, url }, result },
  });
  // Counted with everything else the testers and improvers do.
  await recordEvent(admin, {
    userId: user.id, host, type: "swarm.tested", actor: "genie", subject: `Launch test: ${text.slice(0, 60)}`,
    data: { itemId: testId, source: "launch-test", kind, score: r.crowd.score, size: r.crowd.size, mode: r.crowd.mode, improved: !!v, tickets: r.before.objections.length },
  });
  if (v) {
    await recordEvent(admin, {
      userId: user.id, host, type: "swarm.improved", actor: "genie", subject: `Launch test: ${text.slice(0, 60)}`,
      data: { itemId: testId, kind, from: r.before.score, to: r.crowd.score, tickets: r.improvement.tickets.map((t) => t.tag), changed: v.changed },
    });
  }

  return json({ ok: true, id: testId, input: { kind, text, question, market, url }, ...result });
}

async function ask(supabase, user, host, body) {
  const question = String(body?.question || "").trim().slice(0, 400);
  if (!question) return json({ ok: false, error: "What do you want to ask them?" }, 400);
  const { data: ev } = await supabase.from("events").select("data").eq("id", body?.testId).eq("user_id", user.id).eq("type", "launch.test").maybeSingle();
  if (!ev) return json({ ok: false, error: "That test is gone. Run it again." }, 404);
  const person = (ev.data?.result?.people || []).find((p) => p.id === body?.personId);
  if (!person) return json({ ok: false, error: "Pick someone from the crowd." }, 400);
  const input = ev.data.input || {};
  const k = KINDS[input.kind] || KINDS.launch;

  const admin = createAdminClient();
  const ctx = newContext(admin, 60000);
  const r = await ai_(ctx, {
    prompt: `You are ${person.name}: ${person.who}${input.market ? ` You live in ${input.market}.` : ""}
You just saw this ${k.label} from ${ev.data.result?.business || "a business"}:
"""
${String(input.text || "").slice(0, 2500)}
"""
Your first reaction was ${person.mean >= 3.8 ? "positive" : person.mean >= 2.8 ? "indifferent" : "negative"}${person.objection ? `, mainly because: ${person.objection}` : ""}.

The business owner asks you: "${question}"

Answer as yourself, honestly and specifically, in 2 to 5 sentences. Say what would change your mind if something would. Do not be polite for the sake of it.
Return ONLY: {"answer":"..."}`,
    maxTokens: 700, temperature: 0.8, userId: user.id, host,
  });
  const answer = String(r?.json?.answer || "").trim();
  if (!answer) return json({ ok: false, retryable: true, error: "Every free AI is busy right now. Ask again in a minute." }, 503);
  return json({ ok: true, answer, person: { id: person.id, name: person.name } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
