// lib/intent-verticals.js
// ── WHERE THIS BUSINESS'S BUYERS ACTUALLY ASK ──
// Buyer Hunt was built for one kind of customer. Its three keyless sources are
// Hacker News, GitHub and Stack Exchange pinned to "softwarerecs" — all three
// are where programmers ask. So a SaaS founder got a flood of real buyers and a
// bakery, a plumber, a rug shop or a physio got nothing. Genie is for any
// business, so the hunt has to be too.
//
// Two fixes live here:
//
//   1. Stack Exchange is not one site, it is ~180 of them, on the same free
//      keyless API — only the `site` parameter changes. "Home Improvement" is
//      where someone asks which contractor or material to use. "Seasoned Advice"
//      is food. "Personal Finance & Money" is accountants and insurance. Picking
//      the right ones turns a tech-only source into coverage for most trades.
//
//   2. Hacker News and GitHub are a waste of the nightly budget for a florist,
//      and they add noise the scorer then has to reject. They now run only for
//      businesses whose buyers are genuinely technical.
//
// Reddit and Quora are unchanged: both already search globally, so they cover
// every vertical and carry the load where Stack Exchange has no good home
// (weddings, real estate, events). Where that is the case this file says so
// rather than inventing a site that does not fit.
//
// Slugs that turn out to be wrong degrade to nothing: the Stack Exchange API
// returns an error for an unknown site and the fetch helper turns that into an
// empty list, so a bad guess costs one wasted call, never a broken run.

