"use client";

// components/team/SwarmGlobe.js
// ── THE TEAM, WORKING ──
// A globe made of points of light (the particle look of a "human synthesis"
// header, turned into a world): a slowly turning sphere of drifting particles,
// grid lines drawn as dotted light, city hubs glowing, and three teams of tiny
// figures travelling between cities like traffic:
//   teal   = testers     (the simulated crowd)
//   amber  = improvers   (fixing what the crowd complained about)
//   violet = doers       (Genie's engines doing the work)
// How busy each team looks follows the real numbers passed in (`rates`), so a
// quiet day looks quiet. Plain canvas, no libraries. Honours reduced motion.

import { useEffect, useRef } from "react";
import { isLand } from "@/components/team/landMask";

export const TEAM_COLORS = { testers: "#2EE6C5", improvers: "#FFB347", doers: "#A78BFA" };
const TEAMS = ["testers", "improvers", "doers"];

// Big cities as hubs (lat, lon). Traffic runs between them along great circles.
const HUBS = [
  [40.7, -74], [34, -118.2], [41.9, -87.6], [43.7, -79.4], [19.4, -99.1], [-23.5, -46.6], [-34.6, -58.4], [4.7, -74.1],
  [51.5, -0.1], [48.9, 2.35], [52.5, 13.4], [40.4, -3.7], [41.9, 12.5], [59.3, 18.1], [55.8, 37.6], [41, 28.9],
  [30, 31.2], [6.5, 3.4], [-1.3, 36.8], [-26.2, 28], [25.2, 55.3], [24.9, 67], [31.5, 74.3], [28.6, 77.2], [19.1, 72.9],
  [13.1, 80.3], [23.8, 90.4], [1.35, 103.8], [13.8, 100.5], [-6.2, 106.8], [22.3, 114.2], [31.2, 121.5], [39.9, 116.4],
  [37.6, 127], [35.7, 139.7], [14.6, 121], [-33.9, 151.2], [-37.8, 145], [-36.8, 174.8], [21.3, -157.8],
];

const toVec = ([lat, lon]) => {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
};
function slerp(a, b, t) {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const w = Math.acos(d);
  if (w < 1e-4) return a;
  const s = Math.sin(w), k1 = Math.sin((1 - t) * w) / s, k2 = Math.sin(t * w) / s;
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2];
}

