// lib/video.js
// ── ONE VIDEO BECOMES A DOZEN PIECES OF MARKETING ──
// Give Genie a video and the valuable thing is not the pixels, it is the words.
// Everything here flows from the transcript, which is why this needs no video
// processing at all: no ffmpeg, no encoding, no separate worker. That matters,
// because Vercel functions cap at a 250MB bundle and a 4.5MB payload with a
// disposable filesystem, so transcoding is simply not possible on this hosting.
//
// The quieter win: a transcript of the owner talking about their own business is
// the richest first-party material Genie can get. It is exactly the "information
// gain" the content engine is usually starved of, and it is the one thing no
// competitor has a copy of. So a video does not just produce video marketing, it
// makes everything else Genie writes more original.
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

// ── The assets ───────────────────────────────────────────────────────────────
// One call produces every piece, so they share a voice and do not contradict
// each other. Timestamps for chapters and clips are constrained to the outline
// above so they refer to moments that actually exist in the video.
export async function buildAssets({ transcript, segments = [], meta = {}, ai = {}, profile = {}, moneyPage = null }) {
  const fitted = fitTranscript(transcript);
  const biz = ai.businessName || profile.company_name || "the business";
  const sells = ai.whatTheySell || profile.company_pitch || "";
  const audience = ai.targetCustomer || "";

  const result = await callAI({
    system:
      "You turn a business video into publish-ready marketing. You never invent facts: everything you write must be supported by the transcript. " +
      "Write like a person, not a marketer. No hype, no exclamation marks, no em-dashes. " +
      "Only use timestamps that appear in the provided outline. Return ONLY valid JSON.",
    json: true,
    temperature: 0.65,
    maxTokens: 4000,
    prompt: `BUSINESS: ${biz}
WHAT THEY SELL: ${sells}
THEIR BUYER: ${audience}
VIDEO TITLE: ${meta.title || "(untitled)"}
${moneyPage ? `WHERE BUYERS SHOULD GO: ${moneyPage}` : ""}

TIMESTAMPED OUTLINE (the only timestamps you may use):
${outline(segments)}

TRANSCRIPT:
${fitted.text}

Produce this JSON exactly:
{
  "summary": "2 sentences on what this video actually covers",
  "targetKeyword": "the buyer search term this video is best placed to win",
  "article": {
    "title": "a title someone would click, under 65 chars",
    "slug": "url-safe-slug",
    "metaDescription": "under 155 chars",
    "body": "a genuinely useful 700-1000 word article in markdown, built from what the video actually says. Use ## subheadings. Do not describe the video in the third person, just teach the thing it teaches."
  },
  "faq": [{ "q": "a real question this video answers", "a": "a 2-3 sentence answer" }],
  "chapters": [{ "time": "M:SS from the outline", "label": "short chapter name" }],
  "clips": [{ "start": "M:SS", "end": "M:SS", "hook": "the first line to put on screen", "why": "one sentence on why this moment works standalone" }],
  "social": {
    "linkedin": "a 120-180 word post in first person, one idea, no hashtag spam",
    "twitter": ["a thread of 4-6 tweets, each under 260 chars"],
    "instagram": "a caption under 150 words with 5 relevant hashtags at the end",
    "tiktok": "a caption under 150 chars with 3 hashtags",
    "pinterest": "a description under 400 chars written for search"
  },
  "facts": ["specific first-party facts stated in the video: numbers, process details, proof, opinions. These get saved so future articles can use them."]
}

Give 4-8 faq, 3-6 chapters, and exactly 3 clips (the three strongest standalone moments).`,
  });

  let data;
  try {
    data = JSON.parse(String(result.text || "").replace(/```json|```/g, "").trim());
  } catch {
    return { ok: false, error: "Genie could not turn that transcript into assets. Try again in a moment." };
  }
  return { ok: true, data, truncated: fitted.truncated, provider: result.provider || null };
}

// ── Staging ──────────────────────────────────────────────────────────────────
// Video assets deliberately reuse the SAME action types the content engine
// already produces, so they flow through Approvals, the publish gate and the
// autonomy rules with no special cases. An article from a video publishes
// exactly like any other article; social stays draft-and-you-post.
export function assetsToActions({ userId, host, data, meta, scanId = null }) {
  const rows = [];
  const videoRef = meta?.url || null;

  if (data.article?.body) {
    rows.push({
      user_id: userId,
      scan_id: scanId,
      type: "article",
      title: `Article from your video: ${data.article.title || meta?.title || "Untitled"}`,
      payload: {
        ...data.article,
        faq: data.faq || [],
        targetKeyword: data.targetKeyword || null,
        // Carried so the published page can embed the video and emit VideoObject
        // schema, which is what earns a video rich result in Google.
        video: videoRef ? { url: videoRef, title: meta.title || null, thumbnail: meta.thumbnail || null } : null,
        source: "video",
      },
      target: { platform: "website", host: host || null },
      priority: "high",
      status: "proposed",
    });
  }

  const social = data.social || {};
  const push = (platform, text) => {
    if (!text || !String(text).trim()) return;
    rows.push({
      user_id: userId,
      scan_id: scanId,
      type: "social_post",
      title: `${platform} post from your video`,
      payload: { platform, text: String(text).trim(), source: "video", video: videoRef, image: meta?.thumbnail || null },
      target: { platform: platform.toLowerCase(), host: host || null },
      priority: "medium",
      status: "proposed",
    });
  };
  (social.twitter || []).forEach((t) => push("Twitter/X", t));
  push("LinkedIn", social.linkedin);
  push("Instagram", social.instagram);
  push("TikTok", social.tiktok);
  push("Pinterest", social.pinterest);

  return rows;
}
