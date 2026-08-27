"use client";

// ── PAGE GUIDE ──
// The info button in the shell header. On every page it reads the page's `active` id,
// looks up a plain-language guide (lib/page-guides.js), and opens a clean, visual modal
// that shows a layman EXACTLY how this page works and how Genie does its job here:
// a 3-step visual flow, a "Genie does / You do" split, and why it makes money.
// Renders nothing on pages that don't have a guide.

import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/Icon";
import { PAGE_GUIDES } from "@/lib/page-guides";

export default function PageGuide({ active }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const guide = PAGE_GUIDES[active];

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; clearTimeout(t); };
  }, [open]);

  if (!guide) return null;
  const Head = Icon[guide.icon] || Icon.spark;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mg-focus shrink-0 flex items-center gap-1.5"
        title={`How ${guide.name} works`}
        aria-label={`How ${guide.name} works`}
        style={{ padding: "5px 11px 5px 8px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--hair)", color: "var(--fg-muted)", cursor: "pointer", fontSize: 12, fontWeight: 600, lineHeight: 1 }}
      >
        <Icon.info size={15} />
        <span className="hidden sm:inline" style={{ maxWidth: 130 }}>How this works</span>
      </button>

      {open && (
        <div
          role="dialog" aria-modal="true" aria-label={`How ${guide.name} works`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(3,6,12,.55)", backdropFilter: "blur(3px)" }}
        >
          <div className="mg-rise" style={{ width: "100%", maxWidth: 580, maxHeight: "88vh", overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 20, boxShadow: "var(--shadow-3)" }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 13, padding: "22px 22px 0" }}>
              <span className="mg-tile" style={{ width: 42, height: 42, flexShrink: 0, background: "var(--accent-quiet)", color: "var(--accent-ink)", borderRadius: 12 }}><Head size={21} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--accent-ink)" }}>How this page works</p>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--fg)", margin: "2px 0 0", lineHeight: 1.15 }}>{guide.name}</h2>
              </div>
              <button ref={closeRef} onClick={() => setOpen(false)} className="mg-focus" aria-label="Close" style={{ flexShrink: 0, background: "none", border: "none", color: "var(--fg-subtle)", cursor: "pointer", padding: 4, borderRadius: 8 }}><Icon.x size={19} /></button>
            </div>
            <p style={{ padding: "10px 22px 0", fontSize: 13.5, color: "var(--fg-muted)", lineHeight: 1.5, maxWidth: "56ch" }}>{guide.what}</p>

            {/* step flow */}
            <div style={{ padding: "18px 22px 4px" }}>
              {guide.steps.map((s, i) => {
                const Si = Icon[s.icon] || Icon.spark;
                const last = i === guide.steps.length - 1;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "38px 1fr", gap: 14, alignItems: "stretch" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <span style={{ position: "relative", width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: "var(--surface-sunken)", border: "1px solid var(--hair)", color: "var(--fg)", display: "grid", placeItems: "center" }}>
                        <Si size={18} />
                        <span style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 999, background: "var(--primary)", color: "var(--on-primary)", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center", fontFamily: "var(--font-mono, monospace)" }}>{i + 1}</span>
                      </span>
                      {!last && <span style={{ width: 2, flex: 1, minHeight: 14, background: "var(--hair)", margin: "5px 0" }} />}
                    </div>
                    <div style={{ paddingBottom: last ? 2 : 15 }}>
                      <p style={{ fontSize: 14.5, fontWeight: 600, color: "var(--fg)", margin: 0 }}>{s.title}</p>
                      <p style={{ fontSize: 12.8, color: "var(--fg-muted)", margin: "2px 0 0", lineHeight: 1.5 }}>{s.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* who does what */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "8px 22px 0" }}>
              <div style={{ background: "var(--accent-quiet)", borderRadius: 12, padding: "12px 13px" }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "0 0 5px", display: "flex", alignItems: "center", gap: 5 }}><Icon.spark size={13} /> Genie does</p>
                <p style={{ fontSize: 12.5, color: "var(--fg)", margin: 0, lineHeight: 1.45 }}>{guide.genie}</p>
              </div>
              <div style={{ background: "var(--surface-sunken)", borderRadius: 12, padding: "12px 13px" }}>
                <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--fg-muted)", margin: "0 0 5px", display: "flex", alignItems: "center", gap: 5 }}><Icon.check size={13} /> You do</p>
                <p style={{ fontSize: 12.5, color: "var(--fg)", margin: 0, lineHeight: 1.45 }}>{guide.you}</p>
              </div>
            </div>

            {/* why it matters */}
            <div style={{ margin: "16px 22px", padding: "13px 15px", borderRadius: 12, background: "var(--signal-live-soft)", border: "1px solid var(--signal-live)", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: "var(--signal-live-ink)", flexShrink: 0, marginTop: 1 }}><Icon.bolt size={17} /></span>
              <div>
                <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--signal-live-ink)", margin: "0 0 3px" }}>Why it makes you money</p>
                <p style={{ fontSize: 13, color: "var(--fg)", margin: 0, lineHeight: 1.5 }}>{guide.benefit}</p>
              </div>
            </div>

            <div style={{ padding: "0 22px 20px", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setOpen(false)} className="mg-btn mg-btn--dawn mg-focus" style={{ fontSize: 13 }}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
