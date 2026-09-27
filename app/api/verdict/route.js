// app/api/verdict/route.js
// ── PUBLIC AI-VERDICT ENDPOINT (the growth hook) ──
// Anonymous, no auth. Anyone pastes a URL and learns whether the real AI models
// recommend them or a competitor. Guardrails, because it triggers live scans + AI:
//   • per-IP rate limit (in-memory; upgrade to Redis at scale like ai-router),
//   • per-host result cache (repeat views are free and don't burn the limit),
//   • free engines only (runVerdict allowPaid:false, set in lib/verdict),
//   • SSRF-safe scan (runAudit → safeFetch).
// Fails honestly: if no AI model is reachable it says so, never a fake "0%".

import { ipOf, isLimited, limitedResponse } from "@/lib/rate-limit";
import { publicVerdict } from "@/lib/verdict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const WINDOW_MS = 10 * 60 * 1000; // 10 min
const MAX_PER_WINDOW = 5;         // verdicts per IP per window
const CACHE_TTL = 30 * 60 * 1000; // 30 min

// The buckets live in lib/rate-limit.js now, shared with the two other routes
// that spend money for a caller who is not signed in.
const CACHE = new Map(); // host -> { at, data }

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }

  const url = String(body?.url || "").trim();
  if (!url || url.length > 400) return json({ ok: false, error: "Enter your website address." }, 400);

  // Serve a fresh cached verdict WITHOUT consuming the rate limit (cheap, no AI).
  const host = hostGuess(url);
  const cached = host && CACHE.get(host);
  if (cached && Date.now() - cached.at < CACHE_TTL) return json({ ...cached.data, cached: true });

  // Only real runs (which cost a scan + AI) count against the limit.
  const ip = ipOf(request);
  if (isLimited(ip, { key: "verdict", max: MAX_PER_WINDOW, windowMs: WINDOW_MS })) return json(limitedResponse("a verdict"), 429);

  try {
    const result = await publicVerdict(url, { ctx: { tag: "verdict" } });
    if (!result.ok) return json(result, statusFor(result.reason));
    if (result.host) CACHE.set(result.host, { at: Date.now(), data: result });
    return json(result);
  } catch {
    return json({ ok: false, reason: "error", message: "Something went wrong running your verdict. Try again in a moment." }, 500);
  }
}

function statusFor(reason) {
  if (reason === "no_ai_engine") return 503;
  if (reason === "bad_url" || reason === "blocked_url" || reason === "bad_status" || reason === "no_questions") return 422;
  return 422;
}
function hostGuess(u) {
  try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
