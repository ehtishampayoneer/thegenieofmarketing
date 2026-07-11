// lib/analytics.js
// ── GA4 ANALYTICS ADAPTER (provider-agnostic analytics source) ──
// Reads Genie-attributed traffic + conversions from Google Analytics 4 via the
// existing Google connection (adds analytics.readonly scope). "Genie-attributed"
// = sessions whose sessionSource is our UTM tag ("marketing-genie"), so we prove
// the traffic Genie actually drove — real data, not estimates. Provider-agnostic:
// another analytics provider is a new adapter with the same output shape.

const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DATA = "https://analyticsdata.googleapis.com/v1beta";
const GENIE_SOURCE = "marketing-genie";

export async function listGa4Properties(token) {
  try {
    const res = await fetch(`${ADMIN}/accountSummaries`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = await res.json();
    const props = [];
    for (const acc of data.accountSummaries || []) for (const p of acc.propertySummaries || []) props.push({ property: p.property, displayName: p.displayName });
    return props;
  } catch { return []; }
}

async function runReport(token, property, body) {
  const id = String(property).startsWith("properties/") ? property : `properties/${property}`;
  const res = await fetch(`${DATA}/${id}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ga4_${res.status}`);
  return res.json();
}

// Genie-attributed traffic (sessions) + conversions + revenue over a window.
export async function getGenieAnalytics(token, property, sinceDays = 30) {
  const data = await runReport(token, property, {
    dateRanges: [{ startDate: `${sinceDays}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "sessionSource" }],
    metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "totalRevenue" }],
    limit: 100,
  });
  let genieSessions = 0, genieConversions = 0, genieRevenue = 0, totalSessions = 0;
  for (const row of data.rows || []) {
    const source = row.dimensionValues?.[0]?.value || "";
    const sessions = Number(row.metricValues?.[0]?.value) || 0;
    const conv = Number(row.metricValues?.[1]?.value) || 0;
    const rev = Number(row.metricValues?.[2]?.value) || 0;
    totalSessions += sessions;
    if (source === GENIE_SOURCE) { genieSessions += sessions; genieConversions += conv; genieRevenue += rev; }
  }
  return {
    genieSessions, genieConversions, genieRevenue,
    totalSessions,
    currency: data.metadata?.currencyCode || "USD",
    share: totalSessions ? Math.round((genieSessions / totalSessions) * 100) : 0,
  };
}
