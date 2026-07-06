"use client";

// Minimal line glyphs for the premium (dark) surfaces. No emoji — ever.
// All inherit currentColor and stroke, so they tint to context.

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

export function GlyphArticle({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
export function GlyphSocial({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M4 5h16v11H9l-4 3v-3H4z" />
      <path d="M8.5 10h.01M12 10h.01M15.5 10h.01" />
    </svg>
  );
}
export function GlyphOutreach({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </svg>
  );
}
export function GlyphAd({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M4 9v6h3l6 4V5L7 9H4z" />
      <path d="M17 9a4 4 0 0 1 0 6" />
    </svg>
  );
}
export function GlyphSearch({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
export function GlyphCommunity({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M13 19c.4-2.3 2.3-4 4-4s3.6 1.3 4 4" />
    </svg>
  );
}
export function GlyphChart({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M4 19V5M4 19h16" />
      <path d="M7 15l3-4 3 2 4-6" />
    </svg>
  );
}
export function GlyphSpark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...S}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </svg>
  );
}

// Channel → glyph resolver for outcome cards.
export function channelGlyph(type, size = 22) {
  switch (type) {
    case "article": return <GlyphArticle size={size} />;
    case "social_post":
    case "distribution": return <GlyphSocial size={size} />;
    case "outreach_email": return <GlyphOutreach size={size} />;
    case "ad_campaign": return <GlyphAd size={size} />;
    case "seo_fix": return <GlyphSearch size={size} />;
    case "community_engagement": return <GlyphCommunity size={size} />;
    case "directory_submission": return <GlyphSearch size={size} />;
    default: return <GlyphSpark size={size} />;
  }
}
