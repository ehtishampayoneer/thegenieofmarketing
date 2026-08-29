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

export function GenieLockup({ size = 34, live = false, className = "" }) {
  const h = size, w = Math.round(size * 1.74);
  return (
    <span className={`inline-flex items-center ${className}`}>
      <span className="genie-wordmark" style={{ width: w, height: h }} role="img" aria-label="Genie" />
    </span>
  );
}

export default GenieMark;
