// app/api/video/upload-url/route.js
// ── A DOOR AROUND THE 4.5MB WALL ──
// Vercel caps a serverless request body at 4.5MB, which even a one-minute video
// blows through, so the file cannot be POSTed to Genie at all. Instead the server
// mints a short-lived signed upload URL and the browser uploads straight to
// Supabase Storage. The bytes never pass through a Vercel function.
//
// The bucket is PRIVATE: a customer's raw video is their material, not something
// to publish. Genie reads it once, with the service role, to transcribe it.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCEPTED, MAX_AUDIO_BYTES, MEDIA_BUCKET } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-exported for the client helper; the value itself lives in lib/video.js.
export const BUCKET = MEDIA_BUCKET;

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let body = {};
  try { body = await request.json(); } catch {}
  const name = String(body.name || "upload").slice(0, 120).replace(/[^\w.\-]/g, "_");
  const type = String(body.type || "video/mp4");
  const size = Number(body.size || 0);

  if (!ACCEPTED.includes(type)) {
    return json({ ok: false, error: "Please upload a video or audio file (MP4, MOV, WEBM, MP3, M4A, WAV)." }, 400);
  }
  // Checked here as well as client-side, because the client can be bypassed and
  // an oversized file would only fail later, after a long upload.
  if (size > MAX_AUDIO_BYTES) {
    return json({
      ok: false,
      tooLarge: true,
      error: `That file is ${(size / 1048576).toFixed(0)}MB and the limit is 25MB. Upload just the audio track, or paste the transcript instead.`,
    }, 400);
  }

  const admin = createAdminClient();
  // Private, unlike the public "brand" bucket used for logos.
  try { await admin.storage.createBucket(MEDIA_BUCKET, { public: false }); } catch {}

  const path = `${user.id}/${Date.now()}-${name}`;
  const { data, error } = await admin.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, path, token: data.token, bucket: MEDIA_BUCKET });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
