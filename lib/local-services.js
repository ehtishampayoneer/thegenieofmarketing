// lib/local-services.js
// ── LOCAL SERVICE OPTIMIZER ──
// For local / home-service businesses. Google's local algorithm rewards RELEVANCE:
// when your Google Business Profile service names + descriptions explicitly pair the
// service with your city ("Roman Shades St. Catharines"), you match more "near me"
// searches and rank higher in the map pack. Genie derives your high-value services
// from your business profile, tags each with your city, and writes a tight ~300-char
// description (the length GBP shows in full). You paste them into your GBP — the
// service API is gated, so this is draft-and-you-apply, like our GBP posts.

import { callAI } from "@/lib/ai-router";
import { deDash } from "@/lib/markdown";

const MEMKEY = "local_services";

// Generate the optimized, city-tagged service list. `city` is required (the user
// knows it; the whole tactic is city-specific). Persists the latest set as an action
// so the /local surface can show it again without regenerating.
export async function buildLocalServices(supabase, userId, host, ai = {}, { city, services = [] } = {}) {
  const town = String(city || "").trim();
  if (!town) return { ok: false, reason: "no_city" };

  const known = Array.isArray(services) ? services.filter(Boolean).slice(0, 20) : [];
  let out = {};
  try {
    const res = await callAI({
      system: "You are Genie, a local SEO expert optimizing a Google Business Profile. Write like a real person, no em-dashes, no fluff. Return ONLY valid JSON.",
      json: true, maxTokens: 1800, temperature: 0.5,
      prompt:
`Business: ${ai.businessName || "the business"}${ai.industry ? ` (${ai.industry})` : ""}.
What they sell / do: ${ai.whatTheySell || ai.keyProducts || ""}.
${ai.keyProducts ? `Key services/products: ${ai.keyProducts}.` : ""}
City to target: "${town}".
${known.length ? `Their current service list: ${known.join(", ")}.` : "Derive their real, sellable services from the business above."}

Produce their Google Business Profile services, optimized for local "near me" search. Rules:
- Pick up to 10 real, HIGH-VALUE services this business actually offers (money-makers first).
- For each, make a "cityTagged" name = the service name followed by the city, e.g. "Roman Shades ${town}".
- Write a "description" UNDER 300 characters that includes both the service AND the city naturally, sounds human (not keyword-stuffed), and gives one concrete reason to choose them.
- Use ONLY the city "${town}". Never invent other cities.

Return ONLY this JSON:
{ "services": [ { "service": "plain service name", "cityTagged": "Service ${town}", "description": "under 300 chars, human, includes service + ${town}" } ] }`,
    });
    out = res.json || {};
  } catch { return { ok: false, reason: "ai_failed" }; }

  const list = (Array.isArray(out.services) ? out.services : [])
    .map((s) => ({
      service: deDash(String(s?.service || "").trim()).slice(0, 120),
      cityTagged: deDash(String(s?.cityTagged || "").trim()).slice(0, 140),
      description: deDash(String(s?.description || "").trim()).slice(0, 300),
    }))
    .filter((s) => s.service && s.description)
    .slice(0, 12);
  if (!list.length) return { ok: false, reason: "empty" };

  // Persist the latest set (best-effort) so the surface can re-show it.
  try {
    await supabase.from("actions").insert({
      user_id: userId, type: MEMKEY,
      title: `Local services for ${town}`,
      payload: { city: town, services: list, generatedAt: new Date().toISOString() },
      target: { platform: "gbp", host: host || null },
      status: "proposed",
    });
  } catch {}

  try {
    const { logActivity } = await import("@/lib/activity");
    await logActivity(supabase, userId, {
      host, verb: "writing", icon: "📍",
      message: `Optimized ${list.length} Google Business services for "${town}" (near-me search)`,
      detail: "City-tagged service names + descriptions, ready to paste into your Google Business Profile.",
      meta: { local: true, city: town, count: list.length },
    });
  } catch {}

  return { ok: true, city: town, services: list };
}

// Read the most recently generated set for this user+host (or null).
export async function latestLocalServices(supabase, userId, host) {
  try {
    let q = supabase.from("actions").select("payload, created_at").eq("user_id", userId).eq("type", MEMKEY).order("created_at", { ascending: false }).limit(1);
    const { data } = await q.maybeSingle();
    if (data?.payload?.services?.length) return { city: data.payload.city || null, services: data.payload.services, at: data.created_at };
  } catch {}
  return null;
}
