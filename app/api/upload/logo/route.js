// app/api/upload/logo/route.js
// Lets a user upload their logo as an image file (instead of pasting a URL). The
// file is stored in a public Supabase Storage bucket via the service role and we
// return its public URL, which is saved to the profile (used atop outreach emails).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUCKET = "brand";
const MAX_BYTES = 3 * 1024 * 1024; // 3MB
const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  let form;
  try { form = await request.formData(); } catch { return json({ ok: false, error: "Invalid upload." }, 400); }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ ok: false, error: "No file provided." }, 400);
  if (file.size > MAX_BYTES) return json({ ok: false, error: "Image is too large (max 3MB)." }, 400);
  const type = file.type || "image/png";
  if (!OK_TYPES.includes(type)) return json({ ok: false, error: "Please upload a PNG, JPG, WEBP or SVG." }, 400);

  const admin = createAdminClient();
  // Ensure the public bucket exists (no-op if it already does).
  try { await admin.storage.createBucket(BUCKET, { public: true }); } catch {}

  const ext = (type.split("/")[1] || "png").replace("svg+xml", "svg").replace("jpeg", "jpg");
  const path = `${user.id}/logo-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: true });
  if (error) return json({ ok: false, error: error.message }, 500);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return json({ ok: true, url: data.publicUrl });
}

function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
