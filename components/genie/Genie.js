"use client";

// ── GENIE — THE APERTURE ──
// Not a ball, not a mascot, not a face. Genie is a focusing aperture of light:
// a ring/iris that orients, focuses, breathes, and blooms. Personality is
// expressed through BEHAVIOR — how it focuses and where its attention goes —
// never through cartoon expressions.
//
// The same visual DNA (a lit ring + focal bloom + warm dawn light) is the logo,
// the loading state, the scan sweep, and the ambient presence. One system.
//
// States (behaviors, not decorations):
//   idle        — slow breath, gentle orient drift (present, at rest)
//   listening   — iris widens, steady (attending to you)
//   thinking    — iris tightens, ring rotates (processing)
//   scanning    — focal sweep, ring rotates faster (examining)
//   discovering — bloom flash, iris pulses open (found something)
//   working     — steady rotation + inner light flow (executing)
//   celebrating — full bloom, rings ripple outward (success)

import { motion } from "framer-motion";

const B = {
  idle:        { irisScale: [1, 0.94, 1], ringRot: 8,  glow: [0.45, 0.62, 0.45], ringOpacity: 0.9,  spin: 60,  bloom: 0 },
  listening:   { irisScale: [1.08, 1.12, 1.08], ringRot: 4, glow: [0.55, 0.7, 0.55], ringOpacity: 1, spin: 40, bloom: 0.15 },
  thinking:    { irisScale: [0.7, 0.6, 0.7], ringRot: 20, glow: [0.4, 0.55, 0.4], ringOpacity: 0.85, spin: 14, bloom: 0 },
  scanning:    { irisScale: [0.85, 0.7, 0.85], ringRot: 30, glow: [0.6, 0.85, 0.6], ringOpacity: 1, spin: 8, bloom: 0.2 },
  discovering: { irisScale: [1, 1.25, 1], ringRot: 6, glow: [0.7, 1, 0.7], ringOpacity: 1, spin: 30, bloom: 0.7 },
  working:     { irisScale: [0.95, 1.02, 0.95], ringRot: 12, glow: [0.55, 0.78, 0.55], ringOpacity: 1, spin: 18, bloom: 0.25 },
  celebrating: { irisScale: [1.1, 1.3, 1.1], ringRot: 4, glow: [0.75, 1, 0.75], ringOpacity: 1, spin: 24, bloom: 1 },
};

export default function Genie({ state = "idle", size = 140, className = "", float = true }) {
  const b = B[state] || B.idle;

  return (
    <motion.div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
      animate={{ y: float ? [0, -7, 0] : 0 }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Warm outer glow — the dawn atmosphere the aperture casts */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ opacity: b.glow, scale: [1, 1.12, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(circle, rgba(167,139,250,0.55) 0%, rgba(124,58,237,0.32) 38%, rgba(251,146,120,0.10) 62%, transparent 74%)",
          filter: "blur(6px)",
        }}
      />

      {/* Discovery / celebration bloom — a ripple ring that expands outward */}
      {(state === "discovering" || state === "celebrating") && (
        <motion.div
          className="absolute inset-0 rounded-full border"
          style={{ borderColor: "rgba(221,214,254,0.6)" }}
          initial={{ scale: 0.6, opacity: 0.8 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="ap-core" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="30%" stopColor="#DDD6FE" stopOpacity="0.85" />
            <stop offset="70%" stopColor="#7C3AED" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ap-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#DDD6FE" />
            <stop offset="45%" stopColor="#A78BFA" />
            <stop offset="80%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#FBA678" />
          </linearGradient>
          <filter id="ap-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* The rotating aperture ring — the signature silhouette (also the logo) */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: b.spin, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "100px 100px" }}
        >
          <ApertureBlades opacity={b.ringOpacity} />
        </motion.g>

        {/* Focal iris — dilates/contracts by behavior (the "attention") */}
        <motion.circle
          cx="100" cy="100"
          animate={{ r: b.irisScale.map((s) => 34 * s) }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          fill="url(#ap-core)"
          filter="url(#ap-glow)"
        />

        {/* Bright focal point at center — the locus of attention */}
        <motion.circle
          cx="100" cy="100" r="5"
          animate={{ opacity: [0.7, 1, 0.7], r: [4, 6, 4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          fill="#FFFFFF"
          style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.9))" }}
        />

        {/* Scan sweep — a focal line that passes through when examining */}
        {state === "scanning" && (
          <motion.line
            x1="40" y1="100" x2="160" y2="100"
            stroke="rgba(221,214,254,0.8)" strokeWidth="1.5"
            animate={{ y1: [60, 140, 60], y2: [60, 140, 60], opacity: [0, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </svg>
    </motion.div>
  );
}

// The aperture blades — 6 arcs forming a camera-iris ring.
function ApertureBlades({ opacity = 1 }) {
  const blades = [];
  const count = 6;
  for (let i = 0; i < count; i++) {
    const a = (360 / count) * i;
    blades.push(
      <g key={i} transform={`rotate(${a} 100 100)`}>
        <path
          d="M100 32 A 68 68 0 0 1 159 66"
          fill="none"
          stroke="url(#ap-ring)"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity={opacity}
        />
      </g>
    );
  }
  return <g filter="url(#ap-glow)">{blades}</g>;
}

// ── The mark, extracted: a tiny static Aperture for logos / favicons / nav ──
export function GenieMark({ size = 28, className = "" }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className}>
      <defs>
        <linearGradient id="mk-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DDD6FE" />
          <stop offset="55%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#FBA678" />
        </linearGradient>
        <radialGradient id="mk-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <g key={a} transform={`rotate(${a} 100 100)`}>
          <path d="M100 32 A 68 68 0 0 1 159 66" fill="none" stroke="url(#mk-ring)" strokeWidth="9" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="100" cy="100" r="30" fill="url(#mk-core)" />
      <circle cx="100" cy="100" r="6" fill="#fff" />
    </svg>
  );
}
