// lib/geo-targets.js
// ── WHAT A COUNTRY MEANS TO GOOGLE, AND TO A WRITER ──
//
// Market Testing has ranked countries since the beginning, and two of the things
// that ranking should have decided were still hardcoded to the United States:
//
//   geoTargetConstants: ["geoTargetConstants/2840"]   // United States
//   language: "languageConstants/1000"                // English
//
// So an owner selling into the UAE and Pakistan was shown American search volumes
// and told which keywords to chase on that basis. "1,300 searches a month" was
// true of a country they do not sell in, which makes it a wrong number wearing a
// right-looking label. Every priority built on it was off.
//
// lib/markets.js already holds the country table — name, iso2, language. This adds
// the two things it does not: the id Google wants for that country, and the handful
// of facts a writer needs in order to write for it.
//
// WHY LANGUAGE IS NOT THE COUNTRY'S LANGUAGE BY DEFAULT. Google's `language` here
// means "the language of the keyword", not "the language of the country". Genie's
// keyword lists are written in English, so asking for Arabic-language volume of an
// English phrase returns nothing and quietly reads as no demand. The geo is the
// market; the language follows the words being measured.

import { COUNTRIES, LANG_NAMES } from "@/lib/markets";

// Google's country criterion id is the ISO 3166-1 numeric code plus 2000 — the
// United States is 840, hence geoTargetConstants/2840. Covers every country
// lib/markets.js scores, plus the ones an owner most often names by hand.
const ISO_NUM = {
  US: 840, GB: 826, CA: 124, AU: 36, NZ: 554, IE: 372,
  DE: 276, NL: 528, BE: 56, FR: 250, IT: 380, ES: 724, PT: 620, CH: 756, AT: 40,
  SE: 752, NO: 578, DK: 208, FI: 246, PL: 616, CZ: 203, RO: 642, GR: 300, HU: 348,
  UA: 804, RU: 643, TR: 792, GE: 268,
  AE: 784, SA: 682, QA: 634, KW: 414, BH: 48, OM: 512, JO: 400, LB: 422, IL: 376,
  EG: 818, MA: 504, ZA: 710, NG: 566, KE: 404, GH: 288,
  IN: 356, PK: 586, BD: 50, LK: 144, NP: 524,
  MY: 458, SG: 702, ID: 360, TH: 764, VN: 704, PH: 608,
  CN: 156, HK: 344, TW: 158, JP: 392, KR: 410,
  BR: 76, MX: 484, AR: 32, CL: 152, CO: 170, PE: 604,
};

// Google's languageConstants, for the day a market's keywords are localised. Only
// the ones there is no doubt about; anything else falls back to English, which is
// the language Genie's keyword lists are written in anyway.
const LANG_ID = {
  en: 1000, de: 1001, fr: 1002, es: 1003, it: 1004, ja: 1005, da: 1009, nl: 1010,
  fi: 1011, ko: 1012, no: 1013, pt: 1014, sv: 1015, ar: 1019, cs: 1021, el: 1022,
  hi: 1023, id: 1025, he: 1027, pl: 1030, ru: 1031, ro: 1032, tr: 1037, th: 1044,
};

export const DEFAULT_GEO = "geoTargetConstants/2840";      // United States
export const DEFAULT_LANGUAGE = "languageConstants/1000";  // English

