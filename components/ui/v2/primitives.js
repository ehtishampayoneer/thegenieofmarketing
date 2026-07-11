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

export function Divider({ className = "" }) {
  return <div className={`mg-hairline ${className}`} />;
}
