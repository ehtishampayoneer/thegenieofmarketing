// lib/gsc.js
// Pulls real Search Console data for a site the connected account owns.
// Returns { available:false } when the scanned host isn't one of their properties.

const BASE = "https://www.googleapis.com/webmasters/v3";

function daysAgo(n) {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

async function listSites(accessToken) {
  const res = await fetch(`${BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.siteEntry || [];
}

function matchProperty(sites, host) {
  const usable = sites.filter((s) => s.permissionLevel !== "siteUnverifiedUser");
  // Prefer a domain property (covers all subdomains).
  for (const s of usable) {
    if (s.siteUrl.startsWith("sc-domain:")) {
      const domain = s.siteUrl.slice("sc-domain:".length);
      if (host === domain || host.endsWith("." + domain)) return s.siteUrl;
    }
  }
  // Otherwise a URL-prefix property.
  for (const s of usable) {
    if (!s.siteUrl.startsWith("sc-domain:")) {
      try {
        const h = new URL(s.siteUrl).hostname.replace(/^www\./, "");
        if (h === host) return s.siteUrl;
      } catch {}
    }
  }
  return null;
}

async function query(accessToken, siteUrl, body) {
  const res = await fetch(
    `${BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) return { rows: [] };
  return res.json();
}

export async function getGscData(accessToken, host) {
  let sites;
  try {
    sites = await listSites(accessToken);
  } catch {
    return { available: false, reason: "error" };
  }
  const site = matchProperty(sites, host);
  if (!site) return { available: false, reason: "no_property" };

  const endDate = daysAgo(3); // GSC lags ~2-3 days
  const startDate = daysAgo(31);

  let totalsRes, queryRes, pageRes;
  try {
    [totalsRes, queryRes, pageRes] = await Promise.all([
      query(accessToken, site, { startDate, endDate }),
      query(accessToken, site, { startDate, endDate, dimensions: ["query"], rowLimit: 25 }),
      query(accessToken, site, { startDate, endDate, dimensions: ["page"], rowLimit: 10 }),
    ]);
  } catch {
    return { available: false, reason: "error" };
  }

  const t = totalsRes.rows?.[0];
  const totals = t
    ? {
        clicks: Math.round(t.clicks),
        impressions: Math.round(t.impressions),
        ctr: +(t.ctr * 100).toFixed(1),
        position: +t.position.toFixed(1),
      }
    : { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  const topQueries = (queryRes.rows || []).map((r) => ({
    query: r.keys[0],
    clicks: Math.round(r.clicks),
    impressions: Math.round(r.impressions),
    ctr: +(r.ctr * 100).toFixed(1),
    position: +r.position.toFixed(1),
  }));

  const topPages = (pageRes.rows || []).map((r) => ({
    page: r.keys[0],
    clicks: Math.round(r.clicks),
    impressions: Math.round(r.impressions),
    ctr: +(r.ctr * 100).toFixed(1),
    position: +r.position.toFixed(1),
  }));

  // OPPORTUNITY: seen a lot (high impressions), rarely clicked (low CTR),
  // ranking on page 1-3 (position 4-30) → improve title/meta to capture clicks.
  const opportunities = topQueries
    .filter((q) => q.impressions >= 30 && q.ctr < 2 && q.position >= 4 && q.position <= 30)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);

  return {
    available: true,
    site,
    dateRange: { startDate, endDate },
    totals,
    topQueries,
    topPages,
    opportunities,
  };
}