// ── Vertical map ─────────────────────────────────────────────────────────────
// `match` is tested against the business description, what it sells, and its
// keywords. `se` are Stack Exchange site slugs, best fit first. `label` is shown
// in the UI so the owner can see where Genie is hunting for them.
const VERTICALS = [
  {
    id: "home_trades", label: "Home improvement & trades",
    match: /\b(plumb|electric|hvac|heating|cooling|roof|renovat|remodel|contractor|handyman|carpent|flooring|tiling|painter|painting|insulat|drywall|window|door|garage|fencing|driveway|guttering|damp|boiler)\w*/i,
    se: ["diy", "woodworking", "sustainability"],
  },
  {
    id: "furniture_interiors", label: "Furniture, decor & interiors",
    match: /\b(furnitur|sofa|couch|rug|carpet|decor|interior|upholster|curtain|blind|shutter|cabinet|wardrobe|mattress|bedding|lighting|homeware)\w*/i,
    se: ["diy", "woodworking", "crafts"],
  },
  {
    id: "food_drink", label: "Food & drink",
    match: /\b(restaurant|cafe|coffee|bakery|baker|caterer|catering|food|kitchen|recipe|chef|deli|patisser|brewery|brewing|beverage|meal)\w*/i,
    se: ["cooking", "coffee", "beer"],
  },
  {
    id: "photo_video", label: "Photography & video",
    match: /\b(photograph|photo|camera|lens|video|videograph|film|cinemat|drone footage|headshot)\w*/i,
    se: ["photo", "avp", "drones"],
  },
  {
    id: "garden", label: "Garden & landscaping",
    match: /\b(garden|landscap|lawn|nursery|horticult|plant|tree surgeon|arborist|turf|patio|decking)\w*/i,
    se: ["gardening", "outdoors", "sustainability"],
  },
  {
    id: "pets", label: "Pets & animals",
    // "pet" as a stem also matches petrol and petite, so it is bounded.
    match: /\b(pets?|petcare|dogs?|cats?|puppy|puppies|kitten|veterinar\w*|vet clinic|groom\w*|kennel|cattery|aquarium|equine|horses?)\b/i,
    se: ["pets"],
  },
  {
    id: "parenting", label: "Parenting, kids & schools",
    match: /\b(child|children|kid|baby|babies|toddler|infant|parent|nursery school|preschool|daycare|childcare|pram|stroller)\w*/i,
    se: ["parenting"],
  },
  {
    id: "fitness", label: "Fitness & wellness",
    match: /\b(gym|fitness|personal train|yoga|pilates|crossfit|nutrition|wellness|massage|spa|supplement|weight loss)\w*/i,
    se: ["fitness", "health", "martialarts"],
  },
  {
    id: "health", label: "Health & medical",
    match: /\b(clinic|doctor|dental|dentist|orthodont|therap|physio|chiro|medical|healthcare|optician|optometr|pharmac|mental health|counsell|counsel)\w*/i,
    se: ["health", "fitness"],
  },
  {
    id: "legal", label: "Legal",
    match: /\b(lawyer|legal|attorney|solicitor|barrister|notary|conveyanc|litigation|paralegal|law firm)\w*/i,
    se: ["law"],
  },
  {
    id: "finance", label: "Finance, tax & insurance",
    // Not a bare "account": every SaaS talks about user accounts, which pulled
    // them all into finance. Only the professional forms count.
    match: /\b(accountant|accounting|bookkeep\w*|tax|payroll|financ\w*|insur\w*|mortgage|investment|pension|wealth manage\w*|audit|cfo)\b/i,
    se: ["money", "personalfinance"],
  },
  {
    id: "travel", label: "Travel & hospitality",
    match: /\b(travel|tour|tourism|hotel|hostel|airbnb|bnb|guesthouse|trip|flight|holiday|vacation|visa|itinerar|excursion)\w*/i,
    se: ["travel", "expatriates"],
  },
  {
    id: "auto", label: "Cars & vehicles",
    // Bounded deliberately: a bare "car" stem also matches carpet, cargo, career
    // and carbon, and "auto" matches automation — which dragged a rug shop and any
    // SaaS mentioning "marketing automation" into this vertical.
    match: /\b(cars?|automotive|vehicles?|mechanics?|tyres?|tires?|garage service|motorbike|motorcycle|bodyshop|car detailing|ev charg\w*|dealership)\b/i,
    se: ["mechanics", "electronics"],
  },
  {
    id: "cycling", label: "Cycling",
    match: /\b(bike|bicycle|cycling|cyclist|e-bike|ebike)\w*/i,
    se: ["bicycles", "outdoors"],
  },
  {
    id: "crafts", label: "Crafts & handmade",
    // "artisan" is used by every bakery and coffee roaster, and "crafted" by every
    // marketing page, so both are out. This is the actual making-things vertical.
    match: /\b(crafts?|handcraft\w*|handmade|knitting|crochet|sewing|quilting|pottery|ceramics?|jewellery|jewelry|candle making|resin art|embroider\w*)\b/i,
    se: ["crafts", "woodworking"],
  },
  {
    id: "music", label: "Music & audio",
    match: /\b(music|guitar|piano|drum|band|studio record|audio|sound engineer|instrument|vinyl|dj)\w*/i,
    se: ["music", "sound"],
  },
  {
    id: "design", label: "Design & creative",
    // "brand" alone matched every business that mentions its own brand, so this
    // requires the service being sold, not the noun.
    match: /\b(graphic design|branding|brand identity|logo design|illustrat\w*|creative agency|ux design|ui design|product design|typograph\w*|print design)\b/i,
    se: ["graphicdesign", "ux", "softwarerecs"],
  },
  {
    id: "marketing_web", label: "Marketing & web",
    match: /\b(marketing|seo|advertis|ppc|web design|website|agency|copywrit|social media manage|email marketing)\w*/i,
    se: ["webmasters", "softwarerecs", "ux"],
  },
  {
    id: "education", label: "Education & training",
    // "course" alone matches "of course", so it must be a course being sold.
    match: /\b(tutor\w*|tuition|online course|training course|courses|training|teach\w*|educat\w*|exam|curriculum|bootcamp|e-learning|elearning|academy)\b/i,
    se: ["academia", "matheducators"],
  },
  {
    id: "outdoors_sport", label: "Outdoors & sport",
    match: /\b(hiking|camping|climbing|fishing|angling|skiing|snowboard\w*|surfing|kayak\w*|sports?|golf|trail running|trails?)\b/i,
    se: ["outdoors", "sports", "fitness"],
  },
  {
    id: "making", label: "Making, 3D printing & electronics",
    match: /\b(3d print|maker|laser cut|cnc|prototyp|pcb|arduino|raspberry pi|robotic|fabricat)\w*/i,
    se: ["3dprinting", "electronics", "arduino"],
  },
  {
    id: "gaming", label: "Games & hobby",
    match: /\b(game|gaming|esport|board game|tabletop|miniature|puzzle|console)\w*/i,
    se: ["gaming", "boardgames"],
  },
];

