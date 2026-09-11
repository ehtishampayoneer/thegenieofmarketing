"use client";

// ── ASK GENIE TO WRITE SOMETHING ──
// Genie normally decides what to write from the keyword strategy, every night.
// This is the other direction: the owner has news, an announcement or an angle
// that no keyword tool would ever surface, and wants a piece about THAT.
//
// It does not publish. It writes and puts the result in Approvals, so a directed
// piece goes through exactly the same review, content guard and publish path as
// everything Genie writes on its own. One queue, one set of rules, no second
// route to keep honest.
//
// Uploads reuse what already exists: /api/upload/image for photos (public bucket,
// same as the Approvals image swap) and the signed direct-to-storage URL for
// video, because a Vercel function caps request bodies at 4.5MB.

import { useState, useRef } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";
import { createClient } from "@/lib/supabase/client";

const MAX_IMAGES = 8;
const MAX_VIDEO_MB = 25;

const CHANNELS = [
  { id: "both", label: "Article and social", hint: "A full piece for your site, plus posts for every platform" },
  { id: "article", label: "Article only", hint: "Just the piece for your own site" },
  { id: "social", label: "Social only", hint: "Posts only. Genie still writes the piece they are built from" },
];

export default function WritePage() {
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [channels, setChannels] = useState("both");
  const [images, setImages] = useState([]);      // public URLs, already uploaded
  const [video, setVideo] = useState(null);      // { url, name }
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);
  const imgRef = useRef(null);
  const vidRef = useRef(null);

  async function addImages(files) {
    const list = Array.from(files || []).filter((f) => /^image\//.test(f.type));
    if (!list.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { setErr(`That is the limit of ${MAX_IMAGES} images.`); return; }
    setErr(""); setBusy(true); setStage("Uploading your images…");
    const added = [];
    for (const f of list.slice(0, room)) {
      try {
        const fd = new FormData(); fd.append("file", f);
        const j = await fetch("/api/upload/image", { method: "POST", body: fd }).then((r) => r.json());
        if (j?.ok && j.url) added.push(j.url);
        else setErr(j?.error || "One of those images would not upload.");
      } catch { setErr("One of those images would not upload."); }
    }
    setImages((prev) => [...prev, ...added]);
    setBusy(false); setStage("");
  }

  async function addVideo(file) {
    if (!file) return;
    if (file.size > MAX_VIDEO_MB * 1048576) {
      setErr(`That video is ${(file.size / 1048576).toFixed(0)}MB and the limit is ${MAX_VIDEO_MB}MB.`);
      return;
    }
    setErr(""); setBusy(true); setStage("Uploading your video…");
    try {
      const signed = await fetch("/api/video/upload-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, type: file.type || "video/mp4", size: file.size }),
      }).then((r) => r.json());
      if (!signed.ok) { setErr(signed.error || "Could not start that upload."); setBusy(false); setStage(""); return; }
      const sb = createClient();
      const up = await sb.storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.token, file);
      if (up.error) { setErr(`Upload failed: ${up.error.message}`); setBusy(false); setStage(""); return; }
      const { data } = sb.storage.from(signed.bucket).getPublicUrl(signed.path);
      setVideo({ url: data.publicUrl, name: file.name });
    } catch { setErr("Could not upload that video."); }
    setBusy(false); setStage("");
  }

  async function create() {
    const t = topic.trim();
    if (!t) { setErr("Tell Genie what to write about."); return; }
    setErr(""); setDone(null); setBusy(true);
    setStage("Genie is writing. This takes up to a minute…");
    try {
      const j = await fetch("/api/content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t, context: context.trim(), channels, images, video: video?.url || null }),
      }).then((r) => r.json());
      if (j?.ok) {
        setDone({ saved: j.saved || 0, title: j.content?.article?.title || t, socialFailed: j.socialFailed });
        setTopic(""); setContext(""); setImages([]); setVideo(null);
      } else setErr(j?.message || j?.error || "Genie could not write that. Try again in a moment.");
    } catch { setErr("Something interrupted that. Try again."); }
    setBusy(false); setStage("");
  }

  return (
    <OperatorShell active="write">
      <div className="max-w-[860px]">
        <p className="mg-eyebrow"><Icon.write size={14} /> Ask Genie</p>
        <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(29px,3.2vw,40px)" }}>
          Write about <span className="dawn-text">something specific.</span>
        </h1>
        <p className="mt-2 text-[14px] mg-muted" style={{ maxWidth: "var(--measure)" }}>
          Genie normally picks topics from your keyword strategy. Use this when you have news, an announcement or an angle it would never find on its own. It writes the piece and puts it in Approvals, where you check it and publish exactly like everything else.
        </p>

        {done && (
          <Card className="mt-5 p-5" style={{ borderLeft: "3px solid var(--signal-live)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mg-verified">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
                Written
              </span>
              <span className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>
                {done.saved} draft{done.saved === 1 ? "" : "s"} waiting for you
              </span>
            </div>
            <p className="mt-1.5 text-[13px] mg-muted">“{done.title}”</p>
            {done.socialFailed && (
              <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--signal-warn-ink, var(--signal-warn))" }}>
                The article is ready, but the social posts did not come back this time. Ask again if you want them.
              </p>
            )}
            <a href="/approvals" className="mg-btn mg-btn--dawn mt-3 inline-flex" style={{ fontSize: 13 }}>Review and publish →</a>
          </Card>
        )}

        <Card className="mt-5 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium mg-muted">What should Genie write about?</span>
            <input
              value={topic} onChange={(e) => setTopic(e.target.value)}
              placeholder="The new EU furniture safety rules"
              className="mg-field mg-focus" style={{ fontSize: 15, padding: "10px 12px" }}
            />
          </label>

          <label className="flex flex-col gap-1.5 mt-4">
            <span className="text-[12px] font-medium mg-muted">Anything Genie should know (optional)</span>
            <textarea
              value={context} onChange={(e) => setContext(e.target.value)} rows={4}
              placeholder="The rules start in March. We already comply and have been certified since 2024. Mention that our catalogues show the certification on every product page."
              className="mg-field mg-focus" style={{ fontSize: 14, padding: "10px 12px", lineHeight: 1.6, resize: "vertical" }}
            />
            <span className="text-[12px] mg-subtle leading-snug">
              Paste the news, the announcement, the numbers, your angle. Genie treats everything here as fact and builds the piece around it, so this is what stops it writing something generic.
            </span>
          </label>

          {/* ── what to make ── */}
          <p className="text-[12px] font-medium mg-muted mt-5">What should it make?</p>
          <div className="mt-2 flex flex-col gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c.id} onClick={() => setChannels(c.id)} className="mg-focus text-left"
                style={{
                  padding: "10px 12px", borderRadius: 12, cursor: "pointer",
                  border: `1px solid ${channels === c.id ? "var(--accent)" : "var(--hair)"}`,
                  background: channels === c.id ? "var(--accent-quiet)" : "var(--surface)",
                }}
              >
                <span className="text-[13.5px] font-semibold" style={{ color: channels === c.id ? "var(--accent-ink)" : "var(--fg)" }}>{c.label}</span>
                <span className="block text-[12px] mg-subtle mt-0.5">{c.hint}</span>
              </button>
            ))}
          </div>

          {/* ── attachments ── */}
          <p className="text-[12px] font-medium mg-muted mt-5">Your own photos and video (optional)</p>
          <p className="text-[12px] mg-subtle mt-0.5" style={{ maxWidth: "var(--measure)" }}>
            If you add photos, Genie uses yours instead of a stock image, and the first one becomes the main picture everywhere.
          </p>

          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <input ref={imgRef} type="file" accept="image/*" multiple onChange={(e) => addImages(e.target.files)} style={{ display: "none" }} />
            <button onClick={() => imgRef.current?.click()} disabled={busy} className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 13 }}>
              Add photos
            </button>
            <input ref={vidRef} type="file" accept="video/*" onChange={(e) => addVideo(e.target.files?.[0])} style={{ display: "none" }} />
            <button onClick={() => vidRef.current?.click()} disabled={busy} className="mg-btn mg-btn--ghost disabled:opacity-50" style={{ fontSize: 13 }}>
              {video ? "Replace video" : "Add a video"}
            </button>
            <span className="text-[12px] mg-subtle">Up to {MAX_IMAGES} photos, video up to {MAX_VIDEO_MB}MB</span>
          </div>

          {images.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {images.map((u, i) => (
                <span key={u} style={{ position: "relative", display: "inline-block" }}>
                  <img src={u} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: "1px solid var(--hair)", display: "block" }} />
                  {i === 0 && <span className="mg-pill mg-pill--live" style={{ position: "absolute", bottom: 4, left: 4, fontSize: 9 }}>Main</span>}
                  <button
                    onClick={() => setImages((p) => p.filter((x) => x !== u))}
                    aria-label="Remove"
                    style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: "1px solid var(--hair)", background: "var(--surface)", color: "var(--fg-muted)", cursor: "pointer", lineHeight: 1, fontSize: 13 }}
                  >×</button>
                </span>
              ))}
            </div>
          )}

          {video && (
            <div className="mt-2.5 flex items-center gap-2">
              <Pill tone="info">Video</Pill>
              <span className="text-[13px] mg-muted truncate" style={{ maxWidth: 320 }}>{video.name}</span>
              <button onClick={() => setVideo(null)} className="mg-focus" style={{ background: "none", border: "none", color: "var(--fg-subtle)", cursor: "pointer", fontSize: 12 }}>Remove</button>
            </div>
          )}

          {err && <p className="mt-3 text-[13px]" style={{ color: "var(--signal-danger)" }}>{err}</p>}
          {stage && <p className="mt-3 text-[13px]" style={{ color: "var(--accent-ink)" }}>{stage}</p>}

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button onClick={create} disabled={busy || !topic.trim()} className="mg-btn mg-btn--dawn disabled:opacity-50" style={{ fontSize: 14 }}>
              {busy ? "Working…" : "Write it"}
            </button>
            <span className="text-[12px] mg-subtle">Goes to Approvals. Nothing publishes until you say so.</span>
          </div>
        </Card>
      </div>
    </OperatorShell>
  );
}
