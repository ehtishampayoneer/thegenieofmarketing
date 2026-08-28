"use client";

// ── THE GENIE APERTURE — the living intelligence ──
// Not a mascot, not a glowing blob: a precise luminous INSTRUMENT that observes,
// scans, thinks, discovers and acts. A single lightweight canvas draws a focusing
// aperture — an iris of fine ticks, orbiting points of light (the data it examines),
// a rotating scanner sweep, and a breathing focal core. State drives behaviour so the
// same object reads as idle / scanning / thinking / discovering / acting.
//
// Performance: one canvas, DPR-aware, capped particle count, pauses when off-screen or
// tab-hidden, and renders a single static frame under prefers-reduced-motion.

import { useRef, useEffect } from "react";

const STATES = {
  idle:        { orbit: 0.06, sweep: 0.18, pulse: 0.9,  spark: 0.004, glow: 0.5 },
  scanning:    { orbit: 0.12, sweep: 0.85, pulse: 1.2,  spark: 0.010, glow: 0.7 },
  thinking:    { orbit: 0.34, sweep: 0.55, pulse: 2.0,  spark: 0.014, glow: 0.85 },
  discovering: { orbit: 0.18, sweep: 0.40, pulse: 1.4,  spark: 0.060, glow: 1.0 },
  acting:      { orbit: 0.22, sweep: 0.70, pulse: 1.6,  spark: 0.030, glow: 0.95 },
};

// Warm light in the Genie's own accent family (amber → burnt terracotta), so the glow
// harmonises with the UI accent instead of reading as a second, different orange.
const DAWN = [230, 112, 62];   // warm terracotta-orange
const GLOW = [244, 156, 96];   // warm amber-terracotta
const CORE = [255, 240, 224];

