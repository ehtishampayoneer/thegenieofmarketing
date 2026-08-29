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

// The full "Marketing Genie" lockup: a small tracked "MARKETING" eyebrow over the
// stylised "genie" wordmark (masked, so it follows the theme's ink).
export function GenieLockup({ size = 34, live = false, className = "" }) {
  const h = size, w = Math.round(size * 1.74);
  return (
    <span className={`inline-flex flex-col ${className}`} style={{ lineHeight: 1 }} aria-label="Marketing Genie" role="img">
      <span style={{ fontSize: Math.max(8, Math.round(size * 0.235)), fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--fg-muted)", marginLeft: 2, marginBottom: Math.round(size * 0.1) }}>Marketing</span>
      <span className="genie-wordmark" style={{ width: w, height: h }} />
    </span>
  );
}

export default GenieMark;
