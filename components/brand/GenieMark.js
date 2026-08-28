"use client";

// ── THE GENIE MARK — the face of the product ──
// A premium "focus gem": a deep night badge (rounded superellipse) holding a
// single focused lens of dawn light with a lit core. Iconic and geometric — it
// reads at 16px like a real app icon, not a loading spinner. Static by default;
// `live` adds a calm breathing core (reduced-motion safe via globals).
// This is the ONE mark, used everywhere: favicon, nav, operator status, hero.

import React from "react";

// Round to fixed precision so the generated path string is byte-identical on
// server and client — otherwise last-ULP float differences trigger a React
// hydration mismatch on the brand mark, which appears on every screen.
const r3 = (n) => Number(n.toFixed(3));

function bladePath(i, cx, cy, rOut, rIn, gapDeg) {
  const seg = 360 / 6;
  const a0 = i * seg + gapDeg / 2;
  const a1 = (i + 1) * seg - gapDeg / 2;
  const p = (r, a) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [r3(cx + r * Math.cos(rad)), r3(cy + r * Math.sin(rad))];
  };
  const [x0o, y0o] = p(rOut, a0);
  const [x1o, y1o] = p(rOut, a1);
  const [x1i, y1i] = p(rIn, a1);
  const [x0i, y0i] = p(rIn, a0);
  return `M ${x0o} ${y0o} A ${rOut} ${rOut} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rIn} ${rIn} 0 0 0 ${x0i} ${y0i} Z`;
}

// ── THE GENIE MARK — a refined navy lens with a warm, intelligent eye ──
// Echoes the living Aperture (dark lens + warm focal), rendered as a crisp static icon
// that reads at 16px. Deep-navy gem so it sits calmly in the blue-gray system; the one
// warm note is the glowing core — the Genie's intelligence. `live` breathes the core.
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
            <stop offset="0%" stopColor="#26344B" />
            <stop offset="55%" stopColor="#1B2740" />
            <stop offset="100%" stopColor="#131C30" />
          </linearGradient>
          <radialGradient id={`gm-glow-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,205,128,0.62)" />
            <stop offset="55%" stopColor="rgba(245,158,61,0.16)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <radialGradient id={`gm-core-${uid}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="42%" stopColor="#FFE1B0" />
            <stop offset="100%" stopColor="#F59E3D" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* the deep-navy gem */}
        <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" fill={`url(#gm-tile-${uid})`} />
        <rect x="1.5" y="1.5" width="45" height="45" rx="13.5" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        {/* warm halo inside the lens */}
        <circle cx="24" cy="24" r="14" fill={`url(#gm-glow-${uid})`} className="ap-halo" />
        {/* iris ring */}
        <circle cx="24" cy="24" r="10.5" fill="none" stroke="rgba(255,201,120,0.5)" strokeWidth="1.3" />
        {/* four fine orbital ticks — an instrument, not a blob */}
        {[0, 90, 180, 270].map((deg) => {
          const a = ((deg - 90) * Math.PI) / 180;
          return <line key={deg} x1={r3(24 + Math.cos(a) * 9.2)} y1={r3(24 + Math.sin(a) * 9.2)} x2={r3(24 + Math.cos(a) * 11.4)} y2={r3(24 + Math.sin(a) * 11.4)} stroke="rgba(255,201,120,0.7)" strokeWidth="1.3" strokeLinecap="round" />;
        })}
        {/* the glowing eye */}
        <circle cx="24" cy="24" r="6.2" fill={`url(#gm-core-${uid})`} />
        <circle cx="24" cy="24" r="2.3" fill="#FFFFFF" className="ap-focal" style={{ filter: "drop-shadow(0 0 3px rgba(255,223,170,0.95))" }} />
      </svg>
    </span>
  );
}

// Badge + stacked wordmark lockup (nav header). Wordmark stays deep-navy so the icon's
// warm eye is the single accent — restrained, per the blue-gray system.
export function GenieLockup({ size = 40, live = false, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <GenieMark size={size} live={live} />
      <span className="leading-[1.08]" style={{ letterSpacing: "-0.01em" }}>
        <span className="block text-[15px] font-semibold" style={{ color: "var(--fg-muted)" }}>Marketing</span>
        <span className="block text-[15px] font-bold" style={{ color: "var(--fg)" }}>Genie</span>
      </span>
    </span>
  );
}

export default GenieMark;
