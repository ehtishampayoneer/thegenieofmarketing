// app/api/ai/route.js
// HTTP endpoint for the AI brain. POST a prompt, get a response back.
// Used by the audit engine, content engine, chat, everything.

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const { prompt, system, json: wantJson, temperature, maxTokens, only } = body || {};

  if (!prompt || typeof prompt !== "string") {
    return json({ error: "`prompt` (string) is required." }, 400);
  }

  try {
    const result = await callAI({
      prompt,
      system,
      json: !!wantJson,
      temperature,
      maxTokens,
      only,
    });

    // Attribution returned so you can monitor which AI served each request.
    return json({
      ok: true,
      text: result.text,
      data: result.json, // parsed object when json:true was requested
      meta: {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
      },
    });
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      // LAW 2: NEVER STOP. No raw error to the user — a retryable, human message.
      return json(
        {
          ok: false,
          retryable: true,
          message:
            "High demand right now. Your request is queued — it’ll be ready in a moment. Retrying automatically…",
          retryAfterMs: 60_000,
          attempts: err.attempts, // for your logs/debugging, not for end users
        },
        503
      );
    }
    return json({ ok: false, error: err?.message || "Unknown error." }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
