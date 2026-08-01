"use client";

// Logo picker — upload an image file (not a pasted URL). Neutral inline styles +
// a themeable button class so it works in both the app (mg) and onboarding (onb).

import { useRef, useState } from "react";
import { uploadLogo } from "@/lib/upload";

export function LogoUpload({ value, onChange, buttonClassName = "mg-btn mg-btn--ghost", mutedColor = "var(--fg-subtle)", label = "Upload logo" }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr("");
    try { onChange(await uploadLogo(file)); }
    catch (ex) { setErr(ex.message || "Upload failed"); }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {value ? <img src={value} alt="logo" style={{ height: 44, maxWidth: 130, objectFit: "contain", borderRadius: 8, background: "#fff", padding: 4 }} onError={(e) => { e.currentTarget.style.display = "none"; }} /> : null}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={pick} style={{ display: "none" }} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={buttonClassName} style={{ fontSize: 13, padding: ".55rem 1rem" }}>
          {busy ? "Uploading…" : value ? "Replace logo" : label}
        </button>
        {value ? <button type="button" onClick={() => onChange("")} className="mg-focus" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: mutedColor }}>Remove</button> : null}
      </div>
      {err ? <p style={{ marginTop: 6, fontSize: 12, color: "#E5484D" }}>{err}</p> : null}
    </div>
  );
}
