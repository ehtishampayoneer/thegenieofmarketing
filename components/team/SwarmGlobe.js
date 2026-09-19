"use client";

// components/team/SwarmGlobe.js
// ── THE TEAM, WORKING ──
// A world made of points of light, after the "Human Synthesis" particle header:
// on load, thousands of particles fly in from a scattered cloud and reconstruct
// the Earth (dense bright land, faint oceans), then keep breathing, with a slow
// light pulse washing over the surface. Three teams of tiny figures travel
// between cities like traffic:
//   teal   = testers     (the simulated crowd)
//   amber  = improvers   (fixing what the crowd complained about)
//   violet = doers       (Genie's engines doing the work)
// Drag to spin it; particles near the pointer scatter and glow. How busy each
// team looks follows the real numbers passed in (`rates`). The layout around it
// follows the reference: wordmark top left, the teams listed top right with live
// counts, a large headline bottom left, a short description bottom right.
// Plain canvas, no libraries. It never pauses: the teams work around the clock
// and this is the picture of that. Reduced motion slows it to a drift.

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
const easeOut = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);

export default function SwarmGlobe({ rates = { testers: 1, improvers: 0.5, doers: 0.8 }, counts = null, business = "", height = 580, compact = false }) {
  const ref = useRef(null);
  const ratesRef = useRef(rates);
  ratesRef.current = rates;
  // "Reduce animations" is a real need, but a frozen globe would say the teams
  // had stopped, which is a lie. It slows to a drift instead of stopping.
  const slowRef = useRef(1);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const apply = () => { slowRef.current = mq?.matches ? 0.25 : 1; };
    apply();
    mq?.addEventListener?.("change", apply);
    return () => mq?.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Never stops: the teams are working around the clock and this is the picture
    // of that. Reduced motion slows it to a drift rather than freezing it.
    let w = 0, h = 0, dpr = 1, raf = 0, last = performance.now();
    const born = performance.now();
    let yaw = 0.6, tilt = 0.38, spinV = 0.07, tiltV = 0;
    const pointer = { x: -1e4, y: -1e4, down: false, px: 0, py: 0 };

    // ── The particles: the continents drawn densely, oceans faint, and a loose
    // halo. Each starts somewhere in a scattered cloud and flies home.
    const cloud = [];
    const scatter = () => {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), k = 1.6 + Math.random() * 2.4;
      return [r * Math.cos(th) * k, u * k, r * Math.sin(th) * k];
    };
    // The band on the home page is a fifth of the size, so it carries a fifth of
    // the detail: the same picture, without the battery cost on a phone.
    const DOTS = compact ? 2600 : 7200, HALO = compact ? 300 : 900;
    for (let i = 0; i < 20000 && cloud.length < DOTS; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const lat = (Math.asin(u) * 180) / Math.PI, lon = (th * 180) / Math.PI - 180;
      const land = isLand(lat, lon);
      if (!land && Math.random() > 0.1) continue;
      const lo = (lon * Math.PI) / 180;
      cloud.push({ v: [r * Math.sin(lo), u, r * Math.cos(lo)], from: scatter(), delay: Math.random() * 1100, ph: Math.random() * 6.28, lat, land, halo: false });
    }
    for (let i = 0; i < HALO; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), k = 1.04 + Math.random() * 0.5;
      cloud.push({ v: [r * Math.cos(th) * k, u * k, r * Math.sin(th) * k], from: scatter(), delay: Math.random() * 1400, ph: Math.random() * 6.28, lat: 0, land: false, halo: true });
    }
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
      for (const t of trips) t.trail.length = 0;
      // Resizing wipes the canvas, so draw the next frame immediately rather
      // than leaving a blank box for a beat.
      if (w) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let onScreen = true;
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }, { rootMargin: "120px" });
    io.observe(canvas);

    // ── Pointer: drag to spin, hover to scatter. ──
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const onMove = (e) => {
      const [x, y] = pos(e);
      if (pointer.down) { spinV = (x - pointer.px) * 0.25; tiltV = (y - pointer.py) * 0.12; yaw += (x - pointer.px) * 0.006; tilt = Math.max(-0.9, Math.min(0.9, tilt + (y - pointer.py) * 0.004)); }
      pointer.px = x; pointer.py = y; pointer.x = x; pointer.y = y;
    };
    const onDown = (e) => { pointer.down = true; [pointer.px, pointer.py] = pos(e); canvas.setPointerCapture?.(e.pointerId); };
    const onUp = () => { pointer.down = false; };
    const onLeave = () => { pointer.x = -1e4; pointer.y = -1e4; pointer.down = false; };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    function project(v, R, cx, cy) {
      // Turn (yaw), then tip (tilt), then a gentle perspective.
      const cyw = Math.cos(yaw), syw = Math.sin(yaw);
      const x = v[0] * cyw + v[2] * syw, z = -v[0] * syw + v[2] * cyw, y = v[1];
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
      const slow = slowRef.current;
      const age = now - born;
      if (!pointer.down) {
        // Spin eases back to a slow drift after a drag.
        spinV += (0.07 - spinV) * Math.min(1, dt * 1.5);
        tiltV *= 0.9;
        yaw += dt * spinV * slow;
        tilt += (0.38 - tilt) * Math.min(1, dt * 0.4);
      }
      const R = Math.min(w * 0.62, h) * 0.4, cx = w * 0.5, cy = h * 0.5 + 4;
      ctx.clearRect(0, 0, w, h);

      // Soft glow behind the globe.
      const g = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.6);
      g.addColorStop(0, "rgba(46,230,197,0.12)"); g.addColorStop(0.55, "rgba(90,70,200,0.05)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      const t = now / 1000;
      // A slow light pulse that sweeps from pole to pole every ~9 seconds.
      const sweep = ((t % 9) / 9) * 180 - 90;

      // ── Particles, added together so dense land glows ──
      ctx.globalCompositeOperation = "lighter";
      for (const c of cloud) {
        const k = easeOut((age - c.delay) / 1900);
        let v = c.v;
        if (k < 1) {
          const f = c.from;
          v = [f[0] + (c.v[0] - f[0]) * k, f[1] + (c.v[1] - f[1]) * k, f[2] + (c.v[2] - f[2]) * k];
        }
        const breathe = 1 + Math.sin(t * 0.7 + c.ph) * (c.halo ? 0.02 : 0.004);
        const wave = !c.halo && k >= 1 ? Math.max(0, 1 - Math.abs(c.lat - sweep) / 9) : 0;
        const q = project(v, R * breathe * (1 + wave * 0.02), cx, cy);
        if (q.z < -0.1 && !c.halo && k >= 1) continue;
        let x = q.x, y = q.y, glow = 0;
        // Near the pointer: nudge away and light up.
        const dx = x - pointer.x, dy = y - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < 4900) { const d = Math.sqrt(d2) || 1, push = (1 - d / 70) * 9; x += (dx / d) * push; y += (dy / d) * push; glow = 1 - d / 70; }
        const front = Math.max(0, q.z);
        const flying = 1 - k;
        if (c.halo) { ctx.globalAlpha = 0.1 + 0.2 * (q.z + 1) / 2; ctx.fillStyle = "#7FFFE5"; }
        else if (c.land) { ctx.globalAlpha = Math.min(1, 0.18 + 0.7 * front + wave * 0.5 + glow * 0.6 + flying * 0.4); ctx.fillStyle = wave > 0.3 ? "#B9FFF1" : "#35F2D0"; }
        else { ctx.globalAlpha = Math.min(1, 0.05 + 0.18 * front + wave * 0.25 + glow * 0.5 + flying * 0.3); ctx.fillStyle = "#6F8CFF"; }
        const sz = (c.land ? 1.6 : 1.1) * q.p * (1 + glow * 0.8);
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      ctx.globalCompositeOperation = "source-over";

      // Once the Earth has formed: cities, then the teams at work.
      const formed = easeOut((age - 1500) / 900);
      if (formed > 0) {
        for (const v of hubs) {
          const q = project(v, R, cx, cy);
          if (q.z < 0) continue;
          ctx.globalAlpha = (0.25 + 0.6 * q.z) * formed;
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
          tr.t += dt * slow * tr.speed;
          if (tr.t >= 1) {
            pulses.push({ v: hubs[tr.b], team: tr.team, age: 0 });
            trips[i] = { ...newTrip(tr.team), a: tr.b, t: 0 };
            continue;
          }
          const on = slerp(hubs[tr.a], hubs[tr.b], tr.t);
          const lift = 1 + Math.sin(Math.PI * tr.t) * 0.09;
          const q = project([on[0] * lift, on[1] * lift, on[2] * lift], R, cx, cy);
          if (Number.isFinite(q.x) && Number.isFinite(q.y)) { tr.trail.push(q); if (tr.trail.length > 10) tr.trail.shift(); }
          const color = TEAM_COLORS[tr.team];
          if (q.z > -0.15) {
            ctx.strokeStyle = color; ctx.lineWidth = 1.2;
            ctx.globalAlpha = 0.35 * Math.max(0.1, q.z + 0.3) * formed;
            if (tr.trail.length > 1) {
              ctx.beginPath();
              tr.trail.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
              ctx.stroke();
            }
            figure(q.x, q.y, 2.8 + 2.2 * Math.max(0, q.z), color, (0.55 + 0.45 * Math.max(0, q.z)) * formed);
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
      }
      ctx.globalAlpha = 1;
      // Scrolled out of view, there is nothing to paint for. Not a pause: the
      // work carries on, and so does the picture the moment it is seen again.
      raf = onScreen ? requestAnimationFrame(frame) : 0;
    }
    // Seed the teams so the globe is busy as soon as it has formed.
    for (const team of TEAMS) for (let i = 0; i < 20; i++) { const tr = newTrip(team); tr.t = Math.random(); trips.push(tr); }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [compact]);

  const total = counts ? (counts.testers || 0) + (counts.improvers || 0) + (counts.doers || 0) : null;
  const txt = "rgba(236,244,255,0.95)";
  const cx = compact ? "sg-sm " : "";
  return (
    <div className={`${cx}sg-wrap`} style={{ position: "relative", height, borderRadius: 22, overflow: "hidden", background: "radial-gradient(ellipse at 50% 52%, #0B1624 0%, #03050A 68%)", border: "1px solid rgba(120,160,255,0.12)" }}>
      <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block", cursor: "grab", touchAction: "none" }} aria-label="Genie's three teams at work around the world. Drag to spin." role="img" />

      {/* Top left: the wordmark. */}
      <p style={{ position: "absolute", left: 26, top: 22, margin: 0, color: txt, fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em", pointerEvents: "none" }}>
        Genie <span style={{ fontWeight: 500, fontSize: 12.5, color: "rgba(180,255,240,0.8)", marginLeft: 6 }}>● Live</span>
      </p>

      {/* Top right: the teams, like the reference's menu, with live counts. */}
      <ul style={{ position: "absolute", right: 26, top: 20, margin: 0, padding: 0, listStyle: "none", textAlign: "right", pointerEvents: "none" }}>
        {[["testers", "Testers"], ["improvers", "Improvers"], ["doers", "Doers"]].map(([k, label]) => (
          <li key={k} style={{ color: txt, fontWeight: 600, fontSize: "clamp(13px,1.35vw,18px)", letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 2 }}>
            {counts ? <span style={{ fontWeight: 500, color: "rgba(236,244,255,0.6)", marginRight: 8, fontVariantNumeric: "tabular-nums" }}>{Number(counts[k] || 0).toLocaleString()}</span> : null}
            {label}
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: TEAM_COLORS[k], boxShadow: `0 0 10px ${TEAM_COLORS[k]}`, marginLeft: 10, verticalAlign: "middle" }} />
          </li>
        ))}
      </ul>

      {/* Along the bottom: the headline, and what this is. One row, so the two can
          never run into each other however narrow the card gets. */}
      <div className="sg-foot">
        <p className="sg-head">
          {total != null ? <>{total.toLocaleString()}<br />at work</> : <>Your team<br />at work</>}
        </p>
        <p className="sg-desc">
          Simulated customers, specialists and engines reconstruct your market and work on it around the clock{business ? ` for ${business}` : ""}. Drag the world to spin it.
        </p>
      </div>
      <style>{`
        .sg-foot{position:absolute;left:26px;right:26px;bottom:20px;display:flex;align-items:flex-end;justify-content:space-between;gap:26px;pointer-events:none}
        .sg-head{margin:0;flex:0 0 auto;color:${txt};font-weight:800;letter-spacing:-0.035em;line-height:.92;font-size:clamp(34px,4.6vw,76px)}
        .sg-desc{margin:0;flex:0 1 330px;min-width:0;color:rgba(226,236,250,0.78);font-size:14px;line-height:1.55;text-align:right}
        @media (max-width:1000px){.sg-desc{display:none}}
        .sg-sm .sg-desc{display:none}
        /* On a phone the band is barely wider than the globe, so the team list
           lands on top of it. The caption under the band names the teams anyway. */
        @media (max-width:560px){.sg-sm ul{display:none}}
        .sg-sm .sg-head{font-size:clamp(28px,3.4vw,44px)}
        .sg-sm .sg-foot{left:20px;right:20px;bottom:14px}
        @media (max-width:720px){.sg-foot{left:16px;right:16px;bottom:14px}.sg-wrap ul{top:14px!important;right:16px!important}}
      `}</style>
    </div>
  );
}
