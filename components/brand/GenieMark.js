"use client";

// ── THE GENIE MARK — the face of the product ──
// A clean, modern app mark that belongs to the light blue-gray system: a calm
// navy rounded-square tile holding one precise spark of intelligence (white, with
// a single warm terracotta accent). No busy orbits, no glowing "eye" — it reads at
// 16px like a real product icon (Linear/Vercel/Stripe register), and it sits
// comfortably on both the light workspace and the night theme.
// This is the ONE mark, used everywhere: favicon, nav, operator status, hero.

import React from "react";

// Round to fixed precision so the generated path string is byte-identical on
// server and client — otherwise last-ULP float differences trigger a React
// hydration mismatch on the brand mark, which appears on every screen.
const r3 = (n) => Number(n.toFixed(3));

// A precise 4-point spark (the "intelligence" glyph), centred at (cx,cy) with tip
// radius o. Concave sides pinch toward the centre for a crisp, geometric star —
// deliberately not the soft puffy sparkle. Built from four cubic segments.
function spark(cx, cy, o) {
  const s = o * 0.18, m = o * 0.5;
  const P = (x, y) => `${r3(x)} ${r3(y)}`;
  return [
    `M ${P(cx, cy - o)}`,
    `C ${P(cx + s, cy - m)} ${P(cx + m, cy - s)} ${P(cx + o, cy)}`,
    `C ${P(cx + m, cy + s)} ${P(cx + s, cy + m)} ${P(cx, cy + o)}`,
    `C ${P(cx - s, cy + m)} ${P(cx - m, cy + s)} ${P(cx - o, cy)}`,
    `C ${P(cx - m, cy - s)} ${P(cx - s, cy - m)} ${P(cx, cy - o)}`,
    "Z",
  ].join(" ");
}

export function GenieMark({ size = 40, live = false, className = "" }) {
  const uid = React.useId().replace(/[:]/g, "");
  return (
    <span
      className={`aperture ${className}`}
      data-state={live ? "working" : "idle"}
      {...(live ? {} : { "data-static": "" })}
      style={{ width: size, height: size, lineHeight: 0 }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <defs>
          <linearGradient id={`gm-tile-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2A407F" />
            <stop offset="55%" stopColor="#1E2F63" />
            <stop offset="100%" stopColor="#16244E" />
          </linearGradient>
          <radialGradient id={`gm-halo-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(203,174,112,0.55)" />
            <stop offset="60%" stopColor="rgba(203,174,112,0.12)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* the calm navy tile */}
        <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill={`url(#gm-tile-${uid})`} />
        {/* a hairline of light on the top edge — makes the tile feel lit, not flat */}
        <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />

        {/* a soft warm halo behind the spark — the single accent, kept quiet */}
        <circle cx="22.5" cy="24" r="15" fill={`url(#gm-halo-${uid})`} className="ap-halo" />

        {/* the main spark — champagne gold on royal blue: the genie's light */}
        <path d={spark(22.5, 24, 12.5)} fill="#EFE1B6" className="ap-core" />
        {/* a small deeper-gold companion spark — the "magic", top-right */}
        <path d={spark(35, 13.5, 4.6)} fill="#CBAE70" className="ap-focal" />
      </svg>
    </span>
  );
}

// Badge + wordmark lockup (nav header / auth). One clean line: "Marketing" in the
// muted tier, "Genie" in full-strength navy, so the name reads instantly and the
// weight jump alone carries the hierarchy.
export function GenieLockup({ size = 40, live = false, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <GenieMark size={size} live={live} />
      <span className="leading-[1.06]" style={{ letterSpacing: "-0.01em" }}>
        <span className="block text-[13px] font-medium" style={{ color: "var(--fg-subtle)" }}>Marketing</span>
        <span className="block text-[18px] font-bold" style={{ color: "var(--fg)" }}>Genie</span>
      </span>
    </span>
  );
}

export default GenieMark;
