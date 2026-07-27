// On-brand 404 — an unknown route stays inside the product's world instead of
// dropping to Next.js's default page.

export default function NotFound() {
  return (
    <main className="mg mg-ambient" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
      <div style={{ maxWidth: 440 }}>
        <p className="mg-eyebrow" style={{ justifyContent: "center" }}>404</p>
        <h1 className="mg-display mt-2">This page wandered off.</h1>
        <p className="mg-lede mt-2" style={{ marginInline: "auto" }}>The page you’re looking for doesn’t exist — but Genie is still working in the background.</p>
        <a href="/today" className="mg-btn mg-btn--dawn mt-6" style={{ fontSize: 14 }}>Back to Today →</a>
      </div>
    </main>
  );
}
