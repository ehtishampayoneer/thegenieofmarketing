// app/api/radar/web/route.js
// STAGE 4 — THE WEB RADAR (forums + listicles + guest-post openings).
// Genie searches the open web for three kinds of opening:
//   - forum      : live forum/community threads discussing his keywords → drafted reply
//   - listicle   : "best X" / roundup posts his product should be included in → drafted pitch
//   - guest      : blogs accepting contributors → drafted guest-post pitch
// All are non-owned → human taps. Each is triaged by Genie into the right kind.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";
import { webSearch } from "@/lib/search";
import { gradePortfolio } from "@/lib/keyword-health";
import { cooldownFor } from "@/lib/cadence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { host, ai } = body || {};
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  const { data: kwRows } = await supabase.from("keywords").select("*").eq("user_id", user.id).eq("host", host);
  if (!kwRows?.length) return json({ ok: false, needsKeywords: true, error: "Genie needs keywords first." }, 400);
  const { graded } = gradePortfolio(kwRows);
  const pool = (graded.filter((k) => k.health === "strong" || k.health === "growing").slice(0, 5)) || graded.slice(0, 5);

  const { data: existing } = await supabase.from("placements").select("target_url, status, next_eligible_at")
    .eq("user_id", user.id).eq("host", host).in("platform", ["forum", "guest"]);
  const now = new Date();
  const seen = new Set((existing || []).filter((p) => p.status === "ready" || (p.next_eligible_at && new Date(p.next_eligible_at) > now)).map((p) => p.target_url));

  // Three query styles per keyword to surface the three opening types.
  const candidates = [];
  for (const kw of pool) {
    const queries = [
      { q: `${kw.keyword} forum discussion`, hint: "forum" },
      { q: `best ${kw.keyword} tools`, hint: "listicle" },
      { q: `${kw.keyword} "write for us"`, hint: "guest" },
    ];
    for (const { q, hint } of queries) {
      const found = await webSearch(q, { limit: 3 });
      for (const f of found) {
        if (seen.has(f.url)) continue;
        if (/reddit\.com|quora\.com/.test(f.url)) continue; // handled by dedicated radars
        candidates.push({ ...f, keyword: kw.keyword, hint });
        seen.add(f.url);
      }
    }
    if (candidates.length >= 12) break;
  }
  if (!candidates.length) return json({ ok: true, staged: 0, message: "No fresh web openings found right now — Genie will keep looking." });

  let drafted;
  try {
    const result = await callAI({
      system: "You are Genie finding off-site marketing openings. Classify each result and write the right placement: a forum reply (value-first), a pitch to be added to a 'best X' listicle, or a guest-post pitch to a blog that accepts contributors. Never spammy. If a result is irrelevant or not actually one of these, set fit:false. Return ONLY valid JSON.",
      json: true, maxTokens: 3500, temperature: 0.7,
      prompt: buildPrompt(candidates, ai, host),
    });
    drafted = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, message: "Genie is busy — try again." }, 503);
    return json({ ok: false, error: "Couldn't write placements." }, 500);
  }

  const items = Array.isArray(drafted?.placements) ? drafted.placements : [];
  const KIND_TO_PLATFORM = { forum: "forum", listicle: "guest", guest: "guest" };
  const rows = [];
  items.forEach((it, idx) => {
    const c = candidates[it.index] ?? candidates[idx];
    if (!c || it.fit === false || !it.draft) return;
    const kind = it.kind || c.hint;
    rows.push({
      user_id: user.id, host, platform: KIND_TO_PLATFORM[kind] || "forum", owned: false, keyword: c.keyword,
      target_url: c.url, target_title: c.title.slice(0, 200),
      kind: kind === "listicle" ? "pitch" : kind === "guest" ? "pitch" : "reply",
      draft: it.draft, status: "ready", cooldown_days: cooldownFor(KIND_TO_PLATFORM[kind] || "forum"),
      meta: { snippet: c.snippet, openingType: kind, reason: it.reason || null },
    });
  });
  if (!rows.length) return json({ ok: true, staged: 0, message: "Genie reviewed the web openings but none were a genuine fit (no spam)." });

  const { data: inserted, error } = await supabase.from("placements").insert(rows).select("id");
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, staged: (inserted || []).length });
}

function buildPrompt(candidates, ai, host) {
  const list = candidates.map((c, i) => `[${i}] keyword: "${c.keyword}" | likely type: ${c.hint}\ntitle: ${c.title}\nurl: ${c.url}\ncontext: ${c.snippet || "(none)"}`).join("\n\n");
  return `Product: ${ai?.businessName || host} — ${ai?.whatTheySell || ai?.industry || ""}
Who it helps: ${ai?.targetCustomer || "(infer)"}

Web results Genie found (classify + write a placement for real fits):
${list}

Return ONLY this JSON:
{ "placements": [ { "index": 0, "fit": true, "kind": "forum|listicle|guest", "draft": "the reply / listicle-inclusion pitch / guest-post pitch — value first, never spammy", "reason": "why it fits" } ] }
Only include genuine fits. Rejecting bad ones is correct and expected.`;
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
