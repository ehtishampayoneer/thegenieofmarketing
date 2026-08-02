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

// Use INSTEAD of a bare `catch {}`. The operation stays best-effort (this never
// rethrows), but the failure is RECORDED rather than vanishing. That difference is
// the whole reason a saved Google connection could read back as "disconnected" for
// days with nothing in the logs to explain it. Grep Vercel logs for "swallowed:".
export function swallow(where, err, meta) {
  emit("error", `swallowed:${where}`, {
    err: err?.message || String(err),
    ...(err?.code ? { code: err.code } : {}),
    ...(meta || {}),
  });
}
