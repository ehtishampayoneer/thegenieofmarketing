// app/api/verdict/route.js
// ── PUBLIC AI-VERDICT ENDPOINT (the growth hook) ──
// Anonymous, no auth. Anyone pastes a URL and learns whether the real AI models
// recommend them or a competitor. Guardrails, because it triggers live scans + AI:
//   • per-IP rate limit (in-memory; upgrade to Redis at scale like ai-router),
//   • per-host result cache (repeat views are free and don't burn the limit),
//   • free engines only (runVerdict allowPaid:false, set in lib/verdict),
//   • SSRF-safe scan (runAudit → safeFetch).
// Fails honestly: if no AI model is reachable it says so, never a fake "0%".

import { publicVerdict } from "@/lib/verdict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_MS = 10 * 60 * 1000; // 10 min
const MAX_PER_WINDOW = 5;         // verdicts per IP per window
const CACHE_TTL = 30 * 60 * 1000; // 30 min

const RL = new Map();    // ip -> [timestamps]
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
  if (isLimited(ip)) return json({ ok: false, reason: "rate_limited", message: "You've run a few verdicts already — give it a couple of minutes and try again." }, 429);

  try {
    const result = await publicVerdict(url, { ctx: { tag: "verdict" } });
    if (!result.ok) return json(result, statusFor(result.reason));
    if (result.host) CACHE.set(result.host, { at: Date.now(), data: result });
    return json(result);
  } catch {
    return json({ ok: false, reason: "error", message: "Something went wrong running your verdict. Try again in a moment." }, 500);
  }
}

function ipOf(req) {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "anon";
}
function isLimited(ip) {
  const now = Date.now();
  const arr = (RL.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) { RL.set(ip, arr); return true; }
  arr.push(now); RL.set(ip, arr);
  return false;
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