// What a writer needs and a scorer does not: the money on the price tag, and which
// English to write. Where a country is not listed the writer is told the country
// and nothing more, which is honest.
const WRITING = {
  US: { currency: "USD", symbol: "$", spelling: "American" },
  GB: { currency: "GBP", symbol: "£", spelling: "British" },
  CA: { currency: "CAD", symbol: "CA$", spelling: "Canadian (British spelling, North American vocabulary)" },
  AU: { currency: "AUD", symbol: "A$", spelling: "Australian (British spelling)" },
  NZ: { currency: "NZD", symbol: "NZ$", spelling: "British" },
  IE: { currency: "EUR", symbol: "€", spelling: "British" },
  DE: { currency: "EUR", symbol: "€", spelling: "British" },
  NL: { currency: "EUR", symbol: "€", spelling: "British" },
  BE: { currency: "EUR", symbol: "€", spelling: "British" },
  FR: { currency: "EUR", symbol: "€", spelling: "British" },
  IT: { currency: "EUR", symbol: "€", spelling: "British" },
  ES: { currency: "EUR", symbol: "€", spelling: "British" },
  PT: { currency: "EUR", symbol: "€", spelling: "British" },
  AT: { currency: "EUR", symbol: "€", spelling: "British" },
  GR: { currency: "EUR", symbol: "€", spelling: "British" },
  FI: { currency: "EUR", symbol: "€", spelling: "British" },
  CH: { currency: "CHF", symbol: "CHF", spelling: "British" },
  SE: { currency: "SEK", symbol: "kr", spelling: "British" },
  NO: { currency: "NOK", symbol: "kr", spelling: "British" },
  DK: { currency: "DKK", symbol: "kr", spelling: "British" },
  PL: { currency: "PLN", symbol: "zl", spelling: "British" },
  CZ: { currency: "CZK", symbol: "Kc", spelling: "British" },
  RO: { currency: "RON", symbol: "lei", spelling: "British" },
  HU: { currency: "HUF", symbol: "Ft", spelling: "British" },
  UA: { currency: "UAH", symbol: "UAH", spelling: "British" },
  TR: { currency: "TRY", symbol: "TRY", spelling: "British" },
  GE: { currency: "GEL", symbol: "GEL", spelling: "British" },
  AE: { currency: "AED", symbol: "AED", spelling: "British" },
  SA: { currency: "SAR", symbol: "SAR", spelling: "British" },
  QA: { currency: "QAR", symbol: "QAR", spelling: "British" },
  KW: { currency: "KWD", symbol: "KWD", spelling: "British" },
  BH: { currency: "BHD", symbol: "BHD", spelling: "British" },
  OM: { currency: "OMR", symbol: "OMR", spelling: "British" },
  JO: { currency: "JOD", symbol: "JOD", spelling: "British" },
  LB: { currency: "LBP", symbol: "LBP", spelling: "British" },
  IL: { currency: "ILS", symbol: "ILS", spelling: "American" },
  EG: { currency: "EGP", symbol: "EGP", spelling: "British" },
  MA: { currency: "MAD", symbol: "MAD", spelling: "British" },
  ZA: { currency: "ZAR", symbol: "R", spelling: "British" },
  NG: { currency: "NGN", symbol: "NGN", spelling: "British" },
  KE: { currency: "KES", symbol: "KSh", spelling: "British" },
  GH: { currency: "GHS", symbol: "GHS", spelling: "British" },
  IN: { currency: "INR", symbol: "Rs", spelling: "Indian English (British spelling; lakh and crore read naturally)" },
  PK: { currency: "PKR", symbol: "Rs", spelling: "British" },
  BD: { currency: "BDT", symbol: "BDT", spelling: "British" },
  LK: { currency: "LKR", symbol: "Rs", spelling: "British" },
  NP: { currency: "NPR", symbol: "Rs", spelling: "British" },
  MY: { currency: "MYR", symbol: "RM", spelling: "British" },
  SG: { currency: "SGD", symbol: "S$", spelling: "British" },
  ID: { currency: "IDR", symbol: "Rp", spelling: "British" },
  TH: { currency: "THB", symbol: "THB", spelling: "British" },
  VN: { currency: "VND", symbol: "VND", spelling: "British" },
  PH: { currency: "PHP", symbol: "PHP", spelling: "American" },
  HK: { currency: "HKD", symbol: "HK$", spelling: "British" },
  TW: { currency: "TWD", symbol: "NT$", spelling: "British" },
  JP: { currency: "JPY", symbol: "JPY", spelling: "American" },
  KR: { currency: "KRW", symbol: "KRW", spelling: "American" },
  CN: { currency: "CNY", symbol: "CNY", spelling: "American" },
  BR: { currency: "BRL", symbol: "R$", spelling: "American" },
  MX: { currency: "MXN", symbol: "MX$", spelling: "American" },
  AR: { currency: "ARS", symbol: "AR$", spelling: "American" },
  CL: { currency: "CLP", symbol: "CLP$", spelling: "American" },
  CO: { currency: "COP", symbol: "COP$", spelling: "American" },
  PE: { currency: "PEN", symbol: "PEN", spelling: "American" },
};

// What an owner writes when they mean a country: "UAE", "USA", "Turkey", "UK".
const ALIASES = {
  uae: "AE", "u.a.e": "AE", emirates: "AE", dubai: "AE", "abu dhabi": "AE",
  usa: "US", "u.s.": "US", "u.s.a": "US", america: "US", "united states of america": "US",
  uk: "GB", "u.k.": "GB", britain: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  turkey: "TR", turkiye: "TR",
  "south korea": "KR", korea: "KR", "republic of korea": "KR",
  "czech republic": "CZ", holland: "NL", "the netherlands": "NL",
  ksa: "SA", saudi: "SA",
  "viet nam": "VN", "the philippines": "PH", "hong kong sar": "HK",
  russia: "RU", "russian federation": "RU", eire: "IE",
};

