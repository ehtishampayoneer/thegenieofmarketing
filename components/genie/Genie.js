"use client";

// ── THE GENIE ──
// Not a plain orb. An intelligent AI spirit: a luminous core with a soft aura,
// two expressive eyes, and a particle field. It genuinely expresses — it blinks,
// glances toward its work, narrows when thinking, brightens when it discovers,
// and bursts when celebrating. This is the brand.
//
// States: idle | thinking | scanning | discovering | working | celebrating | speaking
// Built in SVG + framer-motion so it's crisp at any size.

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export default function Genie({ state = "idle", size = 120, className = "" }) {
  const [blink, setBlink] = useState(false);

  // Natural blinking (paused while celebrating — eyes are wide with joy).
  useEffect(() => {
    if (state === "celebrating") return;
    let alive = true;
    function loop() {
      const next = 2200 + Math.random() * 3200;
      setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => setBlink(false), 130);
        loop();
      }, next);
    }
    loop();
    return () => { alive = false; };
  }, [state]);

  const cfg = STATE_CONFIG[state] || STATE_CONFIG.idle;

  return (
    <motion.div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
      animate={{ y: cfg.float ? [0, -8, 0] : 0 }}
      transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Outer aura */}
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          opacity: cfg.auraOpacity,
          scale: cfg.auraScale,
        }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: "radial-gradient(circle, rgba(124,58,237,0.55) 0%, rgba(79,70,229,0.25) 40%, transparent 70%)",
          filter: "blur(8px)",
        }}
      />

      {/* Orbiting particles */}
      <Particles count={cfg.particles} size={size} speed={cfg.particleSpeed} />

      {/* The body */}
      <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="genieCore" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#DDD6FE" />
            <stop offset="35%" stopColor="#A78BFA" />
            <stop offset="70%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#5B21B6" />
          </radialGradient>
          <radialGradient id="genieHi" cx="35%" cy="28%" r="40%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <filter id="genieGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Core body — a soft rounded spirit form */}
        <motion.g
          animate={{ scale: cfg.bodyScale }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "60px 60px" }}
        >
          <circle cx="60" cy="60" r="42" fill="url(#genieCore)" filter="url(#genieGlow)" />
          <circle cx="60" cy="60" r="42" fill="url(#genieHi)" />

          {/* Eyes */}
          <Eyes state={state} blink={blink} />
        </motion.g>
      </svg>

      {/* Discovery spark */}
      <AnimatePresence>
        {state === "discovering" && (
          <motion.div
            key="spark"
            className="absolute -top-1 -right-1 text-lg"
            initial={{ scale: 0, rotate: -30, opacity: 0 }}
            animate={{ scale: [0, 1.3, 1], rotate: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            ✨
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Eyes({ state, blink }) {
  // Eye shape/position by emotion.
  const thinking = state === "thinking";
  const scanning = state === "scanning";
  const celebrating = state === "celebrating";
  const discovering = state === "discovering";

  const eyeGaze = scanning ? 4 : 0; // glance toward work (right)
  const ry = blink ? 0.8 : celebrating ? 9 : thinking ? 4 : 7;
  const cy = celebrating ? 54 : 56;

  return (
    <motion.g
      animate={{ x: eyeGaze }}
      transition={{ duration: 1.4, repeat: scanning ? Infinity : 0, repeatType: "reverse", ease: "easeInOut" }}
    >
      {/* Left eye */}
      <motion.ellipse
        cx="47" cy={cy} rx="5.5" ry={ry}
        fill="#1A0B3B"
        animate={ celebrating ? { ry: [9, 3, 9] } : {} }
        transition={{ duration: 0.6, repeat: celebrating ? Infinity : 0 }}
      />
      {/* Right eye */}
      <motion.ellipse
        cx="73" cy={cy} rx="5.5" ry={ry}
        fill="#1A0B3B"
        animate={ celebrating ? { ry: [9, 3, 9] } : {} }
        transition={{ duration: 0.6, repeat: celebrating ? Infinity : 0, delay: 0.05 }}
      />
      {/* Eye shine */}
      {!blink && (
        <>
          <circle cx="49" cy={cy - 2.5} r="1.6" fill="rgba(255,255,255,0.85)" />
          <circle cx="75" cy={cy - 2.5} r="1.6" fill="rgba(255,255,255,0.85)" />
        </>
      )}
      {/* Thinking: a tiny raised "brow" tilt via small arcs */}
      {thinking && (
        <motion.g
          animate={{ y: [0, -1.5, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <rect x="42" y="46" width="11" height="1.6" rx="1" fill="#DDD6FE" opacity="0.7" transform="rotate(-8 47 46)" />
          <rect x="67" y="46" width="11" height="1.6" rx="1" fill="#DDD6FE" opacity="0.7" transform="rotate(8 73 46)" />
        </motion.g>
      )}
      {/* Happy cheeks when celebrating/discovering */}
      {(celebrating || discovering) && (
        <>
          <circle cx="40" cy="66" r="3.5" fill="rgba(244,114,182,0.5)" />
          <circle cx="80" cy="66" r="3.5" fill="rgba(244,114,182,0.5)" />
        </>
      )}
      {/* Gentle smile */}
      <motion.path
        d={celebrating ? "M50 70 Q60 80 70 70" : discovering ? "M52 69 Q60 75 68 69" : "M53 69 Q60 73 67 69"}
        stroke="#1A0B3B" strokeWidth="2.5" strokeLinecap="round" fill="none"
      />
    </motion.g>
  );
}

function Particles({ count = 6, size = 120, speed = 8 }) {
  const [dots] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      angle: (360 / count) * i,
      radius: size * (0.42 + Math.random() * 0.12),
      dur: speed * (0.7 + Math.random() * 0.6),
      delay: Math.random() * speed,
    }))
  );
  return (
    <div className="absolute inset-0">
      {dots.map((d, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            width: 3, height: 3, top: "50%", left: "50%",
            background: "radial-gradient(circle, #DDD6FE, #7C3AED)",
            boxShadow: "0 0 6px rgba(167,139,250,0.9)",
          }}
          animate={{
            x: [Math.cos((d.angle) * Math.PI / 180) * d.radius, Math.cos((d.angle + 360) * Math.PI / 180) * d.radius],
            y: [Math.sin((d.angle) * Math.PI / 180) * d.radius, Math.sin((d.angle + 360) * Math.PI / 180) * d.radius],
            opacity: [0.3, 0.9, 0.3],
          }}
          transition={{ duration: d.dur, repeat: Infinity, ease: "linear", delay: d.delay }}
        />
      ))}
    </div>
  );
}

const STATE_CONFIG = {
  idle:        { float: true,  auraOpacity: [0.4, 0.6, 0.4], auraScale: [1, 1.08, 1], bodyScale: [1, 1.02, 1], particles: 5, particleSpeed: 10 },
  thinking:    { float: true,  auraOpacity: [0.3, 0.5, 0.3], auraScale: [1, 1.05, 1], bodyScale: [1, 1.01, 1], particles: 8, particleSpeed: 5 },
  scanning:    { float: false, auraOpacity: [0.5, 0.8, 0.5], auraScale: [1, 1.12, 1], bodyScale: [1, 1.03, 1], particles: 10, particleSpeed: 4 },
  discovering: { float: true,  auraOpacity: [0.6, 0.95, 0.6], auraScale: [1, 1.18, 1], bodyScale: [1, 1.06, 1], particles: 12, particleSpeed: 3 },
  working:     { float: true,  auraOpacity: [0.5, 0.75, 0.5], auraScale: [1, 1.1, 1], bodyScale: [1, 1.03, 1], particles: 9, particleSpeed: 5 },
  celebrating: { float: true,  auraOpacity: [0.7, 1, 0.7], auraScale: [1, 1.25, 1], bodyScale: [1, 1.08, 1], particles: 16, particleSpeed: 2.5 },
  speaking:    { float: true,  auraOpacity: [0.45, 0.65, 0.45], auraScale: [1, 1.07, 1], bodyScale: [1, 1.025, 1], particles: 6, particleSpeed: 8 },
};