// Verticals with no honest Stack Exchange home. Reddit and Quora carry these,
// and pretending otherwise would just burn calls on an unrelated site.
const NO_SE_FIT = /\b(wedding|bridal|event planner|party planning|real estate|realtor|letting agent|property manage|funeral|florist|cleaning service|removals|moving company|security guard|recruit|staffing)\w*/i;

// ── Entity-type defaults ─────────────────────────────────────────────────────
// Used when the free text is too thin to match a vertical. Keys are the
// ENTITY_TYPES ids from lib/entity.js.
const TYPE_DEFAULTS = {
  saas:            { se: ["softwarerecs", "webmasters"], tech: true },
  developer_tool:  { se: ["softwarerecs", "serverfault", "superuser"], tech: true },
  startup:         { se: ["softwarerecs", "webmasters"], tech: true },
  ai_product:      { se: ["softwarerecs", "ai", "datascience"], tech: true },
  mobile_app:      { se: ["softwarerecs", "android", "apple"], tech: true },
  // Physical products: Hardware Recommendations is literally "recommend me a
  // product that does X", which is pure buyer intent for anyone selling things.
  ecommerce:       { se: ["hardwarerecs", "softwarerecs"], tech: false },
  product:         { se: ["hardwarerecs"], tech: false },
  marketplace:     { se: ["softwarerecs", "hardwarerecs"], tech: false },
  subscription:    { se: ["softwarerecs"], tech: false },
  local_business:  { se: [], tech: false },
  restaurant:      { se: ["cooking", "coffee"], tech: false },
  doctor:          { se: ["health", "fitness"], tech: false },
  lawyer:          { se: ["law"], tech: false },
  real_estate:     { se: [], tech: false },
  home_services:   { se: ["diy", "woodworking"], tech: false },
  agency:          { se: ["webmasters", "graphicdesign", "ux"], tech: false },
  freelancer:      { se: ["softwarerecs", "graphicdesign"], tech: false },
  service:         { se: [], tech: false },
  nonprofit:       { se: [], tech: false },
  event:           { se: [], tech: false },
  personal_brand:  { se: [], tech: false },
  artist:          { se: ["crafts", "graphicdesign"], tech: false },
  musician:        { se: ["music", "sound"], tech: false },
  influencer:      { se: [], tech: false },
  youtuber:        { se: ["avp", "video"], tech: false },
};

// Entity groups whose buyers are genuinely technical. Only these are worth
// spending Hacker News and GitHub calls on.
const TECH_GROUPS = new Set(["Tech & Product"]);

// ── WHO the buyer is, which is a different question from WHAT is being sold ──
// The vertical match reads one haystack of every field, so "I sell rugs" and
// "I sell software to rug shops" looked identical to it — both matched Furniture
// and both got sent to DIY and woodworking, which is where people who BUILD
// furniture are. Neither business's buyers are there: one wants homeowners, the
// other wants retail owners, and a hobbyist sanding a table is neither.
//
// These two patterns read the target-customer fields on their own, so the answer
// comes from who Genie is looking FOR.

// The customer is another business. Bounded so "homeowners" does not read as
// "owner" and "shopping" does not read as "shop".
const BUYER_IS_A_BUSINESS = /\b(retailers?|stores?|shops?|shopkeep\w*|merchants?|sellers?|vendors?|brands?|businesses|business owners?|owners?|companies|company|firms?|agencies|agency|studios?|clinics?|salons?|practices?|restaurants?|hotels?|dealers?|dealerships?|distributors?|manufacturers?|wholesalers?|b2b|e-?commerce (?:stores?|shops?|brands?|sites?|businesses)|saas)\b/i;

// The customer is technical. This, not the company's own tech stack, is what
// makes Hacker News and GitHub worth a call: an AR company selling to furniture
// shops builds software and sells to people who have never opened GitHub.
const BUYER_IS_TECHNICAL = /\b(developers?|engineers?|programmers?|coders?|devops|sysadmins?|sre|cto|ctos|technical teams?|engineering teams?|software teams?|data scientists?|analysts? who code|it teams?|api consumers?|technical founders?|indie hackers?)\b/i;

