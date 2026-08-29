"use client";

// ── THE LIVING GENIE ──
// The suited-genie mascot (genie-hero.png, background removed) floating with a gentle
// bob, over a drift of blue "smoke" particles rising from his tail — so he feels alive,
// not a static cut-out. Same props (size, state) as before; `state` speeds up the smoke.

const SMOKE = [0, 1, 2, 3, 4, 5];

export default function GenieAperture({ size = 120, state = "idle", className = "", style = {} }) {
  const active = /scan|think|work|act|discover/.test(state || "");
  return (
    <span className={`genie-stage ${className}`} data-active={active ? "true" : undefined} style={{ width: size, height: size, ...style }} aria-hidden="true">
      <span className="genie-smoke">{SMOKE.map((i) => <i key={i} />)}</span>
      <span className="genie-stage-inner genie-bob">
        <img className="genie-frame genie-frame-base" src="/genie-hero.png" alt="" draggable="false" />
      </span>
    </span>
  );
}
