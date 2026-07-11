// lib/links.js
// ── TRACKED LINKS ──
// Turn any URL into a short, attributable link (/l/<id>) that logs a click then
// redirects. This closes the funnel across EVERY channel — including ones where
// UTM can't reach. Elegantly graceful: if the link can't be created (no APP_URL,
// table missing, offline), it returns the plain UTM-tagged URL, which is still
// attributable. So callers never have to branch.

import crypto from "crypto";
import { taggedLink } from "@/lib/attribution";

function shortId() { return crypto.randomBytes(6).toString("base64url"); } // ~8 chars

// Returns a short /l/<id> URL, or (fallback) the UTM-tagged destination.
export async function createTrackedLink(supabase, { userId = null, host = null, url, channel = "genie", ref = null }) {
  if (!url) return url;
  // The stored destination still carries UTM so the site's own analytics sees it.
  const dest = taggedLink(url, { channel, campaign: host || channel, ref: ref || "" });
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  if (!supabase || !base) return dest;
  try {
    const id = shortId();
    const { error } = await supabase.from("links").insert({ id, user_id: userId, host, url: dest, channel, ref });
    if (error) return dest;
    return `${base}/l/${id}`;
  } catch {
    return dest;
  }
}

export async function resolveLink(supabase, id) {
  try {
    const { data } = await supabase.from("links").select("user_id, host, url, channel, ref").eq("id", id).maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}
