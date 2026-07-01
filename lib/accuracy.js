// lib/accuracy.js
// Accuracy Power Bar model. Pure & deterministic so it works identically for
// a fresh scan (server) and a saved scan re-opened later (client).
export function computeAccuracy(speedAvailable) {
  const dims = [
    { key: "onpage", label: "On-page SEO, content & trust", weight: 40,
      status: "verified", detail: "42 checks read directly from your live page." },
    { key: "speed", label: "Page speed & Core Web Vitals", weight: 15,
      status: speedAvailable ? "verified" : "missing",
      unlock: speedAvailable ? null : "Add a PageSpeed key",
      detail: speedAvailable ? "Measured via Google PageSpeed." : "Not measured yet." },
    { key: "traffic", label: "Real visitor traffic", weight: 15, status: "missing",
      unlock: "Connect Google Analytics", detail: "Currently estimated." },
    { key: "keywords", label: "Keyword rankings", weight: 15, status: "missing",
      unlock: "Connect Search Console", detail: "Currently estimated." },
    { key: "competitors", label: "Competitor intel", weight: 8, status: "estimated",
      detail: "AI-inferred, not measured." },
    { key: "sales", label: "Sales & revenue", weight: 7, status: "missing",
      unlock: "Connect Shopify or Stripe", detail: "Not connected." },
  ];
  const realized = { verified: 1, estimated: 0.5, missing: 0 };
  const percent = Math.round(
    dims.reduce((a, d) => a + d.weight * realized[d.status], 0)
  );
  const sources = dims.map((d) => ({
    ...d,
    gain: d.status === "missing" ? d.weight : 0,
  }));
  return { percent, sources };
}
