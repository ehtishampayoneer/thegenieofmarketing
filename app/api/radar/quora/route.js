// app/api/radar/quora/route.js
// STAGE 4 — THE QUORA RADAR.
// Genie finds Quora questions his keywords answer, and writes a long-form,
// genuinely useful answer that ranks and surfaces the product naturally.
// Honest constraints, enforced in code:
//   - Quora is not owned → owned:false → human taps to post.
//   - One great answer per question (long cooldown); value-first, no ad voice.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { resolveRadarUser } from "@/lib/radar-auth";
import { webSearch } from "@/lib/search";
import { gradePortfolio } from "@/lib/keyword-health";
import { cooldownFor } from "@/lib/cadence";
import { genieBrain } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { supabase, userId } = await resolveRadarUser(request, body);
  if (!userId) return json({ ok: false, reason: "not_authenticated" }, 401);
  const { host, ai } = body || {};
  if (!host) return json({ ok: false, error: "Missing host." }, 400);

  // THE PLAN. This radar used to paste the owner's brief and let the model
  // re-decide what the business was, which is how a reply here could argue
  // something the articles never claimed. Read-only: the nightly run must not
  // spend an AI call drafting the plan, and whichever engine drafts it first has
  // already saved it for every engine after.
  const { block: plan } = await genieBrain(supabase, { userId, host, ai });

  const { data: kwRows } = await supabase.from("keywords").select("*").eq("user_id", userId).eq("host", host);
  if (!kwRows?.length) return json({ ok: false, needsKeywords: true, error: "Genie needs keywords first." }, 400);
  const { graded } = gradePortfolio(kwRows);
  // An empty array is truthy, so `strong.slice() || graded.slice()` never fell back:
  // when every keyword graded weak this radar searched nothing at all.
  const strong = graded.filter((k) => k.health === "strong" || k.health === "growing").slice(0, 6);
  const pool = strong.length ? strong : graded.filter((k) => k.health !== "retired").slice(0, 6);

  const { data: existing } = await supabase.from("placements").select("target_url, status, next_eligible_at")
    .eq("user_id", userId).eq("host", host).eq("platform", "quora");
  const now = new Date();
  const seen = new Set((existing || []).filter((p) => p.status === "ready" || (p.next_eligible_at && new Date(p.next_eligible_at) > now)).map((p) => p.target_url));

  const candidates = [];
  for (const kw of pool) {
    const found = await webSearch(kw.keyword, { site: "quora.com", limit: 4 });
    for (const f of found) {
      if (!/quora\.com\/[^/]+/.test(f.url) || seen.has(f.url)) continue;
      candidates.push({ ...f, keyword: kw.keyword });
      seen.add(f.url);
    }
    if (candidates.length >= 8) break;
  }
  if (!candidates.length) return json({ ok: true, staged: 0, message: "No fresh Quora questions found right now — Genie will keep looking." });

  let drafted;
  try {
    const result = await callAI({
      system: "You are Genie doing authentic Quora marketing. For each question, write a long-form, genuinely useful answer that would rank and be upvoted. Value first; mention the product only where it truly helps, never as a pitch. If a question doesn't fit, set fit:false. Return ONLY valid JSON.",
      json: true, maxTokens: 7000, timeoutMs: 55000, temperature: 0.7,
      prompt: buildPrompt(candidates, ai, host, plan),
    });
    drafted = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, message: "Genie is busy — try again." }, 503);
    return json({ ok: false, error: "Couldn't write answers." }, 500);
  }

  const items = Array.isArray(drafted?.placements) ? drafted.placements : [];
  const rows = [];
  items.forEach((it, idx) => {
    const c = candidates[it.index] ?? candidates[idx];
    if (!c || it.fit === false || !it.draft) return;
    rows.push({
      user_id: userId, host, platform: "quora", owned: false, keyword: c.keyword,
      target_url: c.url, target_title: c.title.slice(0, 200), kind: "answer", draft: it.draft,
      status: "ready", cooldown_days: cooldownFor("quora"),
      meta: { snippet: c.snippet, reason: it.reason || null },
    });
  });
  if (!rows.length) return json({ ok: true, staged: 0, message: "Genie reviewed the questions but none were a genuine fit (no spam)." });

  const { data: inserted, error } = await supabase.from("placements").insert(rows).select("id");
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, staged: (inserted || []).length });
}

function buildPrompt(candidates, ai, host, plan = "") {
  const list = candidates.map((c, i) => `[${i}] keyword: "${c.keyword}"\nquestion: ${c.title}\ncontext: ${c.snippet || "(none)"}`).join("\n\n");
  return `Product: ${ai?.businessName || host} — ${ai?.whatTheySell || ai?.industry || ""}
Who it helps: ${ai?.targetCustomer || "(infer)"}
${plan}
Only count a thread as a fit when the person is one of the owner's target customers. Builders of the same thing, developers asking how to make it, and anyone in who-not-to-target are not fits.

Quora questions Genie found:
${list}

Return ONLY this JSON:
{ "placements": [ { "index": 0, "fit": true, "draft": "a long-form, genuinely useful answer — value first, product only where it helps", "reason": "why it fits" } ] }
Only include real fits (fit:true). Rejecting bad fits is correct.`;
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
