"use client";

// Last-resort boundary — catches errors in the root layout itself, so it must
// render its own <html>/<body> and can't rely on globals.css having loaded.
// Self-contained inline styles are intentional here (this is the fallback of
// fallbacks); the rest of the app uses the mg token system.

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui,-apple-system,sans-serif", background: "#F6F5F1", color: "#0B141C", minHeight: "100vh", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.02em", margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: 10, color: "#455360", lineHeight: 1.5 }}>The app hit an unexpected error. Please reload — Genie keeps working in the background regardless.</p>
          <button onClick={() => reset()} style={{ marginTop: 22, padding: ".72rem 1.2rem", borderRadius: 12, background: "#0B141C", color: "#fff", border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Reload</button>
        </div>
      </body>
    </html>
  );
}
