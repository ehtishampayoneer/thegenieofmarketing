"use client";

// ── THE GENIE MARK — the face of the product ──
// A premium "focus gem": a deep night badge (rounded superellipse) holding a
// single focused lens of dawn light with a lit core. Iconic and geometric — it
// reads at 16px like a real app icon, not a loading spinner. Static by default;
// `live` adds a calm breathing core (reduced-motion safe via globals).
// This is the ONE mark, used everywhere: favicon, nav, operator status, hero.

import React from "react";

function bladePath(i, cx, cy, rOut, rIn, gapDeg) {
  const seg = 360 / 6;
  const a0 = i * seg + gapDeg / 2;
  const a1 = (i + 1) * seg - gapDeg / 2;
  const p = (r, a) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x0o, y0o] = p(rOut, a0);
  const [x1o, y1o] = p(rOut, a1);
  const [x1i, y1i] = p(rIn, a1);
  const [x0i, y0i] = p(rIn, a0);
  return `M ${x0o} ${y0o} A ${rOut} ${rOut} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rIn} ${rIn} 0 0 0 ${x0i} ${y0i} Z`;
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
            <stop offset="0%" stopColor="#182B3A" />
            <stop offset="55%" stopColor="#0F1F2B" />
            <stop offset="100%" stopColor="#0A151D" />
          </linearGradient>
          <radialGradient id={`gm-glow-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,200,118,0.55)" />
            <stop offset="55%" stopColor="rgba(245,158,61,0.18)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <linearGradient id={`gm-blade-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE7BE" />
            <stop offset="50%" stopColor="#FBB360" />
            <stop offset="100%" stopColor="#EE8A2C" />
          </linearGradient>
          <radialGradient id={`gm-core-${uid}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="40%" stopColor="#FFE0AE" />
            <stop offset="100%" stopColor="#F59E3D" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* the gem */}
        <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" fill={`url(#gm-tile-${uid})`} />
        <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        {/* inner light */}
        <circle cx="24" cy="24" r="15" fill={`url(#gm-glow-${uid})`} className="ap-halo" />
        {/* focused lens (static geometry) */}
        <g className="ap-blades" style={live ? undefined : { animation: "none" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <path key={i} d={bladePath(i, 24, 24, 12, 6.6, 20)} fill={`url(#gm-blade-${uid})`} transform="rotate(0 24 24)" />
          ))}
        </g>
        {/* lit core */}
        <circle cx="24" cy="24" r="6" fill={`url(#gm-core-${uid})`} />
        <circle cx="24" cy="24" r="2.4" fill="#FFFFFF" className="ap-focal" style={{ filter: "drop-shadow(0 0 3px rgba(255,255,255,0.9))" }} />
      </svg>
    </span>
  );
}

// Badge + stacked wordmark lockup (nav header).
export function GenieLockup({ size = 40, live = false, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <GenieMark size={size} live={live} />
      <span className="leading-[1.05]" style={{ letterSpacing: "-0.01em" }}>
        <span className="block text-[15px] font-bold" style={{ color: "var(--fg)" }}>Marketing</span>
        <span className="block text-[15px] font-bold dawn-text">Genie</span>
      </span>
    </span>
  );
}

export default GenieMark;
