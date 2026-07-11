"use client";

// ── THE APERTURE — Marketing Genie's one living mark ──
// A camera-iris of warm dawn light: segmented blades with visible gaps so it
// reads as a focusing lens, not a plain ring. It IS Genie's presence — the same
// DNA at every scale (favicon → nav → panel → hero). Personality through state
// (idle / working / thinking / discovering), never a face. Animation is CSS-
// driven (see globals.css .aperture*) so it stays light and respects
// prefers-reduced-motion automatically.

import React from "react";

const BLADES = 6;
const R_OUT = 80;
const R_IN = 54;

function pt(r, a) {
  const rad = ((a - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

function bladePath(i) {
  const gap = 15;
  const seg = 360 / BLADES;
  const a0 = i * seg + gap / 2;
  const a1 = (i + 1) * seg - gap / 2;
  const [x0o, y0o] = pt(R_OUT, a0);
  const [x1o, y1o] = pt(R_OUT, a1);
  const [x1i, y1i] = pt(R_IN, a1);
  const [x0i, y0i] = pt(R_IN, a0);
  return `M ${x0o} ${y0o} A ${R_OUT} ${R_OUT} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${R_IN} ${R_IN} 0 0 0 ${x0i} ${y0i} Z`;
}

/**
 * @param {"idle"|"working"|"thinking"|"discovering"} state
 * @param {number} size   px
 * @param {boolean} halo   soft dawn glow behind the iris
 * @param {boolean} static  freeze all motion (nav/favicon)
 */
export default function Aperture({
  state = "idle",
  size = 120,
  halo = true,
  static: isStatic = false,
  className = "",
}) {
  const uid = React.useId().replace(/[:]/g, "");
  const staticProp = isStatic ? { "data-static": "" } : {};
  return (
    <span
      className={`aperture ${className}`}
      data-state={state}
      {...staticProp}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <linearGradient id={`ab-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE9C4" />
            <stop offset="45%" stopColor="#FBB360" />
            <stop offset="100%" stopColor="#EF8A2C" />
          </linearGradient>
          <radialGradient id={`ac-${uid}`} cx="50%" cy="46%" r="55%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="30%" stopColor="#FFD79E" />
            <stop offset="70%" stopColor="#FBB360" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#F59E3D" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`ah-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,200,118,0.55)" />
            <stop offset="60%" stopColor="rgba(245,158,61,0.16)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {halo && (
          <circle className="ap-halo" cx="100" cy="100" r="96" fill={`url(#ah-${uid})`} />
        )}
        <g className="ap-blades">
          {Array.from({ length: BLADES }).map((_, i) => (
            <path key={i} d={bladePath(i)} fill={`url(#ab-${uid})`} />
          ))}
        </g>
        <circle className="ap-core" cx="100" cy="100" r="34" fill={`url(#ac-${uid})`} />
        <circle
          className="ap-focal"
          cx="100"
          cy="100"
          r="5"
          fill="#FFFFFF"
          style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.9))" }}
        />
      </svg>
    </span>
  );
}

// Static mark for nav / favicon / inline lockups.
export function ApertureMark({ size = 28, className = "" }) {
  return <Aperture size={size} state="idle" halo={false} static className={className} />;
}
