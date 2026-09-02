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

// The full "Marketing Genie" logo (the user's artwork).
//
// Sized by WIDTH, not height, which is the fix for "MARKETING is unreadable".
// In the source PNG that word is only ~7.5% of the image height, so at the old
// 42px height it rendered about 3px tall — far below anything legible. The file
// also carries ~16% blank padding on each side, so the real content aspect is
// 2.27:1, not the 3:1 the box was using.
//
// Cropping that padding (see .genie-logo background-size) and driving the size
// from the width the container actually has lets the artwork render much larger
// in the same slot, which takes "MARKETING" to a readable size.
export function GenieLockup({ width = 190, live = false, className = "" }) {
  const w = width, h = Math.round(width / 2.27);
  return (
    <span className={`genie-logo ${className}`} style={{ width: w, height: h }} role="img" aria-label="Marketing Genie" />
  );
}

export default GenieMark;
