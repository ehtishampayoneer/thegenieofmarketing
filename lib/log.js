// lib/log.js
// Minimal structured logging — one JSON line per event, greppable in Vercel logs.
// No third-party dependency. A real APM (Sentry) can layer on later; this gives us
// honest observability today with zero setup.

function emit(level, msg, meta) {
  try {
    const line = { t: new Date().toISOString(), level, msg, ...(meta || {}) };
    (level === "error" ? console.error : console.log)(JSON.stringify(line));
  } catch {}
}

export const logger = {
  info: (msg, meta) => emit("info", msg, meta),
  warn: (msg, meta) => emit("warn", msg, meta),
  error: (msg, meta) => emit("error", msg, meta),
};
