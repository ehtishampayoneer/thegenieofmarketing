// app/api/chat/route.js
// Ask Genie — conversational advisor that knows the user's business from their
// scans. Context comes from their latest saved scan + recent history (direct
// injection; no vector search needed at this scale).

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";

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

  // Pull the user's recent scans for business context.
  const { data: scans } = await supabase
    .from("scans")
    .select("url, final_url, overall_score, scores, ai, gsc, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const context = buildContext(scans || []);

  const history = messages
    .map((m) => `${m.role === "user" ? "User" : "Genie"}: ${m.content}`)
    .join("\n");

  const system =
    "You are Genie, a warm, sharp marketing advisor who knows this specific business. " +
    "Plain English, 7th-grade reading level, no jargon. Be honest, not flattering. " +
    "Always ground answers in the business context provided. Always end with ONE clear next step. " +
    "If you cite a number that's an estimate, say so. Keep replies focused — a few short paragraphs at most.";

  const prompt = `${context}\n\nConversation so far:\n${history}\nGenie:`;

  try {
    const result = await callAI({
      system,
      prompt,
      maxTokens: 800,
      temperature: 0.7,
    });
    return json({ ok: true, reply: result.text });
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      return json(
        { ok: false, retryable: true, message: "Genie is busy — try again in a moment." },
        503
      );
    }
    return json({ ok: false, error: "Something went wrong." }, 500);
  }
}

function buildContext(scans) {
  if (scans.length === 0) {
    return "The user hasn't scanned a website yet. Encourage them to run a scan so you can give specific advice, but still answer general marketing questions helpfully.";
  }
  const latest = scans[0];
  const ai = latest.ai || {};
  const s = latest.scores || {};
  const host = hostOf(latest.final_url || latest.url);

  let ctx = `BUSINESS CONTEXT (from this user's latest scan):
Website: ${host}
Business: ${ai.businessName || "(unknown)"}${ai.industry ? " · " + ai.industry : ""}
Sells: ${ai.whatTheySell || "(unknown)"}
Target customer: ${ai.targetCustomer || "(unknown)"}
Overall score: ${latest.overall_score ?? "?"}/100 (SEO ${s.seo ?? "?"}, Speed ${s.speed ?? "n/a"}, Trust ${s.trust ?? "?"}, Content ${s.content ?? "?"}, Social ${s.social ?? "?"})
Key weaknesses: ${(ai.weaknesses || []).join("; ") || "(none noted)"}`;

  if (latest.gsc?.available) {
    ctx += `\nReal Search Console keywords: ${(latest.gsc.topQueries || [])
      .slice(0, 8)
      .map((q) => `"${q.query}" (#${Math.round(q.position)})`)
      .join(", ")}`;
  }

  if (scans.length > 1) {
    ctx += `\n\nScan history (score over time): ${scans
      .slice()
      .reverse()
      .map((sc) => `${hostOf(sc.final_url || sc.url)} ${sc.overall_score ?? "?"}`)
      .join(" → ")}`;
  }

  return ctx;
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u || "";
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
