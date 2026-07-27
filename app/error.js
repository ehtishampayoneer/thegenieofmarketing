"use client";

// On-brand route error boundary — a render error in any page shows this calm,
// recoverable screen instead of a stack trace. The error is reported to Next's
// console/telemetry automatically; we give the user a way forward.

export default function Error({ error, reset }) {
  return (
    <main className="mg mg-ambient" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
      <div style={{ maxWidth: 460 }}>
        <p className="mg-eyebrow" style={{ justifyContent: "center", color: "var(--signal-danger)" }}>Something broke</p>
        <h1 className="mg-display mt-2">That didn’t go as planned.</h1>
        <p className="mg-lede mt-2" style={{ marginInline: "auto" }}>A part of the page hit an error. It’s been logged — try again, or head back to your command center.</p>
        <div className="mt-6 flex items-center justify-center gap-2.5">
          <button onClick={() => reset()} className="mg-btn mg-btn--dawn" style={{ fontSize: 14 }}>Try again</button>
          <a href="/today" className="mg-btn mg-btn--ghost" style={{ fontSize: 14 }}>Back to Today</a>
        </div>
      </div>
    </main>
  );
}