// "Türkiye" and "Turkiye" are the same country; an owner types whichever.
const fold = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9 .]/g, " ").replace(/\s+/g, " ").trim();

const BY_NAME = new Map();
for (const c of COUNTRIES) {
  BY_NAME.set(fold(c.name), c.iso2);
  BY_NAME.set(fold(c.code), c.iso2);
  BY_NAME.set(fold(c.iso2), c.iso2);
}

/** The iso2 for whatever an owner or the plan called this country. Null if unknown. */
export function iso2Of(market) {
  const raw = typeof market === "string" ? market : market?.iso2 || market?.name || market?.code;
  const key = fold(raw);
  if (!key) return null;
  if (BY_NAME.has(key)) return BY_NAME.get(key);
  if (ALIASES[key]) return ALIASES[key];
  const up = key.toUpperCase();
  if (up.length === 2 && ISO_NUM[up]) return up;
  // "Malaysia (verified)" or "United Arab Emirates — 78" still names a country.
  for (const [name, iso] of BY_NAME) if (name.length > 3 && key.includes(name)) return iso;
  return null;
}

/**
 * Everything known about one market: what Google calls it, and how to write for it.
 * An unknown country comes back with `known: false` and the United States geo —
 * which is what every market silently got before. The difference is it now says so.
 */
export function resolveMarket(market) {
  const name = typeof market === "string" ? market : market?.name || "";
  const iso2 = iso2Of(market);
  const row = iso2 ? COUNTRIES.find((c) => c.iso2 === iso2) : null;
  const num = iso2 ? ISO_NUM[iso2] : null;
  const w = iso2 ? WRITING[iso2] : null;
  return {
    name: row?.name || name || "",
    iso2: iso2 || null,
    known: !!num,
    geo: num ? `geoTargetConstants/${2000 + num}` : DEFAULT_GEO,
    lang: row?.lang || null,
    langName: row ? LANG_NAMES[row.lang] || row.lang : null,
    currency: w?.currency || null,
    symbol: w?.symbol || null,
    spelling: w?.spelling || null,
  };
}

/**
 * The geo and language to ask Google Ads for.
 * @param market   a country name, an iso2, or a market row from the plan
 * @param language the language the KEYWORDS are written in, not the country's
 */
export function adsTargetFor(market, { language = "en" } = {}) {
  const m = resolveMarket(market);
  const id = LANG_ID[String(language || "en").toLowerCase()] || LANG_ID.en;
  return {
    geoTargetConstants: [m.geo],
    language: `languageConstants/${id}`,
    market: m.name || null,
    known: m.known,
  };
}

/** The label a volume must carry, so no number claims to be about everywhere. */
export function volumeLabel(market) {
  const m = resolveMarket(market);
  return m.known && m.name ? `Monthly searches in ${m.name}` : "Monthly searches in the United States";
}

/**
 * What a writer is told when an article is for one country. Facts only — Genie
 * knows nothing about a country's holidays, prices or laws and must not invent them.
 */
export function writeForBlock(market) {
  const m = resolveMarket(market);
  if (!m.name) return "";
  const lines = [
    `WRITE THIS FOR ${m.name.toUpperCase()}. The reader is a buyer in ${m.name}, and this will be published as this site's ${m.name} page on the topic.`,
    `- Spelling and idiom: ${m.spelling || `the English a reader in ${m.name} expects`}.`,
  ];
  if (m.currency) lines.push(`- Any price, budget or cost is in ${m.currency} (${m.symbol}). Never quote a figure in another country's money.`);
  lines.push(`- Name ${m.name} where a reader would look for it: in the title if it reads naturally, in the opening lines, and wherever someone is deciding whether this applies to them.`);
  lines.push(`- Use cities, suppliers, seasons and rules from ${m.name} ONLY where you actually know them. Never invent a local statistic, a local law or a local company. A general point stated plainly beats a local detail you are unsure of.`);
  if (m.langName && m.lang && m.lang !== "en") {
    lines.push(`- Write in English. Where a buyer in ${m.name} would search in ${m.langName}, give the ${m.langName} term once in brackets after the English one.`);
  }
  return lines.join("\n");
}
