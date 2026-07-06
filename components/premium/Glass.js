"use client";

// Premium primitives for the dark experience: glassmorphic surfaces, count-up
// numbers, and a satisfying approve button. Reused across every new screen.

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";

export function GlassPanel({ children, className = "", glow = false, ...rest }) {
  return (
    <div
      className={`relative rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl shadow-glass ${glow ? "shadow-glow-soft" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CountUp({ value = 0, duration = 1.2, className = "" }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: "easeOut" });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => { controls.stop(); unsub(); };
  }, [value, duration]);
  return <span className={className}>{display}</span>;
}

export function ApproveButton({ onClick, children = "Approve", className = "", ...rest }) {
  const [burst, setBurst] = useState(false);
  function handle(e) {
    setBurst(true);
    setTimeout(() => setBurst(false), 600);
    onClick?.(e);
  }
  return (
    <motion.button
      onClick={handle}
      whileTap={{ scale: 0.97 }}
      className={`relative overflow-hidden rounded-2xl font-bold text-white ${className}`}
      style={{ background: "linear-gradient(135deg, #7C3AED, #4F46E5)", boxShadow: "0 8px 24px rgba(124,58,237,0.4)" }}
      {...rest}
    >
      {burst && (
        <motion.span
          className="absolute inset-0"
          initial={{ opacity: 0.7, scale: 0 }}
          animate={{ opacity: 0, scale: 2 }}
          transition={{ duration: 0.6 }}
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.6), transparent 60%)" }}
        />
      )}
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}

export function GradientText({ children, className = "" }) {
  return (
    <span
      className={className}
      style={{ background: "linear-gradient(120deg, #DDD6FE, #A78BFA, #818CF8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
    >
      {children}
    </span>
  );
}
