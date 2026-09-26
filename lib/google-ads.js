// lib/google-ads.js
// ── REAL SEARCH VOLUME (Google Ads Keyword Planner API) ──
// Google's own data: monthly search volume + competition + 12-month history per
// keyword. Reuses the user's existing "Connect Google" token (needs the adwords
// scope) plus a free developer token (GOOGLE_ADS_DEVELOPER_TOKEN). Fully gated and
// best-effort: if the token or connection or scope is missing, returns {} and the
// keyword engine falls back to its AI estimates. Nothing breaks when unconfigured.

import { getValidAccessToken } from "@/lib/google";
// The geo was hardcoded to the United States in both request builders below, so an
// owner selling into the UAE was ranking their keywords by American demand. The
// country now comes from the plan's live markets (lib/geo-targets.js).
import { adsTargetFor } from "@/lib/geo-targets";

// ── WHICH API VERSION ──
// This was hardcoded to v17. Google retires each Google Ads API version about a
// year after release, and v17 was retired in 2025, so every volume lookup failed
// and `enrichWithVolumes` quietly returned nothing: all "volumes" were AI guesses.
// Now the newest versions are tried in order and the first that answers is kept.
// GOOGLE_ADS_API_VERSION pins one when needed.
const VERSIONS = [...new Set([(process.env.GOOGLE_ADS_API_VERSION || "").trim(), "v24", "v23", "v22", "v21"].filter(Boolean))];
let workingVersion = null;
const apiBase = (v) => `https://googleads.googleapis.com/${v}`;
const devToken = () => (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim();

async function errorText(res) {
  const t = await res.text().catch(() => "");
  try {
    const j = JSON.parse(t);
    const detail = j?.error?.details?.[0]?.errors?.[0];
    return `HTTP ${res.status}: ${detail?.message || j?.error?.message || t}`.replace(/\s+/g, " ").slice(0, 300);
  } catch { return `HTTP ${res.status}: ${t.replace(/\s+/g, " ").slice(0, 300)}`; }
}
const retired = (status, text) => status === 404 || /UNSUPPORTED_VERSION|version.*(sunset|deprecated|no longer)/i.test(text);

/** Find a version that answers and the first customer this login can use. */
export async function probeAdsVersion(token) {
  const tried = [];
  for (const v of workingVersion ? [workingVersion] : VERSIONS) {
    let res;
    try { res = await fetch(`${apiBase(v)}/customers:listAccessibleCustomers`, { headers: headers(token), signal: AbortSignal.timeout(15000) }); }
    catch (e) { return { ok: false, error: `Could not reach Google Ads: ${e?.message || e}` }; }
    if (res.ok) {
      workingVersion = v;
      const j = await res.json().catch(() => ({}));
      const name = (j.resourceNames || [])[0];
      return name ? { ok: true, version: v, customerId: name.split("/")[1] } : { ok: false, version: v, error: "This Google account has no Google Ads account it can open." };
    }
    const text = await errorText(res);
    if (retired(res.status, text)) { tried.push(v); continue; }
    return { ok: false, version: v, error: text };
  }
  return { ok: false, error: `No Google Ads API version answered (tried ${tried.join(", ")}). Set GOOGLE_ADS_API_VERSION to the current version.` };
}

/** Volume for a few keywords, with Google's error when it fails. */
export async function adsKeywordIdeas(token, customerId, keywords, version = workingVersion || VERSIONS[0], market = null) {
  const target = adsTargetFor(market);
  const res = await fetch(`${apiBase(version)}/customers/${customerId}:generateKeywordIdeas`, {
    method: "POST", headers: headers(token), signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      keywordSeed: { keywords }, keywordPlanNetwork: "GOOGLE_SEARCH",
      geoTargetConstants: target.geoTargetConstants, language: target.language,
    }),
  });
  if (!res.ok) return { ok: false, error: await errorText(res) };
  const j = await res.json().catch(() => ({}));
  const first = (j.results || []).find((r) => String(r.text || "").toLowerCase() === String(keywords[0]).toLowerCase()) || (j.results || [])[0];
  return { ok: true, volume: Number(first?.keywordIdeaMetrics?.avgMonthlySearches || 0), market: target.market, geo: target.geoTargetConstants[0] };
}

function headers(token) {
  const h = { Authorization: `Bearer ${token}`, "developer-token": devToken(), "Content-Type": "application/json" };
  const login = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/[^0-9]/g, "");
  if (login) h["login-customer-id"] = login;
  return h;
}

const MONTHS = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };

async function accessibleCustomerId(token) {
  const p = await probeAdsVersion(token);
  return p.ok ? p.customerId : null;
}

async function keywordIdeas(token, customerId, keywords, market = null) {
  const target = adsTargetFor(market);
  const body = {
    keywordSeed: { keywords: keywords.slice(0, 20) },
    keywordPlanNetwork: "GOOGLE_SEARCH",
    // The country the owner actually sells into, not the United States. The
    // language stays English because the keyword strings themselves are English:
    // asking for Arabic-language volume of an English phrase returns nothing and
    // would read as "no demand here" for the owner's best market.
    geoTargetConstants: target.geoTargetConstants,
    language: target.language,
  };
  const res = await fetch(`${apiBase(workingVersion || VERSIONS[0])}/customers/${customerId}:generateKeywordIdeas`, {
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
export async function enrichWithVolumes(supabase, userId, host, keywords, market = null) {
  try {
    if (!devToken() || !Array.isArray(keywords) || keywords.length === 0) return {};
    const { data: conn } = await supabase.from("connections").select("*").eq("user_id", userId).eq("provider", "google").maybeSingle();
    if (!conn) return {};
    const token = await getValidAccessToken(supabase, conn);
    if (!token) return {};
    const customerId = await accessibleCustomerId(token);
    if (!customerId) return {};
    return await keywordIdeas(token, customerId, keywords, market);
  } catch { return {}; }
}

export function volumeToPotential(v) {
  const n = Number(v) || 0;
  if (n <= 0) return 0;
  return Math.max(1, Math.min(100, Math.round(Math.log10(Math.max(10, n)) * 22)));
}
