// lib/queue.js
// ── PROVIDER-AGNOSTIC JOB QUEUE ──
// One enqueue() the dispatcher calls per entity. Two backends, chosen by env:
//   • QStash (durable, retries, backoff) when QSTASH_TOKEN is set — the scale path
//   • dependency-free fan-out otherwise — starts the job invocation and returns,
//     letting the serverless job run independently (good for beta scale)
// Same call site either way, so we get reliability now and scale later with zero
// code change — never locked to a queue provider.

export async function enqueue(appUrl, path, body) {
  const url = `${appUrl}${path}`;
  const cron = process.env.CRON_SECRET || "";
  const token = process.env.QSTASH_TOKEN;

  if (token) {
    // QStash publishes, then POSTs to `url` with automatic retries/backoff.
    // NOTE: gated by QSTASH_TOKEN; validate against QStash before relying on it.
    try {
      await fetch(`https://qstash.upstash.io/v2/publish/${encodeURIComponent(url)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Upstash-Forward-Authorization": `Bearer ${cron}`,
          "Upstash-Retries": "3",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      return { via: "qstash" };
    } catch {
      // fall through to direct fan-out
    }
  }

  // Dependency-free fan-out: kick off the job invocation; don't await completion.
  // Aborting the client fetch doesn't kill the already-started server invocation.
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cron}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // timeout/abort is expected — the job keeps running server-side
  }
  return { via: "fanout" };
}
