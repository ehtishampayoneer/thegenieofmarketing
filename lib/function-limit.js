// lib/function-limit.js
// ── HOW LONG THIS HOST WILL LET A FUNCTION RUN ──
//
// `export const maxDuration` is a request, not a guarantee. Vercel Hobby stops any
// function at 60 seconds whatever it declares, and twenty-four routes here declare
// more than that. The failure is silent: no error, no log, no event — the function
// simply stops, halfway through whatever it was doing, and the owner sees a quiet
// night that looks exactly like a night with nothing to do.
//
// So the limit is a fact about the deployment, read from one place, and every stage
// that costs real seconds asks how much is left rather than assuming its declared
// budget. Set FUNCTION_MAX_SECONDS to 300 the day the plan allows it and everything
// that was being trimmed to fit returns to full size with no code change.

/** Vercel Hobby. Not configurable on that plan; Pro is 300. */
export const DEFAULT_FUNCTION_SECONDS = 60;

/** The host's hard limit in milliseconds. Never throws; ignores nonsense. */
export function functionLimitMs() {
  const raw = Number(process.env.FUNCTION_MAX_SECONDS);
  const secs = Number.isFinite(raw) && raw >= 10 ? raw : DEFAULT_FUNCTION_SECONDS;
  return Math.round(secs * 1000);
}

/**
 * A clock for one invocation. `reserveMs` is what must be left over for the work
 * that has to happen whatever else is skipped — writing the ledger event, returning
 * a response — because a run that does everything and cannot record that it ran is
 * a run nothing can see.
 */
export function makeClock(reserveMs = 4000) {
  const started = Date.now();
  return {
    started,
    /** Milliseconds left before this invocation has to be finished. */
    left: () => functionLimitMs() - reserveMs - (Date.now() - started),
    /** Is there room for something expected to take `ms`? */
    room: (ms) => functionLimitMs() - reserveMs - (Date.now() - started) >= ms,
    /** How long this invocation has been running. */
    elapsed: () => Date.now() - started,
  };
}
