// lib/images.js
// ── HERO IMAGE GENERATION (optional, graceful) ──
// The Content Engine already writes an `imagePrompt` for every article. This turns
// that prompt into a real hero image and stores it in Supabase Storage, so
// published articles ship complete instead of text-only.
//
// Provider-agnostic + env-gated, exactly like the paid LLM fallback in ai-router:
//   1) an OpenAI-compatible images endpoint  (IMAGE_API_KEY [+ IMAGE_API_BASE / IMAGE_MODEL])
//   2) Gemini Imagen                          (GEMINI_API_KEY — the free key, best-effort)
// If neither is configured, generateImage returns { ok:false } and callers publish
// text-only — NOTHING breaks. Never throws.

const BUCKET = "brand"; // reuse the existing public bucket (see app/api/upload/logo)

export async function generateImage(prompt, { size = "1536x1024" } = {}) {
  const clean = String(prompt || "").trim().slice(0, 900);
  if (!clean) return { ok: false, reason: "no_prompt" };

  // 1) OpenAI-compatible images API (OpenAI gpt-image-1 by default; any compatible host).
  const key = process.env.IMAGE_API_KEY;
  if (key) {
    try {
      const base = (process.env.IMAGE_API_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
      const model = process.env.IMAGE_MODEL || "gpt-image-1";
      const res = await fetch(`${base}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, prompt: clean, size, n: 1 }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const j = await res.json();
        const b64 = j?.data?.[0]?.b64_json;
        if (b64) return { ok: true, buffer: Buffer.from(b64, "base64"), contentType: "image/png", provider: "openai-compatible" };
        const url = j?.data?.[0]?.url;
        if (url) { const img = await fetchBytes(url); if (img) return { ok: true, ...img, provider: "openai-compatible" }; }
      }
    } catch {}
  }

  // 2) Gemini Imagen (uses the same free Gemini key; best-effort, version-sensitive).
  const gkey = process.env.GEMINI_API_KEY;
  if (gkey) {
    try {
      const model = process.env.IMAGEN_MODEL || "imagen-3.0-generate-002";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${gkey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances: [{ prompt: clean }], parameters: { sampleCount: 1, aspectRatio: "16:9" } }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const j = await res.json();
        const b64 = j?.predictions?.[0]?.bytesBase64Encoded || j?.predictions?.[0]?.image?.bytesBase64Encoded;
        if (b64) return { ok: true, buffer: Buffer.from(b64, "base64"), contentType: "image/png", provider: "imagen" };
      }
    } catch {}
  }

  return { ok: false, reason: "no_image_provider" };
}

// Generate + store a hero image; returns a public URL, or null (graceful — the
// article then publishes text-only). `admin` must be the service-role client.
export async function generateHeroImage(admin, userId, prompt, { size } = {}) {
  const gen = await generateImage(prompt, { size });
  if (!gen.ok || !gen.buffer) return null;
  try {
    try { await admin.storage.createBucket(BUCKET, { public: true }); } catch {}
    const ext = (gen.contentType.split("/")[1] || "png").replace("jpeg", "jpg");
    const path = `${userId}/hero-${Date.now()}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, gen.buffer, { contentType: gen.contentType, upsert: true });
    if (error) return null;
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

async function fetchBytes(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    return { buffer: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get("content-type") || "image/png" };
  } catch { return null; }
}
