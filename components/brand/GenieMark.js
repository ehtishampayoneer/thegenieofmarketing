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

// The full "Marketing Genie" logo (the user's artwork). size = logo height; the image
// aspect (~3:1) sets the width. Inverted to light in Night via .genie-logo.
export function GenieLockup({ size = 42, live = false, className = "" }) {
  const h = size, w = Math.round(size * 3.0);
  return (
    <span className={`genie-logo ${className}`} style={{ width: w, height: h }} role="img" aria-label="Marketing Genie" />
  );
}

export default GenieMark;
