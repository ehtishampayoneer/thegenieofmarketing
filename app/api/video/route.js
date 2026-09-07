// app/api/video/route.js
// ── ONE VIDEO IN, A DOZEN PIECES OF MARKETING OUT ──
// Three ways in, because only one of them is reliable everywhere:
//   • upload  — a file already in private storage. Transcribed by Groq Whisper.
//   • paste   — the owner pastes a transcript. Always works, needs nothing.
//   • link    — a YouTube or Vimeo URL. We take the public oEmbed metadata, but
//               NOT the captions: YouTube blocks datacenter IPs and adds bot
//               detection, so a caption scraper works locally and fails the
//               moment it deploys. Rather than ship that, a link on its own is
//               answered honestly and paired with a paste box.
//
// Everything produced lands in the normal Approvals queue as ordinary article
// and social_post actions, so it inherits publishing, the content guard and the
// autonomy rules with no special cases.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostOf } from "@/lib/business";
import { logActivity } from "@/lib/activity";
import { recordEvent } from "@/lib/events";
import {
  parseVideoUrl, fetchVideoMeta, transcribeAudio,
  buildAssets, assetsToActions, toVTT, MEDIA_BUCKET,
} from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const userId = user.id;

  let body = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }

  const source = body.url ? parseVideoUrl(body.url) : null;
  if (body.url && !source) {
    return json({ ok: false, error: "That does not look like a YouTube or Vimeo link." }, 400);
  }
  const meta = source ? await fetchVideoMeta(source) : { title: body.title || null, url: null, thumbnail: null };

  // ── 1. Get the words ───────────────────────────────────────────────────────
  let transcript = String(body.transcript || "").trim();
  let segments = [];
  let duration = 0;

  if (!transcript && body.path) {
    const admin = createAdminClient();
    const { data: file, error } = await admin.storage.from(MEDIA_BUCKET).download(body.path);
    if (error || !file) return json({ ok: false, error: "Genie could not read that upload. Try uploading again." }, 400);

    const bytes = Buffer.from(await file.arrayBuffer());
    const t = await transcribeAudio(bytes, body.path.split("/").pop(), body.type || "video/mp4");
    if (!t.ok) return json({ ok: false, error: t.error, detail: t.detail || null }, 400);

    transcript = t.text;
    segments = t.segments;
    duration = t.duration;

    // The raw file has done its job. Keeping a customer's video around forever
    // is storage we do not need and data we should not hold.
    try { await admin.storage.from(MEDIA_BUCKET).remove([body.path]); } catch {}
  }

  if (!transcript) {
    // A link on its own cannot produce a transcript. Say so plainly, and say
    // exactly what to do instead, rather than failing with a vague error.
    return json({
      ok: false,
      needsTranscript: true,
      meta,
      error: source
        ? "Genie cannot pull captions from YouTube directly, because YouTube blocks requests from servers. Open your video, click the three dots then Show transcript, copy it, and paste it below. Or upload the file and Genie will transcribe it."
        : "Give Genie a file to transcribe, or paste a transcript.",
    }, 200);
  }
  if (transcript.length < 200) {
    return json({ ok: false, error: "That transcript is too short to build anything useful from." }, 400);
  }

  // ── 2. Who is this for ─────────────────────────────────────────────────────
  let ai = {}, host = null, scanId = null;
  try {
    const { data: scan } = await supabase.from("scans").select("id, ai, final_url, url")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (scan) { ai = scan.ai || {}; host = hostOf(scan); scanId = scan.id || null; }
  } catch {}

  let profile = {}, moneyPage = null;
  try {
    const { data: p } = await supabase.from("profiles")
      .select("company_name, company_pitch, money_page_url").eq("id", userId).maybeSingle();
    if (p) { profile = p; moneyPage = p.money_page_url || null; }
  } catch {}

  // ── 3. Turn the words into the work ────────────────────────────────────────
  const built = await buildAssets({ transcript, segments, meta, ai, profile, moneyPage });
  if (!built.ok) return json({ ok: false, error: built.error }, 502);
  const data = built.data;

  // ── 4. Stage the publishable pieces ────────────────────────────────────────
  const rows = assetsToActions({ userId, host, data, meta, scanId });
  let staged = 0;
  if (rows.length) {
    try {
      const admin = createAdminClient();
      const { data: ins } = await admin.from("actions").insert(rows).select("id");
      staged = (ins || []).length;
    } catch {}
  }

  // ── 5. Keep the facts ──────────────────────────────────────────────────────
  // The most valuable output. A person talking about their own business states
  // things no competitor's page contains, and Genie's writing is only as
  // original as the facts it holds. Appended, never overwritten.
  // Stored where the content engine already looks: growth_memory under the
  // "first_party" key, in the same shape /api/expertise writes. Appended to the
  // "data" field and de-duplicated, so running a second video adds to what the
  // owner typed rather than replacing it.
  const facts = Array.isArray(data.facts) ? data.facts.filter(Boolean).map((f) => String(f).trim()).slice(0, 12) : [];
  let factsSaved = 0;
  if (facts.length && host) {
    try {
      const { data: prev } = await supabase.from("growth_memory")
        .select("meta").eq("user_id", userId).eq("host", host).eq("mkey", "first_party").limit(1).maybeSingle();
      const existingMeta = prev?.meta || {};
      const existing = String(existingMeta.data || "").trim();
      const already = new Set(existing.split("\n").map((l) => l.replace(/^-\s*/, "").trim().toLowerCase()));
      const fresh = facts.filter((f) => f && !already.has(f.toLowerCase()));
      if (fresh.length) {
        const merged = [existing, ...fresh.map((f) => `- ${f}`)].filter(Boolean).join("\n").slice(0, 600);
        await supabase.from("growth_memory").upsert(
          {
            user_id: userId, host, mkey: "first_party", weight: 3,
            insight: "First-party facts on file, including details Genie pulled from the owner's own video.",
            meta: { ...existingMeta, data: merged, updatedAt: new Date().toISOString() },
          },
          { onConflict: "user_id,host,mkey" }
        );
        factsSaved = fresh.length;
      }
    } catch {}
  }

  // ── 6. Say what happened ───────────────────────────────────────────────────
  try {
    await logActivity(supabase, userId, {
      host, verb: "discovered",
      message: `Turned your video into ${staged} publish-ready piece${staged === 1 ? "" : "s"}`,
      detail: meta.title || "From your upload",
      meta: { source: "video", staged, facts: factsSaved },
    });
    await recordEvent(supabase, {
      userId, host, type: "activity.video_repurposed", actor: "genie",
      subject: meta.title || "video",
      data: { staged, facts: factsSaved, clips: (data.clips || []).length, duration },
    });
  } catch {}

  return json({
    ok: true,
    staged,
    truncated: !!built.truncated,
    meta,
    duration,
    summary: data.summary || null,
    targetKeyword: data.targetKeyword || null,
    article: data.article ? { title: data.article.title, metaDescription: data.article.metaDescription } : null,
    faq: data.faq || [],
    chapters: data.chapters || [],
    clips: data.clips || [],
    social: data.social || {},
    facts,
    factsSaved,
    // Built from Whisper's own timings, so it is genuinely in sync. Returned as
    // text for the UI to offer as a download; captions are one of the few things
    // that lift a video on YouTube for free.
    vtt: segments.length ? toVTT(segments) : null,
    // YouTube chapters must start at 0:00 to be accepted, so the first is forced.
    youtubeChapters: (data.chapters || []).length
      ? (data.chapters || []).map((c, i) => `${i === 0 ? "0:00" : c.time} ${c.label}`).join("\n")
      : null,
    transcriptChars: transcript.length,
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
