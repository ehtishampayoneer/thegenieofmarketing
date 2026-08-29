"use client";

// ── THE GENIE BRAND ──
// GenieMark  = a small circular avatar of the genie's face (nav-adjacent, chat, tiles).
// GenieLockup = the "genie" wordmark, tinted via CSS mask so it follows the theme
//               (deep navy in Day, light in Night). Both use the art in /public.

import React from "react";

export function GenieMark({ size = 40, live = false, className = "" }) {
  return (
    <span className={`genie-avatar ${live ? "genie-bob" : ""} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src="/genie-head.png" alt="" />
    </span>
  );
}

// The full "Marketing Genie" lockup: a small tracked "MARKETING" eyebrow sitting flush
// over the stylised "genie" wordmark (masked, so it follows the theme's ink). Sizes are
// tuned so the eyebrow's width matches the wordmark's — a balanced, aligned stack.
export function GenieLockup({ size = 38, live = false, className = "" }) {
  const h = size, w = Math.round(size * 1.737);
  return (
    <span className={`inline-flex flex-col items-start ${className}`} style={{ lineHeight: 1 }} aria-label="Marketing Genie" role="img">
      <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.34em", textTransform: "uppercase", color: "var(--fg-muted)", marginBottom: "4px" }}>Marketing</span>
      <span className="genie-wordmark" style={{ width: w, height: h, display: "block" }} />
    </span>
  );
}

export default GenieMark;