// Where a business OWNER asks, as opposed to a hobbyist in the same vertical.
// Someone running a furniture shop asks about their product pages, their site
// and the tools they should buy — not about joinery.
const OWNER_SITES = ["webmasters", "softwarerecs", "ux"];

// ── The one function callers need ────────────────────────────────────────────
// Given the classified entity and the AI's read of the business, decide where
// this particular business's buyers actually ask.
//
// Returns:
//   seSites  — Stack Exchange slugs to search, best fit first (may be empty,
//              which is an honest answer for weddings or real estate)
//   tech     — whether Hacker News / GitHub are worth running
//   labels   — human-readable vertical names, for the UI
export function verticalsFor(entity, ai = {}) {
  const haystack = [
    ai.whatTheySell, ai.businessType, ai.summary, ai.targetCustomer,
    ai.idealCustomer, ai.differentiator, entity?.label,
    Array.isArray(ai.keywords) ? ai.keywords.join(" ") : ai.keywords,
    Array.isArray(ai.keyProducts) ? ai.keyProducts.join(" ") : ai.keyProducts,
  ].filter(Boolean).join(" ").toLowerCase();

  // The buyer's own words, read separately from everything else.
  const buyerText = [ai.targetCustomer, ai.idealCustomer].filter(Boolean).join(" ");
  const sellsToBusinesses = BUYER_IS_A_BUSINESS.test(buyerText);

  // A vertical that matches on one stray word is not a vertical. ARQR360's scan
  // mentions rooms, photos and a fitness studio in passing, and matched six —
  // "home improvement · furniture · food & drink · photography · fitness ·
  // marketing" is not a target market, it is noise wearing one's clothes.
  // Rank by how much of the business the vertical actually explains, and keep
  // the two that explain the most.
  const scored = VERTICALS
    .map((v) => ({ v, hits: (haystack.match(new RegExp(v.match.source, "gi")) || []).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  const strongest = scored[0]?.hits || 0;
  const hits = scored
    // Drop the long tail: a vertical mentioned once against one mentioned six
    // times is a passing reference, not a second market.
    .filter((x) => x.hits >= Math.max(2, strongest * 0.4) || x.hits === strongest)
    .slice(0, 2)
    .map((x) => x.v);

  const typeId = entity?.type || entity?.id || null;
  const fallback = TYPE_DEFAULTS[typeId] || { se: [], tech: false };

  // Hacker News and GitHub are worth a call only when the BUYERS are technical.
  // When the scan knows who the customer is, that settles it; the entity group
  // is only a fallback for a scan too thin to say. Without this, every company
  // that happens to be built with software spent its nightly budget on GitHub
  // issues, however non-technical the people it sells to.
  const tech = buyerText.trim()
    ? BUYER_IS_TECHNICAL.test(buyerText)
    : (TECH_GROUPS.has(entity?.group) || fallback.tech === true);

  let seSites = [];
  if (hits.length) {
    for (const v of hits) seSites.push(...v.se);
  }
  // Blend in the type default, so a matched vertical still keeps the sensible
  // baseline for its business model (a furniture ECOMMERCE store should hunt
  // Hardware Recommendations as well as Home Improvement).
  seSites.push(...fallback.se);

  // Selling to businesses in a vertical is not the same as being in it. The
  // vertical's own sites are where its practitioners and hobbyists are, and a
  // shop owner shopping for a tool is in neither: they are asking about their
  // website, their product pages and what software to buy. Their sites come
  // first, and the vertical's keep a place only if they were a real match.
  if (sellsToBusinesses) seSites = [...OWNER_SITES, ...(hits.length ? seSites : [])];

  // An honest empty: this business's buyers are not on Stack Exchange at all.
  if (NO_SE_FIT.test(haystack) && !hits.length) seSites = [];

  // Dedupe, keep order, and cap. Three sites is roughly one extra second of
  // nightly budget; beyond that the returns fall off fast.
  seSites = [...new Set(seSites)].slice(0, 3);

  return {
    seSites,
    tech,
    sellsToBusinesses,
    labels: hits.map((v) => v.label),
    verticalIds: hits.map((v) => v.id),
  };
}

// Exported for tests and for the diagnostics console.
export const _VERTICALS = VERTICALS;
