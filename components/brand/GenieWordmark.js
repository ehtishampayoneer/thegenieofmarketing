"use client";

// ── THE MARKETING GENIE LOCKUP (drawn, not an image) ──
// Replaces the flat logo.png in the nav and on the sign-in screen.
//
// Why: in the PNG, "MARKETING" is only ~7.5% of the image height, so at any
// size that fits a sidebar it rendered around 3px tall and could not be read.
// Making it legible meant making the whole logo too big for the slot. The word
// was also baked into the artwork in black, so on the dark stages it vanished
// entirely, and the only fix was a CSS invert filter that the self-contained
// dark worlds never picked up.
//
// Drawing it solves all of that at once:
//   • type is real type, so it is crisp at any size and always legible
//   • colours come from theme tokens, so it can never be black-on-black again
//   • it is a few hundred bytes instead of a 380KB PNG
//
// The design keeps the existing brand's DNA rather than inventing a new one:
// the rising blue swirl (the genie's smoke), the four-point sparkle, and the
// stacked "MARKETING" over "genie" arrangement of the original artwork.

import React from "react";

// ── The mark ─────────────────────────────────────────────────────────────────
// A rounded tile carrying a rising swirl and a sparkle. Reads as a genie's
// smoke at 20px and still holds up at 200px, which a detailed illustration
// would not. Geometry is deliberately simple: two arcs of even stroke weight,
// round caps, and one star.
export function GenieGlyph({ size = 34, className = "", title }) {
  const id = React.useId();
  return (
    <svg
      width={size} height={size} viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : "true"}
      style={{ display: "block", flex: "none" }}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand-mark-from, #2C6FE0)" />
          <stop offset="100%" stopColor="var(--brand-mark-to, #0040DD)" />
        </linearGradient>
      </defs>

      {/* The tile. rx is ~27% of the box, which is the proportion Apple uses for
          app icons and reads as a squircle rather than a rounded rectangle. */}
      <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill={`url(#${id}-g)`} />

      {/* A geometric "G" — the letter the original artwork leads with, rebuilt
          as pure geometry so it is unmistakable at 20px. The arc's endpoints are
          computed on a circle (r=13 about the centre) rather than eyeballed as
          beziers, which is the difference between a monogram that looks drawn
          and one that looks sketched. An earlier attempt used a freehand swirl
          meant to suggest smoke; at small sizes it just read as an "S". */}
      <g fill="none" stroke="#FFFFFF" strokeWidth="4.1" strokeLinecap="round">
        <path d="M34.78 16.73 A 13 13 0 1 0 36.93 25.36" />
        {/* The crossbar into the terminal, which is what makes a C into a G. */}
        <path d="M36.93 25.36 H 27.2" />
      </g>
    </svg>
  );
}

// ── The full lockup ──────────────────────────────────────────────────────────
// "MARKETING" sits above "Genie" exactly as in the original artwork, but both
// are real text, so the small word is always readable and both follow the theme.
//
// `size` drives everything from one number: it is the cap height of "Genie".
export function GenieWordmark({ size = 21, className = "", showMark = true }) {
  const kicker = Math.max(8.5, Math.round(size * 0.44 * 10) / 10);
  return (
    <span
      className={className}
      role="img"
      aria-label="Marketing Genie"
      style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.46), lineHeight: 1 }}
    >
      {showMark && <GenieGlyph size={Math.round(size * 1.62)} />}
      <span style={{ display: "flex", flexDirection: "column", gap: Math.round(size * 0.12) }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: Math.round(kicker * 0.5),
            fontSize: kicker,
            fontWeight: 600,
            // Wide tracking is what makes a small uppercase word read as a
            // deliberate kicker instead of cramped small text.
            letterSpacing: "0.19em",
            textTransform: "uppercase",
            color: "var(--brand-kicker, var(--accent-ink))",
            lineHeight: 1,
          }}
        >
          Marketing
          {/* The four-point sparkle from the original artwork. It lives here
              rather than inside the tile: at icon sizes it crowded the monogram
              and read as an accident, but on the kicker line it has air and
              carries the brand's glint. Concave sides so it reads as a glint
              rather than a plus sign. */}
          <svg width={kicker * 0.82} height={kicker * 0.82} viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block", marginLeft: `-${kicker * 0.12}px` }}>
            <path d="M8 0c.9 5.3 1.8 6.2 8 7-6.2.8-7.1 1.7-8 7-.9-5.3-1.8-6.2-8-7 6.2-.8 7.1-1.7 8-7Z" fill="currentColor" />
          </svg>
        </span>
        <span
          style={{
            fontSize: size,
            fontWeight: 700,
            letterSpacing: "-0.021em",
            color: "var(--brand-word, var(--fg))",
            lineHeight: 1,
          }}
        >
          Genie
        </span>
      </span>
    </span>
  );
}

export default GenieWordmark;