export default function GenieAperture({ size = 120, state = "idle", className = "", style = {} }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = size, H = size;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const cx = W / 2, cy = H / 2, R = W * 0.42;

    // Orbiting data points on three concentric rings.
    const ringDefs = [
      { r: R * 0.5, n: 3, base: 0 },
      { r: R * 0.72, n: 4, base: 1.2 },
      { r: R * 0.9, n: 3, base: 2.4 },
    ];
    const points = [];
    ringDefs.forEach((rg, ri) => {
      for (let i = 0; i < rg.n; i++) {
        points.push({ ring: ri, r: rg.r, a: rg.base + (i / rg.n) * Math.PI * 2, sz: 0.9 + Math.random() * 1.1, dir: ri % 2 ? -1 : 1, twk: Math.random() * 6 });
      }
    });
    let sparks = []; // transient discovery bursts

    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    let sweepA = 0, orbitA = 0, t = 0, raf = 0, running = true;

    function frame(now) {
      if (!running) return;
      const S = STATES[stateRef.current] || STATES.idle;
      t += 0.016;
      orbitA += S.orbit * 0.016 * 4;
      sweepA += S.sweep * 0.016 * 4;
      const breathe = 1 + Math.sin(t * S.pulse) * 0.06;

      ctx.clearRect(0, 0, W, H);

      // 0) THE LENS — a deep night well so the luminous aperture GLOWS against it on
      // any page (light on white was invisible; light on dark reads like an eye).
      const lens = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.08);
      lens.addColorStop(0, "rgba(18,32,45,0.99)");
      lens.addColorStop(0.72, "rgba(9,17,25,1)");
      lens.addColorStop(0.93, "rgba(9,17,25,1)");
      lens.addColorStop(1, "rgba(9,17,25,0)");
      ctx.fillStyle = lens; ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, 7); ctx.fill();
      // outer glow bleed beyond the lens (soft warm halo on the page)
      const bleed = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.5);
      bleed.addColorStop(0, rgba(GLOW, 0.16 * S.glow));
      bleed.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bleed; ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, 7); ctx.fill();

      // 1) inner ambient glow — warm field inside the lens.
      const g = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 0.95);
      g.addColorStop(0, rgba(GLOW, 0.28 * S.glow));
      g.addColorStop(0.5, rgba(DAWN, 0.1 * S.glow));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.95, 0, 7); ctx.fill();

      // 2) the iris — a bright rim + a fine ring of ticks (an instrument, not a blob).
      ctx.strokeStyle = rgba(GLOW, 0.5); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.96, 0, 7); ctx.stroke();
      const ticks = 48;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2;
        const lit = (Math.sin(a * 3 - t * 0.6) + 1) / 2; // subtle travelling shimmer
        const r0 = R * 0.84, r1 = R * (0.9 + lit * 0.03);
        ctx.strokeStyle = rgba(DAWN, 0.22 + lit * 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      // inner iris ring
      ctx.strokeStyle = rgba(DAWN, 0.35); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, 7); ctx.stroke();

      // 3) scanner sweep — a bright wedge with a fading trail (clearly "examining").
      const trail = 0.9;
      for (let k = 0; k < 22; k++) {
        const a = sweepA - k * 0.05;
        const alpha = (1 - k / 22) * 0.5 * S.sweep;
        ctx.strokeStyle = rgba(GLOW, alpha * trail);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R * 0.96, cy + Math.sin(a) * R * 0.96);
        ctx.stroke();
      }

      // 4) orbiting data points (+ their faint tether to the core).
      for (const p of points) {
        const a = p.a + orbitA * p.dir;
        const px = cx + Math.cos(a) * p.r, py = cy + Math.sin(a) * p.r;
        const tw = 0.6 + (Math.sin(t * 2 + p.twk) + 1) / 2 * 0.4;
        ctx.strokeStyle = rgba(DAWN, 0.1 * tw);
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        // glow + crisp dot
        ctx.fillStyle = rgba(GLOW, 0.9 * tw);
        ctx.beginPath(); ctx.arc(px, py, p.sz + 0.6, 0, 7); ctx.fill();
        ctx.fillStyle = rgba(CORE, 0.9 * tw);
        ctx.beginPath(); ctx.arc(px, py, p.sz * 0.5, 0, 7); ctx.fill();
      }

      // 5) discovery sparks — occasional outward bursts.
      if (Math.random() < S.spark) {
        const a = Math.random() * Math.PI * 2;
        sparks.push({ a, r: R * 0.62, life: 1, v: 0.9 + Math.random() });
      }
      sparks = sparks.filter((s) => s.life > 0);
      for (const s of sparks) {
        s.r += s.v; s.life -= 0.03;
        const px = cx + Math.cos(s.a) * s.r, py = cy + Math.sin(s.a) * s.r;
        ctx.fillStyle = rgba(CORE, s.life * 0.9);
        ctx.beginPath(); ctx.arc(px, py, 1.6 * s.life + 0.5, 0, 7); ctx.fill();
      }

      // 6) the focal core — a bright breathing centre with a crisp white focal point.
      const cr = R * 0.2 * breathe;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 1.6);
      cg.addColorStop(0, rgba(CORE, 0.95));
      cg.addColorStop(0.4, rgba(GLOW, 0.6));
      cg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, cr * 1.6, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.4, R * 0.05), 0, 7); ctx.fill();

      raf = requestAnimationFrame(frame);
    }

    // Always paint one frame immediately so the aperture is NEVER blank (even before
    // the rAF loop starts, or in a background tab). Then run the loop unless the user
    // prefers reduced motion, in which case the single composed frame is the whole show.
    if (reduce) stateRef.current = "idle";
    running = true;
    frame(performance.now ? performance.now() : 0); // paints now + schedules next rAF
    if (reduce) { running = false; cancelAnimationFrame(raf); }

    // Pause when tab hidden or the element scrolls off-screen (battery + smoothness).
    const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!reduce && !running) { running = true; raf = requestAnimationFrame(frame); } };
    document.addEventListener("visibilitychange", onVis);
    let io;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver((es) => {
        const vis = es[0]?.isIntersecting;
        if (!vis) { running = false; cancelAnimationFrame(raf); }
        else if (!reduce && !running && !document.hidden) { running = true; raf = requestAnimationFrame(frame); }
      }, { threshold: 0 });
      io.observe(canvas);
    }

    return () => { running = false; cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); if (io) io.disconnect(); };
  }, [size]);

  return (
    <span className={`gap-aperture ${className}`} style={{ display: "inline-block", lineHeight: 0, width: size, height: size, ...style }} aria-hidden="true">
      <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} />
    </span>
  );
}
