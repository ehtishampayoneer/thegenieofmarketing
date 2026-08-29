"use client";

// ── THE LIVING GENIE ──
// An idle-animated genie: a base pose is always shown, and two other keyed poses
// cross-fade in and out over it, so he subtly shifts/gestures like a floating genie
// (no jump, no blank frame). Plus a gentle bob and a soft royal-blue portal glow.
// Same props (size, state) as before, so every call site keeps working.

export default function GenieAperture({ size = 120, state = "idle", className = "", style = {} }) {
  const active = /scan|think|work|act|discover/.test(state || "");
  return (
    <span className={`genie-stage ${className}`} data-active={active ? "true" : undefined} style={{ width: size, height: size, ...style }} aria-hidden="true">
      <span className="genie-stage-inner genie-bob">
        <img className="genie-frame genie-frame-base" src="/genie-idle.png" alt="" draggable="false" />
        <img className="genie-frame genie-frame-alt" src="/genie-idle-2.png" alt="" draggable="false" style={{ animationDelay: "0s" }} />
        <img className="genie-frame genie-frame-alt" src="/genie-idle-3.png" alt="" draggable="false" style={{ animationDelay: "6s" }} />
      </span>
    </span>
  );
}
