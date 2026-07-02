// app/api/chat/route.js
// Ask Genie — advisor scoped to the SELECTED business (by host), not just the
// newest scan. Concise, action-first replies (never Wikipedia essays).

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";
import { hostOf } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: "Please sign in to chat with Genie." }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
  if (messages.length === 0) return json({ ok: false, error: "No message." }, 400);
  const selectedHost = body?.host || null;

  const { data: scans } = await supabase
    .from("scans")
    .select("url, final_url, overall_score, scores, ai, gsc, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  // Pick the selected business's latest scan (or the newest overall).
  const all = scans || [];
  const scan = selectedHost
    ? all.find((s) => hostOf(s) === selectedHost) || all[0] || null
    : all[0] || null;
  const history = all.filter((s) => scan && hostOf(s) === hostOf(scan));

  const name = scan?.ai?.businessName || (scan ? hostOf(scan) : "your business");
  const context = buildContext(scan, history);

  const convo = messages
    .map((m) => `${m.role === "user" ? "User" : "Genie"}: ${m.content}`)
    .join("\n");

  const system =
    `You are Genie, a sharp, warm marketing advisor for "${name}". Follow these rules WITHOUT exception:\n` +
    `- Reference "${name}" by name in your answer.\n` +
    `- Keep it to AT MOST 3 short paragraphs. For any advice, use bullet points or numbered steps.\n` +
    `- Plain English, 7th-grade level. No jargon, no filler, no throat-clearing.\n` +
    `- Finish every thought completely. NEVER stop mid-sentence.\n` +
    `- Be honest, not flattering. Label estimates as estimates.\n` +
    `- End by offering to go deeper (e.g. "Want me to go deeper on any of these?") instead of writing an essay.`;

  const prompt = `${context}\n\nConversation so far:\n${convo}\nGenie:`;

  try {
    const result = await callAI({ system, prompt, maxTokens: 1500, temperature: 0.7 });
    return json({ ok: true, reply: result.text, business: scan ? hostOf(scan) : null });
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      return json({ ok: false, retryable: true, message: "Genie is busy — try again in a moment." }, 503);
    }
    return json({ ok: false, error: "Something went wrong." }, 500);
  }
}

function buildContext(scan, history) {
  if (!scan) {
    return "The user hasn't scanned a website yet. Encourage them to run a scan for specific advice, but still help with general marketing questions.";
  }
  const ai = scan.ai || {};
  const s = scan.scores || {};
  const host = hostOf(scan);
  let ctx = `BUSINESS CONTEXT (selected business):
Website: ${host}
Business: ${ai.businessName || "(unknown)"}${ai.industry ? " · " + ai.industry : ""}
Sells: ${ai.whatTheySell || "(unknown)"}
Target customer: ${ai.targetCustomer || "(unknown)"}
Overall score: ${scan.overall_score ?? "?"}/100 (SEO ${s.seo ?? "?"}, Speed ${s.speed ?? "n/a"}, Trust ${s.trust ?? "?"}, Content ${s.content ?? "?"}, Social ${s.social ?? "?"})
Key weaknesses: ${(ai.weaknesses || []).join("; ") || "(none noted)"}`;

  if (scan.gsc?.available) {
    ctx += `\nReal Search Console keywords: ${(scan.gsc.topQueries || [])
      .slice(0, 8)
      .map((q) => `"${q.query}" (#${Math.round(q.position)})`)
      .join(", ")}`;
  }
  if (history.length > 1) {
    ctx += `\nScore over time: ${history
      .slice()
      .reverse()
      .map((sc) => sc.overall_score ?? "?")
      .join(" → ")}`;
  }
  return ctx;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
