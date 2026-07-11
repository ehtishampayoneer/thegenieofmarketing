"use client";

// ── LIVE DATA, GRACEFUL FALLBACK ──
// One pattern for every Operator surface: try the real endpoint; if there's no
// session (public preview), an error, or an ok:false, fall back to representative
// data so the page ALWAYS renders. Live overrides fallback field-by-field, so
// partial live data still degrades gracefully.

export async function fetchLive(url, fallback = null) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { data: fallback, live: false };
    const j = await res.json();
    if (!j || j.ok === false) return { data: fallback, live: false };
    return { data: j, live: true };
  } catch {
    return { data: fallback, live: false };
  }
}

// Shallow-merge live over fallback: live keys win, missing keys keep the demo.
export function mergeLive(fallback, live) {
  if (!live) return fallback;
  const out = { ...fallback };
  for (const k of Object.keys(live)) {
    const v = live[k];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) { if (v.length) out[k] = v; }
    else out[k] = v;
  }
  return out;
}

export function relTime(iso) {
  try {
    const d = new Date(iso).getTime();
    const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  } catch { return ""; }
}
