"use client";

// ── GENIE — THE APERTURE (v2, legible) ──
// A camera-iris of light: SEGMENTED blades with visible gaps so it reads as a
// focusing aperture, NOT a plain circle. Sharp contrast, a real lens iris, a
// bright focal center. Personality through behavior (focus, sweep, bloom),
// never a face. Same DNA = logo, loading, scan.

import { motion } from "framer-motion";

const B = {
  idle:        { iris: [1, 0.92, 1],    spin: 48, glow: [0.5, 0.7, 0.5],  bloom: 0 },
  listening:   { iris: [1.06, 1.12, 1.06], spin: 40, glow: [0.6, 0.8, 0.6], bloom: 0 },
  thinking:    { iris: [0.62, 0.5, 0.62], spin: 12, glow: [0.45, 0.6, 0.45], bloom: 0 },
  scanning:    { iris: [0.8, 0.62, 0.8], spin: 7,  glow: [0.65, 0.95, 0.65], bloom: 0 },
  discovering: { iris: [1, 1.22, 1],    spin: 26, glow: [0.8, 1, 0.8],    bloom: 1 },
  working:     { iris: [0.94, 1.02, 0.94], spin: 16, glow: [0.6, 0.85, 0.6], bloom: 0 },
  celebrating: { iris: [1.08, 1.28, 1.08], spin: 22, glow: [0.85, 1, 0.85], bloom: 1 },
};

const BLADES = 6;
const R_OUT = 78;
const R_IN = 52;

export default function Genie({ state = "idle", size = 150, className = "", float = true }) {
  const b = B[state] || B.idle;

  return (
    <motion.div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
      animate={{ y: float ? [0, -6, 0] : 0 }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Warm glow behind the aperture (readable halo, not a wash) */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{ opacity: b.glow, scale: [1, 1.1, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(circle, rgba(167,139,250,0.6) 0%, rgba(124,58,237,0.3) 42%, transparent 68%)",
          filter: "blur(4px)",
        }}
      />

      {/* Discovery / celebrate ripple */}
      {(state === "discovering" || state === "celebrating") && (
        <motion.div
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: "rgba(221,214,254,0.7)" }}
          initial={{ scale: 0.55, opacity: 0.9 }}
          animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="ap-blade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F5F3FF" />
            <stop offset="45%" stopColor="#C4B5FD" />
            <stop offset="80%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#FBA678" />
          </linearGradient>
          <radialGradient id="ap-iris" cx="50%" cy="46%" r="55%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="26%" stopColor="#E9D5FF" />
            <stop offset="60%" stopColor="#8B5CF6" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
          </radialGradient>
          <filter id="ap-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Segmented aperture blades — WITH GAPS (reads as an iris, not a ring) */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: b.spin, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "100px 100px" }}
          filter="url(#ap-soft)"
        >
          {Array.from({ length: BLADES }).map((_, i) => {
            const gap = 14; // degrees of gap between blades
            const seg = 360 / BLADES;
            const a0 = i * seg + gap / 2;
            const a1 = (i + 1) * seg - gap / 2;
            return <IrisBlade key={i} a0={a0} a1={a1} />;
          })}
        </motion.g>

        {/* Focal iris core — dilates by behavior */}
        <motion.circle
          cx="100" cy="100"
          animate={{ r: b.iris.map((s) => 30 * s) }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          fill="url(#ap-iris)"
        />
        {/* Inner lens ring for depth */}
        <motion.circle
          cx="100" cy="100"
          animate={{ r: b.iris.map((s) => 30 * s) }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          fill="none" stroke="rgba(221,214,254,0.5)" strokeWidth="1"
        />
        {/* Bright focal point */}
        <motion.circle
          cx="100" cy="100"
          animate={{ opacity: [0.85, 1, 0.85], r: [3.5, 5.5, 3.5] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          fill="#FFFFFF"
          style={{ filter: "drop-shadow(0 0 8px rgba(255,255,255,1))" }}
        />

        {/* Scan sweep line */}
        {state === "scanning" && (
          <motion.line
            x1="46" x2="154"
            stroke="rgba(233,213,255,0.9)" strokeWidth="2"
            animate={{ y1: [58, 142, 58], y2: [58, 142, 58], opacity: [0, 1, 0] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </svg>
    </motion.div>
  );
}

// One aperture blade: a thick arc segment between two angles, capped.
function IrisBlade({ a0, a1 }) {
  const p = (r, a) => {
    const rad = (a - 90) * Math.PI / 180;
    return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
  };
  const [x0o, y0o] = p(R_OUT, a0);
  const [x1o, y1o] = p(R_OUT, a1);
  const [x1i, y1i] = p(R_IN, a1);
  const [x0i, y0i] = p(R_IN, a0);
  const large = 0;
  const d = `M ${x0o} ${y0o} A ${R_OUT} ${R_OUT} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${R_IN} ${R_IN} 0 ${large} 0 ${x0i} ${y0i} Z`;
  return <path d={d} fill="url(#ap-blade)" />;
}

// ── Static mark for logo / favicon / nav ──
export function GenieMark({ size = 28, className = "" }) {
  const p = (r, a) => {
    const rad = (a - 90) * Math.PI / 180;
    return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
  };
  const blade = (i) => {
    const gap = 16, seg = 60, a0 = i * seg + gap / 2, a1 = (i + 1) * seg - gap / 2;
    const [x0o, y0o] = p(74, a0), [x1o, y1o] = p(74, a1), [x1i, y1i] = p(50, a1), [x0i, y0i] = p(50, a0);
    return `M ${x0o} ${y0o} A 74 74 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A 50 50 0 0 0 ${x0i} ${y0i} Z`;
  };
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className}>
      <defs>
        <linearGradient id="mk-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DDD6FE" /><stop offset="60%" stopColor="#8B5CF6" /><stop offset="100%" stopColor="#FBA678" />
        </linearGradient>
        <radialGradient id="mk-c" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" /><stop offset="70%" stopColor="#A78BFA" /><stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={blade(i)} fill="url(#mk-b)" />)}
      <circle cx="100" cy="100" r="26" fill="url(#mk-c)" />
      <circle cx="100" cy="100" r="6" fill="#fff" />
    </svg>
  );
}
