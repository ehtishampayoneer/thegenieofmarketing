"use client";

// ── THE LIVING GENIE ──
// The floating genie mascot (transparent cutout from the sprite sheet) with a soft
// royal-blue portal glow and a gentle idle bob. Same props as before (size, state)
// so every existing call site keeps working; `state` just tunes how alive it feels.

export default function GenieAperture({ size = 120, state = "idle", className = "", style = {} }) {
  const active = /scan|think|work|act|discover/.test(state || "");
  return (
    <span className={`genie-stage ${className}`} data-active={active ? "true" : undefined} style={{ width: size, height: size, ...style }} aria-hidden="true">
      <img className="genie-stage-fig genie-bob" src="/genie-idle.png" alt="" draggable="false" />
    </span>
  );
}