export default function SwarmGlobe({ rates = { testers: 1, improvers: 0.5, doers: 0.8 }, height = 520 }) {
  const ref = useRef(null);
  const ratesRef = useRef(rates);
  ratesRef.current = rates;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now();
    let yaw = 0.6;
    const tilt = 0.38; // northern half toward the viewer, where most hub cities are

    // The particle cloud: the continents drawn in dense points of light, the oceans
    // faint, and a loose halo drifting around the sphere.
    const cloud = [];
    for (let i = 0; i < 16000 && cloud.length < 6500; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const lat = (Math.asin(u) * 180) / Math.PI, lon = (th * 180) / Math.PI - 180;
      const land = isLand(lat, lon);
      if (!land && Math.random() > 0.1) continue;
      const lo = (lon * Math.PI) / 180;
      cloud.push({ v: [r * Math.sin(lo), u, r * Math.cos(lo)], ph: Math.random() * 6.28, land, halo: false });
    }
    for (let i = 0; i < 700; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), k = 1.04 + Math.random() * 0.4;
      cloud.push({ v: [r * Math.cos(th) * k, u * k, r * Math.sin(th) * k], ph: Math.random() * 6.28, land: false, halo: true });
    }
    // Grid lines as dotted light.
    const grid = [];
    for (let lat = -75; lat <= 75; lat += 15) for (let lon = -180; lon < 180; lon += 3) grid.push(toVec([lat, lon]));
    for (let lon = -180; lon < 180; lon += 20) for (let lat = -88; lat <= 88; lat += 3) grid.push(toVec([lat, lon]));
    const hubs = HUBS.map(toVec);
    const pulses = []; // arrival flashes

    const trips = [];
    const newTrip = (team) => {
      const a = Math.floor(Math.random() * hubs.length);
      let b = Math.floor(Math.random() * hubs.length);
      if (b === a) b = (b + 7) % hubs.length;
      return { team, a, b, t: Math.random() * 0.2, speed: 0.06 + Math.random() * 0.08, trail: [] };
    };
    const wanted = () => {
      const r = ratesRef.current || {};
      return Object.fromEntries(TEAMS.map((t) => [t, Math.round(14 + Math.min(1, Math.max(0, r[t] || 0)) * 70)]));
    };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Resizing wipes the canvas; with reduced motion there is no next frame
      // coming, so draw the still picture again.
      if (reduce && w) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function project(v, R, cx, cy) {
      // Turn (yaw), then tip (tilt), then a gentle perspective.
      const cyw = Math.cos(yaw), syw = Math.sin(yaw);
      let x = v[0] * cyw + v[2] * syw, z = -v[0] * syw + v[2] * cyw, y = v[1];
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const y2 = y * ct - z * st, z2 = y * st + z * ct;
      const p = 1 / (1 - z2 * 0.18);
      return { x: cx + x * R * p, y: cy - y2 * R * p, z: z2, p };
    }

    function figure(x, y, s, color, alpha) {
      // A tiny person: head and shoulders.
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y - s * 1.25, s * 0.55, 0, 6.283); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.8, y + s * 0.9);
      ctx.quadraticCurveTo(x - s * 0.85, y - s * 0.45, x, y - s * 0.5);
      ctx.quadraticCurveTo(x + s * 0.85, y - s * 0.45, x + s * 0.8, y + s * 0.9);
      ctx.closePath(); ctx.fill();
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!reduce) yaw += dt * 0.07;
      const R = Math.min(w, h) * 0.38, cx = w / 2, cy = h / 2 + 6;
      ctx.clearRect(0, 0, w, h);

      // Soft glow behind the globe.
      const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.5);
      g.addColorStop(0, "rgba(46,230,197,0.10)"); g.addColorStop(0.6, "rgba(90,70,200,0.05)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      // Particles, added together so dense land glows like the reference.
      const t = now / 1000;
      ctx.globalCompositeOperation = "lighter";
      for (const c of cloud) {
        const q = project(c.v, R * (1 + Math.sin(t * 0.6 + c.ph) * (c.halo ? 0.02 : 0.004)), cx, cy);
        if (q.z < -0.1 && !c.halo) continue;
        const front = Math.max(0, q.z);
        if (c.halo) { ctx.globalAlpha = 0.1 + 0.2 * (q.z + 1) / 2; ctx.fillStyle = "#7FFFE5"; }
        else if (c.land) { ctx.globalAlpha = 0.18 + 0.7 * front; ctx.fillStyle = "#35F2D0"; }
        else { ctx.globalAlpha = 0.05 + 0.18 * front; ctx.fillStyle = "#6F8CFF"; }
        const sz = (c.land ? 1.6 : 1.1) * q.p;
        ctx.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz);
      }
      ctx.globalCompositeOperation = "source-over";
      // Grid.
      ctx.fillStyle = "#9FB4FF";
      for (const v of grid) {
        const q = project(v, R, cx, cy);
        if (q.z < 0) continue;
        ctx.globalAlpha = 0.05 + 0.22 * q.z;
        ctx.fillRect(q.x, q.y, 1, 1);
      }
      // Hubs.
      for (const v of hubs) {
        const q = project(v, R, cx, cy);
        if (q.z < 0) continue;
        ctx.globalAlpha = 0.25 + 0.6 * q.z;
        ctx.fillStyle = "#E8FFFB";
        ctx.beginPath(); ctx.arc(q.x, q.y, 1.6 + q.z, 0, 6.283); ctx.fill();
      }

      // Keep each team at the size its real activity calls for.
      const want = wanted();
      for (const team of TEAMS) {
        const have = trips.filter((x) => x.team === team).length;
        if (have < want[team] && Math.random() < 0.3) trips.push(newTrip(team));
        if (have > want[team] + 4) { const i = trips.findIndex((x) => x.team === team); if (i >= 0) trips.splice(i, 1); }
      }

      for (let i = trips.length - 1; i >= 0; i--) {
        const tr = trips[i];
        tr.t += (reduce ? 0 : dt) * tr.speed;
        if (tr.t >= 1) {
          pulses.push({ v: hubs[tr.b], team: tr.team, age: 0 });
          trips[i] = { ...newTrip(tr.team), a: tr.b, t: 0 };
          continue;
        }
        const on = slerp(hubs[tr.a], hubs[tr.b], tr.t);
        const lift = 1 + Math.sin(Math.PI * tr.t) * 0.09;
        const q = project([on[0] * lift, on[1] * lift, on[2] * lift], R, cx, cy);
        tr.trail.push(q); if (tr.trail.length > 10) tr.trail.shift();
        const color = TEAM_COLORS[tr.team];
        if (q.z > -0.15) {
          // Light trail.
          ctx.strokeStyle = color; ctx.lineWidth = 1.2;
          ctx.globalAlpha = 0.35 * Math.max(0.1, q.z + 0.3);
          ctx.beginPath();
          tr.trail.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
          figure(q.x, q.y, 2.8 + 2.2 * Math.max(0, q.z), color, 0.55 + 0.45 * Math.max(0, q.z));
        }
      }

      // Arrival flashes.
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]; p.age += dt;
        if (p.age > 0.9) { pulses.splice(i, 1); continue; }
        const q = project(p.v, R, cx, cy);
        if (q.z < 0) continue;
        ctx.globalAlpha = (1 - p.age / 0.9) * 0.8;
        ctx.strokeStyle = TEAM_COLORS[p.team]; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(q.x, q.y, 3 + p.age * 16, 0, 6.283); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    // Seed the teams so the first frame is already busy.
    for (const team of TEAMS) for (let i = 0; i < 20; i++) { const tr = newTrip(team); tr.t = Math.random(); trips.push(tr); }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <div style={{ position: "relative", height, borderRadius: 20, overflow: "hidden", background: "radial-gradient(ellipse at 50% 55%, #0B1422 0%, #04060B 70%)", border: "1px solid rgba(120,160,255,0.12)" }}>
      <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} aria-label="Genie's three teams at work around the world" role="img" />
      <div style={{ position: "absolute", left: 18, bottom: 16, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: "rgba(230,240,255,0.85)", fontWeight: 600 }}>
        {[["testers", "Testers"], ["improvers", "Improvers"], ["doers", "Doers"]].map(([k, label]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: TEAM_COLORS[k], boxShadow: `0 0 10px ${TEAM_COLORS[k]}` }} />{label}
          </span>
        ))}
      </div>
    </div>
  );
}
