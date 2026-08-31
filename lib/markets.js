// lib/markets.js
// ── MARKET EXPANSION ENGINE (scoring) ──
// Finds countries this business can genuinely serve where demand is real and competition
// is thin — then projects traffic/sales and difficulty. HONEST by design: numbers from
// Search Console (per-country impressions/clicks/position) are "verified"; the curated
// reference model is "estimated"; ineligible markets are GATED out (not given a low score),
// and where there's nothing to go on we say "insufficient". Projections are clearly
// projections, never promises. Curated country values are directional reference estimates.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// iso2 → flag emoji (regional indicator letters)
export function flagEmoji(iso2) {
  return String(iso2 || "").toUpperCase().replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)));
}

// Curated reference set. net = internet users (M), ecom = e-commerce readiness, eng =
// English proficiency, emg = emerging, sat = search-competition saturation (1 = brutal
// like the US), pay = ease of accepting payment / serving there. All 0–1 unless noted.
export const COUNTRIES = [
  { code: "usa", iso2: "US", name: "United States", region: "N. America", lang: "en", net: 300, ecom: 0.95, eng: 1, emg: false, sat: 0.98, pay: 1 },
  { code: "gbr", iso2: "GB", name: "United Kingdom", region: "Europe", lang: "en", net: 63, ecom: 0.9, eng: 1, emg: false, sat: 0.9, pay: 1 },
  { code: "can", iso2: "CA", name: "Canada", region: "N. America", lang: "en", net: 34, ecom: 0.88, eng: 0.97, emg: false, sat: 0.85, pay: 1 },
  { code: "aus", iso2: "AU", name: "Australia", region: "Oceania", lang: "en", net: 22, ecom: 0.87, eng: 0.97, emg: false, sat: 0.8, pay: 0.98 },
  { code: "deu", iso2: "DE", name: "Germany", region: "Europe", lang: "de", net: 78, ecom: 0.85, eng: 0.72, emg: false, sat: 0.82, pay: 0.95 },
  { code: "nld", iso2: "NL", name: "Netherlands", region: "Europe", lang: "nl", net: 16, ecom: 0.88, eng: 0.9, emg: false, sat: 0.7, pay: 0.95 },
  { code: "are", iso2: "AE", name: "United Arab Emirates", region: "Middle East", lang: "ar", net: 9, ecom: 0.85, eng: 0.7, emg: true, sat: 0.45, pay: 0.9 },
  { code: "irl", iso2: "IE", name: "Ireland", region: "Europe", lang: "en", net: 4.5, ecom: 0.85, eng: 1, emg: false, sat: 0.6, pay: 0.95 },
  { code: "pol", iso2: "PL", name: "Poland", region: "Europe", lang: "pl", net: 34, ecom: 0.72, eng: 0.62, emg: true, sat: 0.5, pay: 0.82 },
  { code: "prt", iso2: "PT", name: "Portugal", region: "Europe", lang: "pt", net: 8, ecom: 0.7, eng: 0.68, emg: true, sat: 0.45, pay: 0.85 },
  { code: "rou", iso2: "RO", name: "Romania", region: "Europe", lang: "ro", net: 15, ecom: 0.6, eng: 0.65, emg: true, sat: 0.35, pay: 0.78 },
  { code: "grc", iso2: "GR", name: "Greece", region: "Europe", lang: "el", net: 9, ecom: 0.6, eng: 0.58, emg: true, sat: 0.4, pay: 0.8 },
  { code: "cze", iso2: "CZ", name: "Czechia", region: "Europe", lang: "cs", net: 9, ecom: 0.68, eng: 0.62, emg: true, sat: 0.42, pay: 0.82 },
  { code: "geo", iso2: "GE", name: "Georgia", region: "Caucasus", lang: "ka", net: 3, ecom: 0.5, eng: 0.55, emg: true, sat: 0.18, pay: 0.6 },
  { code: "ukr", iso2: "UA", name: "Ukraine", region: "Europe", lang: "uk", net: 30, ecom: 0.5, eng: 0.55, emg: true, sat: 0.25, pay: 0.55 },
  { code: "tur", iso2: "TR", name: "Türkiye", region: "Middle East", lang: "tr", net: 70, ecom: 0.62, eng: 0.45, emg: true, sat: 0.5, pay: 0.72 },
  { code: "sau", iso2: "SA", name: "Saudi Arabia", region: "Middle East", lang: "ar", net: 33, ecom: 0.78, eng: 0.55, emg: true, sat: 0.5, pay: 0.82 },
  { code: "zaf", iso2: "ZA", name: "South Africa", region: "Africa", lang: "en", net: 43, ecom: 0.55, eng: 0.72, emg: true, sat: 0.4, pay: 0.72 },
  { code: "nga", iso2: "NG", name: "Nigeria", region: "Africa", lang: "en", net: 110, ecom: 0.35, eng: 0.6, emg: true, sat: 0.25, pay: 0.5 },
  { code: "ken", iso2: "KE", name: "Kenya", region: "Africa", lang: "en", net: 25, ecom: 0.35, eng: 0.62, emg: true, sat: 0.22, pay: 0.55 },
  { code: "ind", iso2: "IN", name: "India", region: "Asia", lang: "en", net: 750, ecom: 0.55, eng: 0.6, emg: true, sat: 0.55, pay: 0.7 },
  { code: "phl", iso2: "PH", name: "Philippines", region: "Asia", lang: "en", net: 85, ecom: 0.5, eng: 0.72, emg: true, sat: 0.35, pay: 0.68 },
  { code: "idn", iso2: "ID", name: "Indonesia", region: "Asia", lang: "id", net: 210, ecom: 0.55, eng: 0.5, emg: true, sat: 0.45, pay: 0.65 },
  { code: "vnm", iso2: "VN", name: "Vietnam", region: "Asia", lang: "vi", net: 77, ecom: 0.55, eng: 0.48, emg: true, sat: 0.38, pay: 0.62 },
  { code: "mys", iso2: "MY", name: "Malaysia", region: "Asia", lang: "ms", net: 30, ecom: 0.68, eng: 0.68, emg: true, sat: 0.45, pay: 0.78 },
  { code: "pak", iso2: "PK", name: "Pakistan", region: "Asia", lang: "en", net: 110, ecom: 0.35, eng: 0.5, emg: true, sat: 0.3, pay: 0.55 },
  { code: "bra", iso2: "BR", name: "Brazil", region: "LatAm", lang: "pt", net: 165, ecom: 0.62, eng: 0.5, emg: true, sat: 0.55, pay: 0.72 },
  { code: "mex", iso2: "MX", name: "Mexico", region: "LatAm", lang: "es", net: 95, ecom: 0.6, eng: 0.52, emg: true, sat: 0.48, pay: 0.68 },
  { code: "arg", iso2: "AR", name: "Argentina", region: "LatAm", lang: "es", net: 37, ecom: 0.58, eng: 0.55, emg: true, sat: 0.35, pay: 0.6 },
  { code: "col", iso2: "CO", name: "Colombia", region: "LatAm", lang: "es", net: 38, ecom: 0.52, eng: 0.52, emg: true, sat: 0.3, pay: 0.62 },
  { code: "chl", iso2: "CL", name: "Chile", region: "LatAm", lang: "es", net: 16, ecom: 0.68, eng: 0.55, emg: true, sat: 0.4, pay: 0.75 },
  { code: "esp", iso2: "ES", name: "Spain", region: "Europe", lang: "es", net: 43, ecom: 0.75, eng: 0.58, emg: false, sat: 0.65, pay: 0.9 },
];

