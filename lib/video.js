// lib/video.js
// ── WHAT A VIDEO GIVES GENIE ──
// Four things, and deliberately only four: captions, chapters, clip picks, and
// the facts the owner states out loud.
//
// It used to also write an article and social posts from the transcript. That
// was removed on purpose: the content engine already produces both, from the
// keyword strategy, with images, and better targeted. Two engines writing into
// the same Approvals queue from different starting points is how you end up with
// near-duplicate content competing with itself.
//
// What is left is the part nothing else in Genie does. Captions and chapters are
// video-specific and free wins on YouTube. Clip picks need real timestamps.
//
// And the quiet one, which is the reason this page earns its place: a transcript
// of the owner talking about their own business is the richest first-party
// material Genie can get. It is exactly the "information gain" the content engine
// is usually starved of, and almost nobody types it into Settings by hand. So the
// video does not produce content itself, it makes every article Genie writes
// afterwards more original.
//
// All of it flows from the transcript, so none of it needs video processing:
// no ffmpeg, no encoding, no separate worker. That matters, because Vercel
// functions cap at a 250MB bundle and a 4.5MB payload with a disposable
// filesystem, so transcoding is not possible on this hosting anyway.
//
// WHAT WE DELIBERATELY DO NOT DO
// Scrape YouTube for captions. YouTube blocks datacenter IPs hard (every Vercel
// region included) and added proof-of-origin bot detection on top, so a scraper
// works on a laptop and fails in production. Rather than ship something that
// breaks the moment it deploys, the YouTube path fetches only public oEmbed
// metadata (which is a supported endpoint) and asks for the transcript by the
// two routes that always work: an uploaded file, or a paste.

import { callAI } from "@/lib/ai-router";

// Groq hosts Whisper and is already configured in the AI router, so
// transcription costs nothing extra and needs no new key. The free tier allows
// 2,000 requests a day and runs far faster than real time.
const GROQ_TRANSCRIBE = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";

// Groq's free tier rejects anything over 25MB. Enforced here so the user gets a
// clear message up front instead of a failed upload minutes later.
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Private bucket for uploads. A customer's raw footage is their material, so
// unlike the public "brand" bucket used for logos this one is never readable
// from the web, and the file is deleted the moment it has been transcribed.
export const MEDIA_BUCKET = "media";

export const ACCEPTED = [
  "video/mp4", "video/quicktime", "video/webm", "video/x-matroska",
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/x-m4a", "audio/ogg",
];

