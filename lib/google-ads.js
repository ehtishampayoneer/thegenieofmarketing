// lib/google-ads.js
// ── REAL SEARCH VOLUME (Google Ads Keyword Planner API) ──
// Google's own data: monthly search volume + competition + 12-month history per
// keyword. Reuses the user's existing "Connect Google" token (needs the adwords
// scope) plus a free developer token (GOOGLE_ADS_DEVELOPER_TOKEN). Fully gated and
// best-effort: if the token or connection or scope is missing, returns {} and the
// keyword engine falls back to its AI estimates. Nothing breaks when unconfigured.

import { getValidAccessToken } from "@/lib/google";

const API = "https://googleads.googleapis.com/v17";
const devToken = () => (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim();

function headers(token) {
  const h = { Authorization: `Bearer ${token}`, "developer-token": devToken(), "Content-Type": "application/json" };
  const login = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/[^0-9]/g, "");
  if (login) h["login-customer-id"] = login;
  return h;
}

const MONTHS = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };

async function accessibleCustomerId(token) {
  const res = await fetch(`${API}/customers:listAccessibleCustomers`, { headers: headers(token), signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  const name = (j.resourceNames || [])[0]; // "customers/1234567890"
  return name ? name.split("/")[1] : null;
}

async function keywordIdeas(token, customerId, keywords) {
  const body = {
    keywordSeed: { keywords: keywords.slice(0, 20) },
    keywordPlanNetwork: "GOOGLE_SEARCH",
    geoTargetConstants: ["geoTargetConstants/2840"], // United States
    language: "languageConstants/1000",              // English
  };
  const res = await fetch(`${API}/customers/${customerId}:generateKeywordIdeas`, {
    method: "POST", headers: headers(token), body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return {};
  const j = await res.json().catch(() => ({}));
  const out = {};
  for (const r of j.results || []) {
    const m = r.keywordIdeaMetrics || {};
    const volume = Number(m.avgMonthlySearches || 0) || 0;
    const competition = m.competitionIndex != null
      ? Math.round(Number(m.competitionIndex))
      : (m.competition === "HIGH" ? 80 : m.competition === "MEDIUM" ? 50 : m.competition === "LOW" ? 20 : 50);
    const history = (m.monthlySearchVolumes || []).map((x) => ({ y: Number(x.year) || 0, m: MONTHS[x.month] || 0, v: Number(x.monthlySearches || 0) || 0 }));
    const key = String(r.text || "").toLowerCase().trim();
    if (key) out[key] = { volume, competition, history };
  }
  return out;
}

// { keyword: { volume, competition(0-100), history:[{y,m,v}] } } — or {} when unavailable.
export async function enrichWithVolumes(supabase, userId, host, keywords) {
  try {
    if (!devToken() || !Array.isArray(keywords) || keywords.length === 0) return {};
    const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
    if (!conn) return {};
    const token = await getValidAccessToken(supabase, conn);
    if (!token) return {};
    const customerId = await accessibleCustomerId(token);
    if (!customerId) return {};
    return await keywordIdeas(token, customerId, keywords);
  } catch { return {}; }
}

export function volumeToPotential(v) {
  const n = Number(v) || 0;
  if (n <= 0) return 0;
  return Math.max(1, Math.min(100, Math.round(Math.log10(Math.max(10, n)) * 22)));
}