const CONV = { product: 0.018, subscription: 0.03, marketplace: 0.012, service: 0.03, lead: 0.05, content: 0.01, cause: 0.02, personal_brand: 0.02, saas: 0.03 };

export function scoreMarkets({ entity = {}, profile = {}, gsc = null }) {
  const dims = entity.dims || entity || {};
  const audience = dims.audience || profile.audience || "global";
  const commerce = dims.commerceModel || "service";
  const conv = CONV[commerce] || 0.02;
  const localOnly = audience === "local" || profile.serveReach === "local";
  const langs = (profile.languages || ["en"]).map((s) => String(s).toLowerCase());
  const gscMap = {};
  if (gsc?.countries) for (const c of gsc.countries) gscMap[c.code] = c;
  const maxImp = Math.max(1, ...(gsc?.countries || []).map((c) => c.impressions));

  const rows = COUNTRIES.map((co) => {
    const g = gscMap[co.code] || null;
    const demandCurated = clamp01((0.3 + 0.5 * (co.net / 300)) * (0.7 + co.ecom * 0.3));
    const demand = g ? clamp01(0.4 + (g.impressions / maxImp) * 0.6) : demandCurated;
    let gap = clamp01((1 - co.sat) * (co.emg ? 1.12 : 0.9));
    if (g && g.position >= 8 && g.position <= 30) gap = clamp01(gap + 0.18); // already knocking on page 1–3
    const eligible = !localOnly;
    const fit = eligible ? clamp01(co.pay * (0.6 + (audience === "global" ? 0.4 : audience === "b2b" ? 0.3 : 0.25))) : 0;
    const local = clamp01(co.eng * 0.8 + (langs.includes(co.lang) ? 0.35 : 0));
    const traction = g ? clamp01(g.clicks > 0 ? 0.3 + Math.min(0.7, g.clicks / 50) : 0.05) : 0;
    const opp = eligible ? clamp01(fit * 0.3 + gap * 0.25 + demand * 0.2 + local * 0.15 + traction * 0.1) : 0;

    const ease = clamp01(gap * 0.5 + local * 0.3 + (1 - co.sat) * 0.2);
    const difficulty = ease > 0.62 ? "Easy" : ease > 0.4 ? "Medium" : "Hard";
    const rankProb = difficulty === "Easy" ? 0.55 : difficulty === "Medium" ? 0.35 : 0.2;
    // projected monthly organic visitors at maturity (clearly a projection on the page):
    // GSC-present → a share of real impressions captured; else market-size × demand × win-odds.
    const expTraffic = g ? Math.round(g.impressions * 0.3) : Math.round(Math.sqrt(co.net) * (0.4 + demand * 0.6) * rankProb * 55);
    const convEff = conv * (co.emg ? 1.3 : 1) * (0.7 + co.pay * 0.3); // emerging markets convert a touch better (fewer alternatives)
    const expSales = Math.max(g && g.clicks ? 1 : co.emg && expTraffic >= 25 ? 1 : 0, Math.round(expTraffic * convEff));
    const days = difficulty === "Easy" ? 45 : difficulty === "Medium" ? 75 : 120;
    const progress = g ? Math.round(clamp01((g.clicks || 0) / Math.max(1, expTraffic * conv * 4)) * 100) : 0;
    const confidence = g ? "verified" : eligible ? "estimated" : "insufficient";
    const bucket = !eligible ? "not_yet" : g && g.impressions >= 20 ? "emerging" : "ready";

    const why = [];
    if (g && g.impressions >= 20) why.push(`Already ${g.impressions.toLocaleString()} impressions/mo here`);
    if (g && g.position >= 8 && g.position <= 30) why.push(`Ranking ~#${Math.round(g.position)} — close to page 1`);
    if (co.emg) why.push("Emerging market, rising demand");
    if (co.sat < 0.45) why.push("Low competition");
    if (co.eng > 0.7 && !langs.includes(co.lang)) why.push("High English proficiency");
    if (langs.includes(co.lang) && co.lang !== "en") why.push("You support the local language");

    return {
      code: co.code, iso2: co.iso2, flag: flagEmoji(co.iso2), name: co.name, region: co.region, lang: co.lang,
      demand: Math.round(demand * 100), gap: Math.round(gap * 100), fit: Math.round(fit * 100), local: Math.round(local * 100),
      opp: Math.round(opp * 100), difficulty, expTraffic, expSales, days, progress, confidence, bucket, eligible,
      gsc: g, why: why.slice(0, 3),
    };
  });

  rows.sort((a, b) => b.opp - a.opp || b.expSales - a.expSales);
  return { rows, hasGsc: !!gsc?.available, localOnly };
}