// ── Source parsing ───────────────────────────────────────────────────────────
export function parseVideoUrl(raw) {
  const url = String(raw || "").trim();
  if (!url) return null;
  let u;
  try { u = new URL(url.startsWith("http") ? url : `https://${url}`); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? { platform: "youtube", id, url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host.endsWith("youtube.com")) {
    const id = u.searchParams.get("v") || u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/)?.[1];
    return id ? { platform: "youtube", id, url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host.endsWith("vimeo.com")) {
    const id = u.pathname.split("/").filter(Boolean).pop();
    return /^\d+$/.test(id || "") ? { platform: "vimeo", id, url: `https://vimeo.com/${id}` } : null;
  }
  return null;
}

// Public oEmbed. A documented endpoint, not scraping, so it is stable and needs
// no key. Gives the title, channel and thumbnail, which is enough to write the
// page around even when the transcript arrives separately.
export async function fetchVideoMeta(source) {
  if (!source) return null;
  const endpoint = source.platform === "vimeo"
    ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(source.url)}`
    : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(source.url)}`;
  try {
    const r = await fetch(endpoint, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return { ...source, title: null, author: null, thumbnail: null };
    const j = await r.json();
    return {
      ...source,
      title: j.title || null,
      author: j.author_name || null,
      thumbnail: j.thumbnail_url || null,
    };
  } catch {
    return { ...source, title: null, author: null, thumbnail: null };
  }
}

// ── Transcription ────────────────────────────────────────────────────────────
// Returns { text, segments:[{start,end,text}] }. Segment timestamps come from
// Whisper itself, never from the language model — chapters and clip picks have
// to point at moments that genuinely exist, and an LLM asked to invent a
// timestamp will happily do so.
export async function transcribeAudio(bytes, filename = "audio.mp4", contentType = "video/mp4") {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, error: "Transcription is not configured (GROQ_API_KEY is missing)." };
  if (!bytes?.byteLength) return { ok: false, error: "That file appears to be empty." };
  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return { ok: false, error: `That file is ${(bytes.byteLength / 1048576).toFixed(0)}MB. The limit is 25MB, so please upload the audio track instead of the full video, or paste the transcript.` };
  }

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), filename);
  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  try {
    const r = await fetch(GROQ_TRANSCRIBE, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(180000),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return { ok: false, error: `Transcription failed (${r.status}).`, detail: detail.slice(0, 300) };
    }
    const j = await r.json();
    // Fractional times are kept as Whisper reported them. Rounding here would
    // throw away the precision the caption file needs; stamp() rounds only for
    // display, where whole seconds are what a human wants to read.
    const segments = (j.segments || []).map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: String(s.text || "").trim(),
    })).filter((s) => s.text);
    return { ok: true, text: String(j.text || "").trim(), segments, duration: Math.round(j.duration || 0) };
  } catch (e) {
    return { ok: false, error: "Transcription timed out or the connection dropped." };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export const stamp = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = n % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

// A WebVTT caption file the owner uploads to YouTube. Built from Whisper's own
// segment timings, so it is genuinely in sync rather than estimated.
export function toVTT(segments = []) {
  // Millisecond precision, not whole seconds. Whisper reports fractional times
  // and captions that drift half a second are noticeably out of sync on a short.
  const t = (s) => {
    const n = Math.max(0, Number(s) || 0);
    const h = String(Math.floor(n / 3600)).padStart(2, "0");
    const m = String(Math.floor((n % 3600) / 60)).padStart(2, "0");
    const sec = String(Math.floor(n % 60)).padStart(2, "0");
    const ms = String(Math.round((n % 1) * 1000)).padStart(3, "0");
    return `${h}:${m}:${sec}.${ms}`;
  };
  const cues = segments.map((s, i) => `${i + 1}\n${t(s.start)} --> ${t(s.end)}\n${s.text}`);
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

// Whisper on a long video produces more text than a model should be asked to
// reason over at once. Trim from the middle rather than the end, because the
// close of a video usually carries the offer and the call to action.
function fitTranscript(text, limit = 14000) {
  const t = String(text || "");
  if (t.length <= limit) return { text: t, truncated: false };
  const head = Math.floor(limit * 0.65), tail = limit - head;
  return { text: `${t.slice(0, head)}\n\n[...middle of the transcript omitted...]\n\n${t.slice(-tail)}`, truncated: true };
}

// A compact, timestamped outline the model can pick real moments from.
function outline(segments = [], max = 90) {
  if (!segments.length) return "";
  const step = Math.max(1, Math.ceil(segments.length / max));
  return segments.filter((_, i) => i % step === 0)
    .map((s) => `[${stamp(s.start)}] ${s.text}`).join("\n").slice(0, 9000);
}

// ── The four outputs ─────────────────────────────────────────────────────────
// One call, deliberately narrow. Timestamps for chapters and clips are
// constrained to the outline below, which is built from Whisper's own segment
// timings, so they point at moments that genuinely exist. A model asked to
// invent a timestamp will happily do so.
export async function buildAssets({ transcript, segments = [], meta = {}, ai = {}, profile = {} }) {
  const fitted = fitTranscript(transcript);
  const biz = ai.businessName || profile.company_name || "the business";
  const sells = ai.whatTheySell || profile.company_pitch || "";

  const result = await callAI({
    system:
      "You analyse a business video. You never invent anything: every fact and every timestamp must come from what you are given. " +
      "Write plainly, no hype, no exclamation marks, no em-dashes. " +
      "Only use timestamps that appear in the provided outline. Return ONLY valid JSON.",
    json: true,
    temperature: 0.5,
    maxTokens: 2000,
    prompt: `BUSINESS: ${biz}
WHAT THEY SELL: ${sells}
VIDEO TITLE: ${meta.title || "(untitled)"}

TIMESTAMPED OUTLINE (the only timestamps you may use):
${outline(segments)}

TRANSCRIPT:
${fitted.text}

Produce this JSON exactly:
{
  "summary": "2 sentences on what this video actually covers",
  "chapters": [{ "time": "M:SS from the outline", "label": "short chapter name" }],
  "clips": [{ "start": "M:SS", "end": "M:SS", "hook": "the first line to put on screen", "why": "one sentence on why this moment works standalone" }],
  "facts": ["specific first-party facts stated in the video: numbers, process details, proof, expert opinions. Only things actually said. These get saved so future articles can use them."]
}

Give 3-6 chapters and exactly 3 clips (the three strongest standalone moments). Facts matter most: be thorough and specific, and skip anything generic that any competitor could also claim.`,
  });

  let data;
  try {
    data = JSON.parse(String(result.text || "").replace(/```json|```/g, "").trim());
  } catch {
    return { ok: false, error: "Genie could not read that transcript properly. Try again in a moment." };
  }
  return { ok: true, data, truncated: fitted.truncated, provider: result.provider || null };
}
