"use client";

// ── THE APERTURE FIELD ──
// The background is not decoration — it's the light the aperture casts.
// A warm dawn gradient (deep base rising to a soft horizon glow) filled with
// out-of-focus BOKEH orbs — the depth-of-field signature of the whole system.
// Soft, slow, alive. Every dark screen sits in this field.

import { motion } from "framer-motion";
import { useState } from "react";

export default function AuroraBackground({ intensity = 1, bokeh = 9 }) {
  const [orbs] = useState(() =>
    Array.from({ length: bokeh }, () => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 60 + Math.random() * 180,
      blur: 20 + Math.random() * 40,
      hue: Math.random(),
      dur: 16 + Math.random() * 16,
      delay: Math.random() * 8,
      drift: 6 + Math.random() * 10,
      op: 0.12 + Math.random() * 0.22,
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* Dawn base — deep at the foot, warming toward a soft horizon */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 8%, #1E1440 0%, #120C24 40%, #0A0716 72%, #070510 100%)",
        }}
      />
      {/* Warm horizon glow low on the screen (the dawn) */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background:
            "radial-gradient(80% 100% at 50% 120%, rgba(251,146,120,0.14), rgba(124,58,237,0.08) 40%, transparent 70%)",
          opacity: intensity,
        }}
      />

      {/* Depth-of-field bokeh — the aperture's out-of-focus light */}
      {orbs.map((o, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${o.left}%`,
            top: `${o.top}%`,
            width: o.size,
            height: o.size,
            filter: `blur(${o.blur}px)`,
            opacity: o.op * intensity,
            background:
              o.hue > 0.66
                ? "radial-gradient(circle, rgba(251,166,120,0.9), transparent 70%)"
                : o.hue > 0.33
                ? "radial-gradient(circle, rgba(167,139,250,0.9), transparent 70%)"
                : "radial-gradient(circle, rgba(99,102,241,0.9), transparent 70%)",
          }}
          animate={{
            x: [0, o.drift, 0],
            y: [0, -o.drift, 0],
            opacity: [o.op * intensity, o.op * intensity * 1.6, o.op * intensity],
          }}
          transition={{ duration: o.dur, repeat: Infinity, delay: o.delay, ease: "easeInOut" }}
        />
      ))}

      {/* Fine grain sparks — dust in the light */}
      {Array.from({ length: 16 }).map((_, i) => (
        <motion.span
          key={`s${i}`}
          className="absolute rounded-full bg-white"
          style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, width: 2, height: 2, opacity: 0.35 }}
          animate={{ opacity: [0, 0.6, 0], y: [0, -18, 0] }}
          transition={{ duration: 6 + (i % 5), repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
        />
      ))}

      {/* Focal vignette — pulls the eye to center, reinforces depth of field */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 42%, transparent 38%, rgba(7,5,16,0.72) 100%)" }}
      />
    </div>
  );
}
