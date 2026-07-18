"use client";

// ── V2 PRIMITIVES — the shared vocabulary of the Aperture design language ──
// One source of truth for surfaces, buttons, pills, stats and the honesty
// (verified/estimated) system. Namespaced under ui/v2 so V1 components keep
// working untouched until each surface migrates. Styling lives in globals.css
// (the .mg-* token-driven classes) so these stay theme-aware (Day/Night).

import React from "react";

export function Card({ children, className = "", as: As = "div", ...rest }) {
  return (
    <As className={`mg-surface ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function QuietCard({ children, className = "", as: As = "div", ...rest }) {
  return (
    <As className={`mg-surface-quiet ${className}`} {...rest}>
      {children}
    </As>
  );
}

// variant: primary | dawn | ghost | quiet
export function Button({ children, variant = "primary", className = "", ...rest }) {
  return (
    <button className={`mg-btn mg-btn--${variant} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// tone: neutral | live | dawn | danger | info
export function Pill({ children, tone = "neutral", className = "" }) {
  const t = tone !== "neutral" ? `mg-pill--${tone}` : "";
  return <span className={`mg-pill ${t} ${className}`}>{children}</span>;
}

export function Kbd({ children }) {
  return <kbd className="mg-kbd">{children}</kbd>;
}

export function SectionLabel({ children, className = "" }) {
  return (
    <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] mg-subtle ${className}`}>
      {children}
    </p>
  );
}

// An editorial section header — a quiet dawn ordinal, a confident title, and an
// optional note + right-side action. One rung below the page display headline,
// so pages read as: display → section title → body (real hierarchy, not flat).
export function SectionHead({ index, title, note, action, className = "" }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 flex-wrap ${className}`}>
      <div className="flex items-baseline gap-2.5 min-w-0">
        {index != null && <span className="text-[11px] font-bold mg-num tracking-widest" style={{ color: "var(--accent-ink)" }}>{index}</span>}
        <h2 className="mg-title">{title}</h2>
        {note && <span className="text-[12.5px] mg-subtle">{note}</span>}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Stat({ value, label, accent = false, className = "" }) {
  return (
    <div className={className}>
      <div
        className="text-2xl font-semibold mg-num leading-none"
        style={{ color: accent ? "var(--accent-ink)" : "var(--fg)" }}
      >
        {value}
      </div>
      <div className="text-[12px] mg-muted mt-1">{label}</div>
    </div>
  );
}

// The honesty system — verified vs estimated as a consistent visual language.
export function Verified({ children = "Verified" }) {
  return (
    <span className="mg-verified">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
      {children}
    </span>
  );
}

export function Estimated({ children = "Estimated" }) {
  return <span className="mg-estimated">≈ {children}</span>;
}

// Unified data-provenance marker. Trust is the brand, so every number can say
// whether it's measured (verified), AI-inferred (modelled), estimated, streaming
// (live), or not gathered yet (early/sample). One system, used everywhere.
function CheckGlyph() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>;
}
export function Provenance({ kind = "verified", children }) {
  switch (kind) {
    case "verified": return <span className="mg-verified"><CheckGlyph /> {children || "Verified"}</span>;
    case "live": return <span className="mg-verified"><span className="mg-live-dot" /> {children || "Live"}</span>;
    case "modelled": return <span className="mg-estimated">◇ {children || "AI-modelled"}</span>;
    case "estimated": return <span className="mg-estimated">≈ {children || "Estimated"}</span>;
    case "early": return <span className="mg-estimated">◔ {children || "Early — building"}</span>;
    default: return <span className="mg-pill">{children || "Sample preview"}</span>; // sample/preview
  }
}

export function Divider({ className = "" }) {
  return <div className={`mg-hairline ${className}`} />;
}
