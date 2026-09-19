// app/api/launch/route.js
// The launch list: places worth being listed on, sorted for this business, with
// the copy to paste and a record of what is done.
//
// GET  ?all=1          -> places (best fit first), what is done, and the launch kit
// POST { fresh? }      -> write the launch kit (one AI call, kept in the ledger)
// PUT  { placeId, state: "submitted" | "live" | "skipped" | "undo", url? }
//                      -> the owner's tick. Latest state per place wins.
//
// Nothing here submits anything. Nearly every place needs the owner's own account
// and many check for bots, so Genie writes, opens the page, and keeps count.

import { createClient } from "@/lib/supabase/server";
import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { recordEvent, getEvents } from "@/lib/events";
import { hostOf } from "@/lib/business";
import { businessFits, placesFor, kitPrompt, normalizeKit, PLACE_INDEX } from "@/lib/launch-places";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const STATES = new Set(["submitted", "live", "skipped", "undo"]);

async function context() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };
  let host = "", ai = {};
  try {
    const { data } = await supabase.from("scans").select("final_url, url, ai")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) { host = hostOf(data); ai = data.ai || {}; }
  } catch {}
  return { supabase, user, host, ai };
}

export async function GET(request) {
  const { supabase, user, host, ai } = await context();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  if (!host) return json({ ok: true, state: "no_site" });
  const all = new URL(request.url).searchParams.get("all") === "1";

  const fits = businessFits(ai);
  const events = await getEvents(supabase, { userId: user.id, host, types: ["launch.kit", "launch.place"], limit: 1000 });
  const kit = events.find((e) => e.type === "launch.kit")?.data?.kit || null;

  // Newest first, so the first state seen for a place is its current one.
  const status = {};
  for (const e of events) {
    if (e.type !== "launch.place") continue;
    const id = e.data?.placeId;
    if (!id || id in status) continue;
    status[id] = e.data.state === "undo" ? null : { state: e.data.state, url: e.data.url || null, at: e.created_at };
  }

  const places = placesFor(fits, { all }).map((p) => ({ ...p, status: status[p.id] || null }));
  const done = Object.values(status).filter((s) => s && s.state !== "skipped").length;
  return json({
    ok: true, host, fits, kit, places, done,
    total: placesFor(fits).length,
    // A few a day, best first: launching everywhere in one afternoon looks like
    // spam to the sites and wastes the launch days that matter.
    today: places.filter((p) => !p.status).slice(0, 5).map((p) => p.id),
  });
}

export async function POST(request) {
  const { supabase, user, host, ai } = await context();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  if (!host) return json({ ok: false, error: "Scan your website first." }, 400);
  let body = {};
  try { body = await request.json(); } catch {}

  if (!body?.fresh) {
    const saved = await getEvents(supabase, { userId: user.id, host, types: ["launch.kit"], limit: 1 });
    if (saved[0]?.data?.kit) return json({ ok: true, kit: saved[0].data.kit, cached: true });
  }

  let kit;
  try {
    const r = await callAI({
      system: "You write listing copy for launch sites and directories. Specific, plain and honest; never invent facts. Return ONLY valid JSON.",
      prompt: kitPrompt(ai, host), json: true, maxTokens: 3500, temperature: 0.5, timeoutMs: 60000,
      ctx: { supabase, userId: user.id, host, tag: "launch-kit" },
    });
    kit = normalizeKit(r.json || {});
  } catch (e) {
    if (e instanceof AllProvidersFailedError) return json({ ok: false, retryable: true, error: "Every AI is busy right now. Try again in a minute." }, 503);
    return json({ ok: false, error: "Couldn't write the launch kit just now." }, 500);
  }
  if (!kit.tagline || !kit.short) return json({ ok: false, error: "Nothing usable came back. Try again." }, 502);

  await recordEvent(supabase, { userId: user.id, host, type: "launch.kit", actor: "genie", subject: kit.tagline, data: { kit } });
  return json({ ok: true, kit });
}

export async function PUT(request) {
  const { supabase, user, host } = await context();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  let body = {};
  try { body = await request.json(); } catch {}
  const placeId = String(body?.placeId || "");
  const state = String(body?.state || "");
  const place = PLACE_INDEX[placeId];
  if (!place) return json({ ok: false, error: "Unknown place." }, 400);
  if (!STATES.has(state)) return json({ ok: false, error: "Unknown state." }, 400);
  let url = null;
  if (body?.url) {
    url = String(body.url).trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch { return json({ ok: false, error: "That doesn't look like a web address." }, 400); }
  }

  await recordEvent(supabase, {
    userId: user.id, host, type: "launch.place", actor: "human", subject: place.name,
    data: { placeId, state, url, kind: place.kind },
  });
  // "It's live": Genie opens the listing and looks for the link to the site. Only
  // a link it has seen counts as earned, the same rule as every other link in
  // Genie (lib/backlinks.js), so the numbers stay earned, not claimed.
  let link = null;
  if (state === "live" && url) {
    try {
      const { findLinkTo } = await import("@/lib/backlinks");
      const u = new URL(url);
      const hit = await findLinkTo(url, host, { paths: [u.pathname + u.search] });
      if (hit?.found) {
        const domain = u.hostname.replace(/^www\./, "");
        link = { found: true, nofollow: !!hit.nofollow };
        await recordEvent(supabase, {
          userId: user.id, host, type: "link.earned", actor: "genie", subject: domain,
          data: { domain, company: place.name, play: "launch", page: hit.page, href: hit.href, anchor: hit.anchor, nofollow: !!hit.nofollow },
          dedupeKey: `link:${host}:${domain}`,
        });
      } else link = { found: false };
    } catch { link = { found: false }; }
  }
  return json({ ok: true, placeId, state, link });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
