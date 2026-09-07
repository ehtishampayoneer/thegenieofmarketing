"use client";

// ── WHAT A VIDEO GIVES GENIE ──
// Captions, chapters, three clip picks, and the facts the owner says out loud.
// It does NOT write articles or social posts: the content engine already does
// that from the keyword strategy, and two engines producing the same shapes
// would only compete with each other in the same queue.
//
// Three ways to give Genie the words, because only some of them work everywhere:
//   • Upload a file  — Genie transcribes it (Groq Whisper, already configured).
//   • Paste a link   — Genie reads the public title and thumbnail. It cannot pull
//                      captions from YouTube, because YouTube blocks servers, and
//                      the UI says so plainly rather than failing vaguely.
//   • Paste the text — always works, needs nothing.
//
// Uploads go straight from the browser to private storage using a signed URL:
// a Vercel function caps request bodies at 4.5MB, which even a short clip
// exceeds, so the file never passes through the API at all.

import { useState, useRef } from "react";
import OperatorShell from "@/components/shell/v2/OperatorShell";
import Icon from "@/components/ui/Icon";
import { Card, Pill } from "@/components/ui/v2/primitives";
import { createClient } from "@/lib/supabase/client";

const MAX_MB = 25;

export default function VideoPage() {
  const [mode, setMode] = useState("upload"); // upload | link | paste
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [err, setErr] = useState("");
  const [needsTranscript, setNeedsTranscript] = useState(false);
  const [out, setOut] = useState(null);
  const fileRef = useRef(null);

  function reset() { setErr(""); setOut(null); setNeedsTranscript(false); }

  async function run() {
    if (busy) return;
    reset();
    setBusy(true);
    try {
      let payload = {};

      if (mode === "upload") {
        if (!file) { setErr("Choose a video or audio file first."); setBusy(false); return; }
        if (file.size > MAX_MB * 1048576) {
          setErr(`That file is ${(file.size / 1048576).toFixed(0)}MB and the limit is ${MAX_MB}MB. Upload just the audio track, or paste the transcript instead.`);
          setBusy(false); return;
        }
        setStage("Getting your upload ready…");
        const signed = await fetch("/api/video/upload-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, type: file.type || "video/mp4", size: file.size }),
        }).then((r) => r.json());
        if (!signed.ok) { setErr(signed.error || "Could not start the upload."); setBusy(false); return; }

        setStage("Uploading your video…");
        const sb = createClient();
        const up = await sb.storage.from(signed.bucket).uploadToSignedUrl(signed.path, signed.token, file);
        if (up.error) { setErr(`Upload failed: ${up.error.message}`); setBusy(false); return; }

        payload = { path: signed.path, type: file.type || "video/mp4", title: file.name };
        setStage("Listening to your video…");
      } else if (mode === "link") {
        if (!url.trim()) { setErr("Paste a YouTube or Vimeo link."); setBusy(false); return; }
        payload = { url: url.trim(), transcript: text.trim() || undefined };
        setStage(text.trim() ? "Reading your transcript…" : "Reading your video…");
      } else {
        if (text.trim().length < 200) { setErr("Paste a bit more of the transcript so Genie has something to work with."); setBusy(false); return; }
        payload = { transcript: text.trim(), url: url.trim() || undefined };
        setStage("Reading your transcript…");
      }

      const r = await fetch("/api/video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((x) => x.json());

      if (r.needsTranscript) {
        setNeedsTranscript(true);
        setErr(r.error);
        setBusy(false); setStage("");
        return;
      }
      if (!r.ok) { setErr(r.error || "Something went wrong."); setBusy(false); setStage(""); return; }
      setOut(r);
    } catch {
      setErr("Something interrupted that. Try again.");
    }
    setBusy(false); setStage("");
  }

  return (
    <OperatorShell active="video">
      <div className="max-w-[1000px]">
        <p className="mg-eyebrow"><Icon.post size={14} /> Video</p>
        <h1 className="mt-2 mg-display" style={{ fontSize: "clamp(29px,3.2vw,40px)" }}>
          Get more out of <span className="dawn-text">every video.</span>
        </h1>
        <p className="mt-2 text-[14px] mg-muted" style={{ maxWidth: "var(--measure)" }}>
          Genie listens to your video and gives you four things: a caption file, chapters, your three strongest clips to cut, and the facts you said out loud. Those facts are the useful part. They get saved, and every article Genie writes afterwards can use them, which is what makes writing sound like you rather than like everyone else.
        </p>

        {/* ── INPUT ── */}
        <Card className="mt-5 p-5">
          <div className="flex items-center gap-2 flex-wrap">
            {[["upload", "Upload a file"], ["link", "Paste a link"], ["paste", "Paste a transcript"]].map(([id, label]) => (
              <button
                key={id} onClick={() => { setMode(id); reset(); }}
                className="mg-focus"
                style={{
                  fontSize: 13, fontWeight: 600, padding: ".45rem .85rem", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${mode === id ? "var(--accent)" : "var(--hair)"}`,
                  background: mode === id ? "var(--accent-quiet)" : "var(--surface)",
                  color: mode === id ? "var(--accent-ink)" : "var(--fg-muted)",
                }}
              >{label}</button>
            ))}
          </div>

          <div className="mt-4">
            {mode === "upload" && (
              <>
                <input
                  ref={fileRef} type="file" accept="video/*,audio/*"
                  onChange={(e) => { setFile(e.target.files?.[0] || null); reset(); }}
                  style={{ display: "none" }}
                />
                <button onClick={() => fileRef.current?.click()} className="mg-focus w-full"
                  style={{
                    border: "1px dashed var(--border-strong)", borderRadius: 14, padding: "26px 18px",
                    background: "var(--surface-2)", cursor: "pointer", textAlign: "center", color: "var(--fg)",
                  }}>
                  <span className="mg-tile mx-auto" style={{ width: 40, height: 40, background: "var(--accent-quiet)", color: "var(--accent-ink)" }}><Icon.post size={19} /></span>
                  <span className="block mt-2.5 text-[14px] font-semibold">{file ? file.name : "Choose a video or audio file"}</span>
                  <span className="block mt-1 text-[12px] mg-subtle">
                    {file ? `${(file.size / 1048576).toFixed(1)}MB` : `MP4, MOV, WEBM, MP3, M4A or WAV, up to ${MAX_MB}MB`}
                  </span>
                </button>
                <p className="mt-2 text-[12px] mg-subtle" style={{ maxWidth: "var(--measure)" }}>
                  Longer than about 20 minutes? Export just the audio, which is a fraction of the size, or paste the transcript instead.
                </p>
              </>
            )}

            {mode === "link" && (
              <>
                <input
                  value={url} onChange={(e) => { setUrl(e.target.value); reset(); }}
                  placeholder="https://youtube.com/watch?v=…"
                  className="mg-field mg-focus w-full" style={{ fontSize: 14 }}
                />
                <p className="mt-2 text-[12px] mg-subtle" style={{ maxWidth: "var(--measure)" }}>
                  Genie reads the title and thumbnail from the link. YouTube blocks servers from downloading captions, so paste the transcript below and Genie does the rest. On YouTube: the three dots under the video, then Show transcript.
                </p>
                <textarea
                  value={text} onChange={(e) => setText(e.target.value)} rows={5}
                  placeholder="Paste the transcript here (optional but recommended)"
                  className="mg-field mg-focus w-full mt-3" style={{ fontSize: 13, resize: "vertical" }}
                />
              </>
            )}

            {mode === "paste" && (
              <>
                <textarea
                  value={text} onChange={(e) => { setText(e.target.value); reset(); }} rows={9}
                  placeholder="Paste your transcript here…"
                  className="mg-field mg-focus w-full" style={{ fontSize: 13, resize: "vertical" }}
                />
                <input
                  value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="Video link (optional, so the article can embed it)"
                  className="mg-field mg-focus w-full mt-3" style={{ fontSize: 13 }}
                />
              </>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button onClick={run} disabled={busy} className="mg-btn mg-btn--dawn disabled:opacity-60" style={{ fontSize: 14 }}>
              {busy ? "Working…" : "Read this video"}
            </button>
            {busy && stage && <span className="text-[13px] mg-muted"><span className="mg-live-dot" /> {stage}</span>}
          </div>

          {err && (
            <div className="mt-3 p-3.5 rounded-xl" style={{ background: "var(--signal-warn-soft)", border: "1px solid color-mix(in srgb, var(--signal-warn) 30%, transparent)" }}>
              <p className="text-[13px]" style={{ color: "var(--fg)", maxWidth: "var(--measure)" }}>{err}</p>
              {needsTranscript && mode !== "paste" && (
                <button onClick={() => { setMode(mode === "link" ? "link" : "paste"); setErr(""); }} className="mg-btn mg-btn--ghost mt-2.5" style={{ fontSize: 12.5 }}>
                  Paste the transcript
                </button>
              )}
            </div>
          )}
        </Card>

        {/* ── RESULTS ── */}
        {out && <Results out={out} />}
      </div>
    </OperatorShell>
  );
}

function Results({ out }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Card className="p-5 mg-ambient">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="mg-verified">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
            Listened to your video
          </span>
          {out.duration > 0 && <span className="text-[12.5px] mg-subtle mg-num">{Math.round(out.duration / 60)} min</span>}
        </div>
        {out.summary && <p className="mt-2 text-[13.5px] mg-muted" style={{ maxWidth: "var(--measure)" }}>{out.summary}</p>}
        <div className="mt-3 flex items-center gap-2.5 flex-wrap">
          {out.vtt && <DownloadBtn text={out.vtt} name="captions.vtt" label="Download captions (.vtt)" />}
          {out.youtubeChapters && <CopyBtn text={out.youtubeChapters} label="Copy YouTube chapters" />}
        </div>
        <p className="mt-2.5 text-[12px] mg-subtle" style={{ maxWidth: "var(--measure)" }}>
          Upload the caption file to YouTube under Subtitles, and paste the chapters into your video description. Both are free and both help the video get found.
        </p>
        {out.truncated && (
          <p className="mt-2.5 text-[12px] mg-subtle">
            That video was long, so Genie worked from the opening and the closing rather than every word in the middle.
          </p>
        )}
      </Card>

      {(out.clips || []).length > 0 && (
        <Card className="p-5">
          <p className="mg-klabel">Your three strongest clips</p>
          <p className="mt-1 text-[13px] mg-muted">Cut these and post them as Shorts, Reels or TikToks. Timestamps come from the audio, so they point at real moments.</p>
          <div className="mt-3 flex flex-col gap-2.5">
            {out.clips.map((c, i) => (
              <div key={i} className="p-3.5 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--hair)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="mg-num text-[13px] font-bold" style={{ color: "var(--accent-ink)" }}>{c.start} – {c.end}</span>
                  <Pill tone="info">Clip {i + 1}</Pill>
                </div>
                {c.hook && <p className="mt-1.5 text-[14px] font-semibold" style={{ color: "var(--fg)" }}>“{c.hook}”</p>}
                {c.why && <p className="mt-1 text-[12.5px] mg-muted">{c.why}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {(out.chapters || []).length > 0 && (
        <Card className="p-5">
          <p className="mg-klabel">Chapters</p>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {out.chapters.map((c, i) => (
              <div key={i} className="flex items-baseline gap-3 text-[13.5px]">
                <span className="mg-num shrink-0" style={{ color: "var(--accent-ink)", minWidth: 52 }}>{i === 0 ? "0:00" : c.time}</span>
                <span style={{ color: "var(--fg-muted)" }}>{c.label}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {out.factsSaved > 0 && (
        <Card className="p-5" style={{ borderLeft: "3px solid var(--signal-live)" }}>
          <p className="text-[14px] font-bold" style={{ color: "var(--fg)" }}>
            Genie kept {out.factsSaved} fact{out.factsSaved === 1 ? "" : "s"} you said out loud
          </p>
          <p className="mt-1 text-[13px] mg-muted" style={{ maxWidth: "var(--measure)" }}>
            These are things no competitor's website contains, which is what makes writing worth citing. Every article Genie writes from now on can use them. You can see and edit them in Settings.
          </p>
          <ul className="mt-2.5 flex flex-col gap-1.5" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {(out.facts || []).slice(0, 6).map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] mg-muted">
                <span style={{ color: "var(--signal-live-ink)" }}>•</span><span>{f}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function CopyBtn({ text, label, small }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch {} }}
      className="mg-btn mg-btn--ghost" style={{ fontSize: small ? 12 : 13 }}
    >{done ? "Copied" : label}</button>
  );
}

function DownloadBtn({ text, name, label }) {
  function save() {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  }
  return <button onClick={save} className="mg-btn mg-btn--ghost" style={{ fontSize: 13 }}>{label}</button>;
}
