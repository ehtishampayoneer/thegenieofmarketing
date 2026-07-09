"use client";

// Professional thin-line icon set (like the reference sheet). Monochrome,
// inherit currentColor, 1.6 stroke. Replaces all emoji across the product.

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
function Svg({ size = 20, children }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...P}>{children}</svg>;
}

export const Icon = {
  home: (p) => <Svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v9a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1v-9" /></Svg>,
  tasks: (p) => <Svg {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12l3 3 5-6" /></Svg>,
  growth: (p) => <Svg {...p}><path d="M4 19V5M4 19h16" /><path d="M7 15l3-4 3 2 5-7" /></Svg>,
  conversations: (p) => <Svg {...p}><path d="M4 5h16v10H9l-4 3v-3H4z" /><circle cx="9" cy="10" r="0.6" fill="currentColor" /><circle cx="12" cy="10" r="0.6" fill="currentColor" /><circle cx="15" cy="10" r="0.6" fill="currentColor" /></Svg>,
  inbox: (p) => <Svg {...p}><path d="M4 13l2-8h12l2 8" /><path d="M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /><path d="M4 13h4l1.5 2h5L16 13h4" /></Svg>,
  history: (p) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Svg>,
  connect: (p) => <Svg {...p}><path d="M9 15l6-6" /><path d="M8 12l-2 2a3 3 0 0 0 4 4l2-2" /><path d="M16 12l2-2a3 3 0 0 0-4-4l-2 2" /></Svg>,
  settings: (p) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5" /></Svg>,
  search: (p) => <Svg {...p}><circle cx="11" cy="11" r="6" /><path d="m20 20-3.5-3.5" /></Svg>,
  scan: (p) => <Svg {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" /></Svg>,
  spark: (p) => <Svg {...p}><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" /><path d="M18 15l.8 2 .2.8-2-.8" /></Svg>,
  write: (p) => <Svg {...p}><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Svg>,
  check: (p) => <Svg {...p}><path d="M5 12l5 5L20 7" /></Svg>,
  post: (p) => <Svg {...p}><path d="M4 12l16-8-6 16-3-6z" /><path d="M11 13l3-3" /></Svg>,
  eye: (p) => <Svg {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></Svg>,
  reply: (p) => <Svg {...p}><path d="M9 10L4 15l5 5" /><path d="M4 15h11a5 5 0 0 0 5-5V4" /></Svg>,
  target: (p) => <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></Svg>,
  brain: (p) => <Svg {...p}><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5 3 3 0 0 0 2 4 3 3 0 0 0 6 0V6a3 3 0 0 0-4-2z" /><path d="M13 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5 3 3 0 0 1-2 4" /></Svg>,
  bolt: (p) => <Svg {...p}><path d="M13 3L5 13h5l-1 8 8-11h-5z" /></Svg>,
  megaphone: (p) => <Svg {...p}><path d="M4 10v4l10 4V6z" /><path d="M14 8a3 3 0 0 1 0 8" /><path d="M6 14v3a1 1 0 0 0 1 1h1" /></Svg>,
  store: (p) => <Svg {...p}><path d="M4 9l1-4h14l1 4" /><path d="M4 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /><path d="M5 11v8h14v-8" /></Svg>,
  link: (p) => <Svg {...p}><path d="M10 13a4 4 0 0 0 6 0l2-2a4 4 0 0 0-6-6l-1 1" /><path d="M14 11a4 4 0 0 0-6 0l-2 2a4 4 0 0 0 6 6l1-1" /></Svg>,
  mail: (p) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5L12 13l8.5-6.5" /></Svg>,
  plus: (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  arrowRight: (p) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>,
  chevronRight: (p) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>,
  x: (p) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  clock: (p) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></Svg>,
  fire: (p) => <Svg {...p}><path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1-.5-2-1-3 2 1 4 3.5 4 7a8 8 0 0 1-16 0c0-3 2-5 4-6 0 2 1 3 2 3" /></Svg>,
  globe: (p) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16" /></Svg>,
};

export default Icon;
