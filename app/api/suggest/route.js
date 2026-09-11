// app/api/suggest/route.js
// What to type in the search box on Buyer Hunt, Get Featured and Find clients,
// built from this user's own scan rather than from examples someone hardcoded.
//
// GET /api/suggest?for=featured|prospects|hunt
//
// The deterministic pass in lib/suggest.js does the work and costs nothing, so it
// always runs. A model is only asked when that pass comes back thin — a site that
// never says who it sells to, or a scan old enough to predate the richer fields —
// and the answer is cached, because what a business sells does not change between
// page loads.

import { createClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai-router";
import { cacheGet, cacheSet } from "@/lib/cache";
import { classifyEntity } from "@/lib/entity";
import { verticalsFor } from "@/lib/intent-verticals";
import { hostOf } from "@/lib/business";
import { nicheSuggestions, targetSuggestions, rivalSuggestions, cleanNiche } from "@/lib/suggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SURFACES = new Set(["featured", "prospects", "hunt"]);
const ENOUGH = 3;                       // below this, it is worth one model call
const TTL_MS = 12 * 60 * 60 * 1000;     // a business does not change what it sells by lunchtime

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const surface = String(new URL(request.url).searchParams.get("for") || "featured").toLowerCase();
  if (!SURFACES.has(surface)) return json({ ok: false, error: "Unknown surface." }, 400);

  let ai = {}, host = "";
  try {
    const { data: scan } = await supabase.from("scans").select("ai, final_url, url")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { ai = scan.ai || {}; host = hostOf(scan); }
  } catch {}

  // No scan yet means there is nothing honest to suggest. Say that plainly rather
  // than falling back to invented examples, which is the bug this route exists to
  // remove — the page can then point them at the scan instead.
  if (!host) return json({ ok: true, surface, suggestions: [], needsScan: true });

  let keywords = [];
  if (surface === "featured") {
    try {
      const { data } = await supabase.from("keywords")
        .select("keyword, volume, priority").eq("user_id", user.id).eq("host", host).limit(40);
      keywords = data || [];
    } catch {
      // The volume column is optional (db/keyword-volume.sql). Retry without it so
      // a missing column costs the ordering, not the whole suggestion list.
      try {
        const { data } = await supabase.from("keywords")
          .select("keyword, priority").eq("user_id", user.id).eq("host", host).limit(40);
        keywords = data || [];
      } catch {}
    }
  }

  let vertical = null;
  try { vertical = verticalsFor(classifyEntity(ai), ai); } catch {}

  let suggestions =
    surface === "hunt" ? rivalSuggestions({ ai })
    : surface === "prospects" ? targetSuggestions({ ai })
    : nicheSuggestions({ ai, keywords, vertical });

  let source = "site";
  if (suggestions.length < ENOUGH) {
    const extra = await modelSuggestions({ surface, ai, host, have: suggestions });
    if (extra.length) {
      suggestions = dedupe([...suggestions, ...extra]).slice(0, surface === "hunt" ? 6 : 6);
      source = suggestions.length && suggestions.every((s) => s.inferred) ? "inferred" : "mixed";
    }
  }

  return json({ ok: true, surface, host, suggestions, source, needsScan: false });
}

// One cached call, free engines only. Kept narrow on purpose: it is asked for the
// same shape the deterministic pass produces, so the UI never has to care which
// one a chip came from beyond the `why` line it shows.
async function modelSuggestions({ surface, ai, host, have }) {
  const key = `suggest:${surface}:${host}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const brief = [
    ai.businessName ? `Business: ${ai.businessName}` : "",
    ai.whatTheySell ? `Sells: ${ai.whatTheySell}` : "",
    ai.industry || ai.subCategory ? `Category: ${ai.subCategory || ai.industry}` : "",
    ai.targetCustomer ? `Customers: ${ai.targetCustomer}` : "",
    ai.primaryMarket ? `Market: ${ai.primaryMarket}` : "",
    `Website: ${host}`,
  ].filter(Boolean).join("\n");

  const ASK = {
    featured: `5 short topic phrases naming the SPACE this business is in — the kind of phrase a blogger would use in a "best ..." roundup or a buying guide this business deserves to appear in. Bare noun phrases, 2 to 4 words, no "best", no "near me", no brand names.`,
    prospects: `5 short phrases naming KINDS OF COMPANY this business could sell to. A group of businesses, never one named company, 2 to 5 words, e.g. "independent furniture stores".`,
    hunt: `5 real, currently-operating competitor brands of this business. Real company names only — return an empty list if you are not confident, never invented names.`,
  };

  try {
    const r = await callAI({
      only: ["gemini", "groq", "openrouter"],   // suggestions are not worth paid budget
      json: true, temperature: 0.3, maxTokens: 400, timeoutMs: 9000,
      system: "You suggest search terms for a marketing tool. Terse, concrete, no explanations, never invent a company that does not exist.",
      prompt: `${brief}\n\n${ASK[surface]}\n${have.length ? `Already suggested, do not repeat: ${have.map((h) => h.text).join(", ")}\n` : ""}\nReturn ONLY JSON: {"items":["",""]}`,
    });
    const items = Array.isArray(r.json?.items) ? r.json.items : [];
    const out = items
      .map((s) => String(s || "").trim())
      .filter((s) => s && s.length <= 48 && s.split(/\s+/).length <= 5)
      .slice(0, 5)
      .map((s) => ({
        // Rivals keep their capitalisation; a niche is a search term, so it is
        // normalised the same way the deterministic pass normalises one.
        text: surface === "hunt" ? s : cleanNiche(s),
        why: surface === "hunt" ? "a likely rival in your category" : "Genie's read of your market",
        inferred: true,
      }))
      .filter((s) => s.text);
    cacheSet(key, out, TTL_MS);
    return out;
  } catch {
    return [];
  }
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const k = String(s.text || "").toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
