// lib/entity.js
// ── THE ENTITY BRAIN ──
// Marketing Genie grows an ENTITY, not just "a business". The intelligence is
// identical for every entity — what changes is the PLAYBOOK, and the playbook is
// DERIVED from a compact set of dimensions, never hardcoded per type. Add a new
// entity type = a few dimensions, not a new product. This is what lets one AI
// employee adapt to a SaaS, a musician, a restaurant, or a book automatically.
//
// Flow:  classifyEntity(ai)  ->  { type, dims, playbook }  ->  entityBriefing()
//        injected into every AI decision so Genie always acts in-character.

// ── Dimension vocabulary (the orthogonal traits everything derives from) ──
// audience:        b2b | b2c | local | global | niche
// commerceModel:   product | service | content | personal_brand | marketplace | event | cause
// conversionGoal:  purchase | lead | booking | signup | follow | attend | donate | download | read
// trustDriver:     results | reviews | authority | portfolio | credentials | social_proof | fanbase
// contentMode:     educational | showcase | storytelling | thought_leadership | entertainment
// discovery:       ranked high-level surfaces — search | aiSearch | community | social | local | pr | video
// aeoImportance:   0..1  (how much ranking inside ChatGPT/Perplexity/AI Overviews matters)
// localImportance: 0..1  (how much local SEO / maps / geo matters)
// voice:           short descriptor of the writing voice

const DEFAULTS = {
  audience: "b2c",
  commerceModel: "service",
  conversionGoal: "lead",
  trustDriver: "reviews",
  contentMode: "educational",
  discovery: ["search", "aiSearch", "community", "social"],
  aeoImportance: 0.6,
  localImportance: 0.1,
  voice: "clear, credible, human",
};

const T = (dims) => ({ ...DEFAULTS, ...dims });

// ── The entity taxonomy (human-facing type -> dimension profile) ──
export const ENTITY_TYPES = {
  // Tech & product
  saas:           { label: "SaaS", group: "Tech & Product", dims: T({ audience: "b2b", commerceModel: "product", conversionGoal: "signup", trustDriver: "results", contentMode: "educational", discovery: ["search", "aiSearch", "community", "social"], aeoImportance: 0.95, voice: "sharp, useful, no fluff" }) },
  mobile_app:     { label: "Mobile App", group: "Tech & Product", dims: T({ audience: "b2c", commerceModel: "product", conversionGoal: "download", trustDriver: "reviews", contentMode: "showcase", discovery: ["social", "search", "aiSearch", "video"], aeoImportance: 0.6, voice: "energetic, benefit-led" }) },
  startup:        { label: "Startup", group: "Tech & Product", dims: T({ audience: "b2b", commerceModel: "product", conversionGoal: "signup", trustDriver: "results", contentMode: "thought_leadership", discovery: ["search", "aiSearch", "community", "pr", "social"], aeoImportance: 0.9, voice: "visionary but concrete" }) },
  developer_tool: { label: "Developer Tool", group: "Tech & Product", dims: T({ audience: "b2b", commerceModel: "product", conversionGoal: "signup", trustDriver: "results", contentMode: "educational", discovery: ["search", "aiSearch", "community", "social"], aeoImportance: 0.95, voice: "precise, technical, respectful of time" }) },
  ai_product:     { label: "AI Product", group: "Tech & Product", dims: T({ audience: "global", commerceModel: "product", conversionGoal: "signup", trustDriver: "results", contentMode: "thought_leadership", discovery: ["aiSearch", "search", "social", "community"], aeoImportance: 1.0, voice: "credible, forward-looking" }) },

  // Commerce
  ecommerce:      { label: "Ecommerce Store", group: "Commerce", dims: T({ audience: "b2c", commerceModel: "product", conversionGoal: "purchase", trustDriver: "reviews", contentMode: "showcase", discovery: ["search", "social", "aiSearch", "video"], aeoImportance: 0.55, localImportance: 0.2, voice: "warm, aspirational, trustworthy" }) },
  product:        { label: "Product", group: "Commerce", dims: T({ audience: "b2c", commerceModel: "product", conversionGoal: "purchase", trustDriver: "reviews", contentMode: "showcase", discovery: ["search", "social", "aiSearch"], aeoImportance: 0.5, voice: "vivid, benefit-first" }) },
  marketplace:    { label: "Marketplace", group: "Commerce", dims: T({ audience: "global", commerceModel: "marketplace", conversionGoal: "signup", trustDriver: "social_proof", contentMode: "educational", discovery: ["search", "aiSearch", "social", "community"], aeoImportance: 0.7, voice: "trust-building, two-sided" }) },
  subscription:   { label: "Subscription / Membership", group: "Commerce", dims: T({ audience: "b2c", commerceModel: "product", conversionGoal: "signup", trustDriver: "results", contentMode: "storytelling", discovery: ["social", "search", "aiSearch"], aeoImportance: 0.5, voice: "value-forward, retention-minded" }) },

  // Local & professional
  local_business: { label: "Local Business", group: "Local & Professional", dims: T({ audience: "local", conversionGoal: "booking", trustDriver: "reviews", discovery: ["local", "search", "social"], aeoImportance: 0.4, localImportance: 1.0, voice: "friendly, community-rooted" }) },
  restaurant:     { label: "Restaurant / Cafe", group: "Local & Professional", dims: T({ audience: "local", commerceModel: "service", conversionGoal: "booking", trustDriver: "reviews", contentMode: "showcase", discovery: ["local", "social", "search"], aeoImportance: 0.3, localImportance: 1.0, voice: "inviting, sensory" }) },
  doctor:         { label: "Doctor / Healthcare", group: "Local & Professional", dims: T({ audience: "local", commerceModel: "service", conversionGoal: "booking", trustDriver: "credentials", contentMode: "educational", discovery: ["local", "search", "aiSearch"], aeoImportance: 0.7, localImportance: 0.9, voice: "reassuring, authoritative, careful" }) },
  lawyer:         { label: "Lawyer / Legal", group: "Local & Professional", dims: T({ audience: "local", commerceModel: "service", conversionGoal: "lead", trustDriver: "authority", contentMode: "educational", discovery: ["search", "aiSearch", "local"], aeoImportance: 0.8, localImportance: 0.8, voice: "authoritative, precise, trustworthy" }) },
  real_estate:    { label: "Real Estate Agent", group: "Local & Professional", dims: T({ audience: "local", commerceModel: "service", conversionGoal: "lead", trustDriver: "results", contentMode: "showcase", discovery: ["local", "social", "search"], aeoImportance: 0.4, localImportance: 1.0, voice: "confident, local-expert" }) },
  home_services:  { label: "Home Services", group: "Local & Professional", dims: T({ audience: "local", commerceModel: "service", conversionGoal: "booking", trustDriver: "reviews", discovery: ["local", "search"], aeoImportance: 0.3, localImportance: 1.0, voice: "dependable, straightforward" }) },

  // Agency & service
  agency:         { label: "Agency", group: "Service & Org", dims: T({ audience: "b2b", commerceModel: "service", conversionGoal: "lead", trustDriver: "portfolio", contentMode: "thought_leadership", discovery: ["search", "aiSearch", "social", "pr"], aeoImportance: 0.8, voice: "expert, results-driven" }) },
  freelancer:     { label: "Freelancer / Consultant", group: "Service & Org", dims: T({ audience: "b2b", commerceModel: "personal_brand", conversionGoal: "lead", trustDriver: "portfolio", contentMode: "thought_leadership", discovery: ["social", "search", "community"], aeoImportance: 0.6, voice: "personal, credible, specific" }) },
  service:        { label: "Service Business", group: "Service & Org", dims: T({ audience: "b2c", commerceModel: "service", conversionGoal: "booking", trustDriver: "reviews", discovery: ["search", "local", "social"], aeoImportance: 0.5, localImportance: 0.6, voice: "helpful, trustworthy" }) },
  nonprofit:      { label: "Non-profit / Cause", group: "Service & Org", dims: T({ audience: "global", commerceModel: "cause", conversionGoal: "donate", trustDriver: "social_proof", contentMode: "storytelling", discovery: ["social", "search", "pr", "community"], aeoImportance: 0.4, voice: "moving, mission-first, honest" }) },
  event:          { label: "Event / Conference", group: "Service & Org", dims: T({ audience: "niche", commerceModel: "event", conversionGoal: "attend", trustDriver: "social_proof", contentMode: "showcase", discovery: ["social", "search", "community", "pr"], aeoImportance: 0.5, voice: "urgent, exciting, credible" }) },

  // Creator & personal
  personal_brand: { label: "Personal Brand", group: "Creator & Personal", dims: T({ audience: "global", commerceModel: "personal_brand", conversionGoal: "follow", trustDriver: "authority", contentMode: "thought_leadership", discovery: ["social", "search", "video", "community"], aeoImportance: 0.5, voice: "distinct, opinionated, magnetic" }) },
  artist:         { label: "Artist", group: "Creator & Personal", dims: T({ audience: "niche", commerceModel: "personal_brand", conversionGoal: "follow", trustDriver: "fanbase", contentMode: "storytelling", discovery: ["social", "video", "community"], aeoImportance: 0.2, voice: "authentic, evocative" }) },
  musician:       { label: "Musician", group: "Creator & Personal", dims: T({ audience: "niche", commerceModel: "personal_brand", conversionGoal: "follow", trustDriver: "fanbase", contentMode: "entertainment", discovery: ["social", "video", "community"], aeoImportance: 0.2, voice: "expressive, on-brand, fan-first" }) },
  influencer:     { label: "Influencer / Creator", group: "Creator & Personal", dims: T({ audience: "b2c", commerceModel: "personal_brand", conversionGoal: "follow", trustDriver: "social_proof", contentMode: "entertainment", discovery: ["social", "video", "search"], aeoImportance: 0.3, voice: "relatable, high-energy" }) },
  youtuber:       { label: "YouTuber / Video Creator", group: "Creator & Personal", dims: T({ audience: "global", commerceModel: "content", conversionGoal: "follow", trustDriver: "social_proof", contentMode: "entertainment", discovery: ["video", "social", "search"], aeoImportance: 0.35, voice: "hooky, personable" }) },
  podcaster:      { label: "Podcast", group: "Content & Media", dims: T({ audience: "niche", commerceModel: "content", conversionGoal: "follow", trustDriver: "authority", contentMode: "thought_leadership", discovery: ["search", "aiSearch", "social", "community"], aeoImportance: 0.6, voice: "conversational, insightful" }) },
  author:         { label: "Author / Book", group: "Content & Media", dims: T({ audience: "global", commerceModel: "content", conversionGoal: "purchase", trustDriver: "authority", contentMode: "storytelling", discovery: ["search", "aiSearch", "social", "pr", "community"], aeoImportance: 0.6, voice: "authoritative, narrative" }) },
  course_creator: { label: "Course / Education", group: "Content & Media", dims: T({ audience: "b2c", commerceModel: "content", conversionGoal: "purchase", trustDriver: "results", contentMode: "educational", discovery: ["search", "aiSearch", "social", "community"], aeoImportance: 0.8, voice: "clear, motivating, proof-led" }) },

  // Fallback
  business:       { label: "Business", group: "General", dims: T({}) },
};

// ── Concrete channel expansion (with a one-line WHY for explainability) ──
const CHANNEL_LIBRARY = {
  search:    { label: "Google Search (SEO)", why: "capture people actively searching for what you offer" },
  aiSearch:  { label: "AI Search (ChatGPT · Perplexity · AI Overviews)", why: "be the answer AI assistants cite when buyers ask" },
  reddit:    { label: "Reddit", why: "join real conversations where buyers compare options" },
  quora:     { label: "Quora", why: "answer high-intent questions and rank them on Google too" },
  forums:    { label: "Niche forums", why: "reach focused communities that trust peer advice" },
  x:         { label: "X / Twitter", why: "build authority and ride fast-moving conversations" },
  linkedin:  { label: "LinkedIn", why: "reach decision-makers and B2B buyers directly" },
  instagram: { label: "Instagram", why: "showcase visually and reach a scrolling audience" },
  tiktok:    { label: "TikTok", why: "earn discovery through short-form reach" },
  youtube:   { label: "YouTube", why: "own high-intent search + long-term discovery via video" },
  blog:      { label: "Owned blog", why: "compound organic traffic you fully control" },
  medium:    { label: "Medium / publications", why: "borrow existing audiences and earn authority" },
  localSeo:  { label: "Local SEO / Google Business Profile", why: "win the map pack and 'near me' searches" },
  directories: { label: "Directories & listings", why: "be findable everywhere customers look" },
  podcasts:  { label: "Podcast guesting", why: "borrow trust and reach engaged niche audiences" },
  newsletters: { label: "Newsletter placements", why: "reach subscribed, high-attention audiences" },
  pr:        { label: "PR & press", why: "authority signals that lift trust and rankings" },
  backlinks: { label: "Backlinks", why: "the #1 off-page ranking lever" },
  influencers: { label: "Influencer partnerships", why: "borrow audiences that already trust a voice" },
  affiliates: { label: "Affiliates / partners", why: "pay only for results while others sell for you" },
  reviews:   { label: "Reviews & reputation", why: "social proof that converts consideration into purchase" },
  email:     { label: "Email / outreach", why: "direct, ownable relationships with buyers" },
};

// Map high-level discovery surfaces + dims -> ranked concrete channels.
function deriveChannels(dims) {
  const w = {}; // channel -> weight
  const add = (k, v) => { w[k] = Math.max(w[k] || 0, v); };

  const surfaceWeight = { 0: 1.0, 1: 0.85, 2: 0.7, 3: 0.55 };
  dims.discovery.forEach((s, i) => {
    const base = surfaceWeight[i] ?? 0.4;
    if (s === "search") { add("search", base); add("blog", base * 0.8); add("backlinks", base * 0.7); }
    if (s === "aiSearch") { add("aiSearch", base + dims.aeoImportance * 0.2); add("quora", base * 0.6); }
    if (s === "community") { add("reddit", base); add("quora", base * 0.8); add("forums", base * 0.6); }
    if (s === "social") {
      if (dims.audience === "b2b") add("linkedin", base); else add("instagram", base);
      add("x", base * 0.7);
    }
    if (s === "video") { add("youtube", base); add("tiktok", base * 0.7); }
    if (s === "local") { add("localSeo", base); add("directories", base * 0.8); add("reviews", base * 0.8); }
    if (s === "pr") { add("pr", base); add("podcasts", base * 0.8); add("newsletters", base * 0.7); }
  });

  // Dimension-driven boosts
  if (dims.aeoImportance >= 0.8) add("aiSearch", 0.95);
  if (dims.localImportance >= 0.7) { add("localSeo", 0.95); add("reviews", 0.8); add("directories", 0.7); }
  if (dims.trustDriver === "reviews") add("reviews", 0.75);
  if (dims.trustDriver === "authority" || dims.contentMode === "thought_leadership") add("pr", 0.6);
  if (dims.audience === "b2b") { add("linkedin", 0.8); add("email", 0.7); }
  if (dims.commerceModel === "personal_brand") { add("x", 0.7); add("email", 0.6); }
  add("email", Math.max(w.email || 0, 0.4)); // outreach is universal

  return Object.entries(w)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, weight]) => ({ key, weight: Math.round(weight * 100) / 100, ...CHANNEL_LIBRARY[key] }));
}

const GROWTH_TACTICS = {
  results: "Publish proof: case studies, before/afters, and measurable outcomes.",
  reviews: "Systematically earn and surface reviews; answer every one publicly.",
  authority: "Ship thought-leadership and get cited by press, podcasts, and AI answers.",
  portfolio: "Lead with your best work; turn each win into a shareable story.",
  credentials: "Foreground qualifications, certifications, and trust signals everywhere.",
  social_proof: "Amplify numbers, logos, testimonials, and community momentum.",
  fanbase: "Feed the superfans first; give them reasons to share and gather others.",
};

// Compute the full adaptive playbook from dimensions.
export function derivePlaybook(dims) {
  const channels = deriveChannels(dims);
  const seoWeight = Math.round((1 - dims.aeoImportance * 0.35) * 100) / 100;
  return {
    channels,
    primaryGoal: dims.conversionGoal,
    seoFocus: seoWeight,
    aeoFocus: dims.aeoImportance,
    localFocus: dims.localImportance,
    contentStrategy: {
      mode: dims.contentMode,
      angle: GROWTH_TACTICS[dims.trustDriver] || GROWTH_TACTICS.reviews,
      formats: contentFormats(dims),
    },
    outreachStyle: outreachStyle(dims),
    trustDriver: dims.trustDriver,
    growthTactics: [
      GROWTH_TACTICS[dims.trustDriver] || GROWTH_TACTICS.reviews,
      dims.aeoImportance >= 0.7 ? "Structure content to be quoted by AI search (clear answers, FAQs, comparisons)." : null,
      dims.localImportance >= 0.7 ? "Dominate local: Google Business Profile, local pages, and reviews." : null,
      `Find people with buying intent on ${channels.slice(0, 2).map((c) => c.label).join(" and ")}.`,
    ].filter(Boolean),
    voice: dims.voice,
  };
}

function contentFormats(dims) {
  const f = [];
  if (dims.contentMode === "educational") f.push("how-to guides", "comparisons", "FAQs");
  if (dims.contentMode === "thought_leadership") f.push("opinion pieces", "frameworks", "data studies");
  if (dims.contentMode === "showcase") f.push("product stories", "visual posts", "buyer guides");
  if (dims.contentMode === "storytelling") f.push("origin & journey stories", "behind-the-scenes");
  if (dims.contentMode === "entertainment") f.push("short-form video", "hooks", "trend riffs");
  if (dims.aeoImportance >= 0.7) f.push("AI-answer-ready explainers");
  return f.length ? f : ["how-to guides", "comparisons"];
}

function outreachStyle(dims) {
  if (dims.audience === "b2b") return "Warm, specific, value-first — one clear reason it helps them.";
  if (dims.commerceModel === "personal_brand") return "Personal and genuine — you, not a company.";
  if (dims.localImportance >= 0.7) return "Local and neighborly — reference the area and community.";
  return "Friendly, concrete, and respectful of their time.";
}

// ── Classify an entity from a scan's AI analysis (heuristic; confirmable) ──
const KEYWORD_TYPE = [
  [/\b(saas|software as a service|platform|dashboard|api)\b/i, "saas"],
  [/\bdeveloper|dev tool|sdk|cli|open source\b/i, "developer_tool"],
  [/\bai|artificial intelligence|llm|machine learning|gpt\b/i, "ai_product"],
  [/\bapp\b/i, "mobile_app"],
  [/\bstartup\b/i, "startup"],
  [/\b(store|shop|ecommerce|e-commerce|boutique|apparel|merch)\b/i, "ecommerce"],
  [/\bmarketplace\b/i, "marketplace"],
  [/\bsubscription|membership\b/i, "subscription"],
  [/\brestaurant|cafe|coffee|bakery|bar|diner|food\b/i, "restaurant"],
  [/\b(doctor|clinic|dental|dentist|medical|health|therapy|physio)\b/i, "doctor"],
  [/\b(law|lawyer|attorney|legal|solicitor)\b/i, "lawyer"],
  [/\breal estate|realtor|realty|property\b/i, "real_estate"],
  [/\b(plumber|electrician|hvac|cleaning|landscap|contractor|roofing|home services)\b/i, "home_services"],
  [/\bagency\b/i, "agency"],
  [/\b(freelance|consultant|coach)\b/i, "freelancer"],
  [/\bnon-?profit|charity|foundation|ngo\b/i, "nonprofit"],
  [/\b(event|conference|festival|summit|meetup)\b/i, "event"],
  [/\bmusician|band|singer|producer|dj\b/i, "musician"],
  [/\bartist|painter|illustrator|designer portfolio\b/i, "artist"],
  [/\binfluencer|creator\b/i, "influencer"],
  [/\byoutube|video creator\b/i, "youtuber"],
  [/\bpodcast\b/i, "podcaster"],
  [/\bauthor|book|novel|writer\b/i, "author"],
  [/\bcourse|academy|bootcamp|training|education|tutor\b/i, "course_creator"],
  [/\bpersonal brand\b/i, "personal_brand"],
];

const BUSINESS_TYPE_MAP = {
  "e-commerce": "ecommerce",
  "local service": "service",
  "saas": "saas",
  "content/media": "podcaster",
  "marketplace": "marketplace",
  "agency": "agency",
};

export function classifyEntity(ai = {}, override) {
  if (override && ENTITY_TYPES[override]) {
    return buildEntity(override, 1, "user");
  }
  const hay = [ai.businessType, ai.industry, ai.subCategory, ai.whatTheySell, ai.businessName]
    .filter(Boolean).join(" ").toLowerCase();

  for (const [re, type] of KEYWORD_TYPE) {
    if (re.test(hay)) return buildEntity(type, 0.75, "inferred");
  }
  const bt = String(ai.businessType || "").toLowerCase().trim();
  if (BUSINESS_TYPE_MAP[bt]) return buildEntity(BUSINESS_TYPE_MAP[bt], 0.6, "inferred");
  return buildEntity("business", 0.4, "fallback");
}

function buildEntity(type, confidence, source) {
  const t = ENTITY_TYPES[type] || ENTITY_TYPES.business;
  return {
    type,
    label: t.label,
    group: t.group,
    dims: t.dims,
    playbook: derivePlaybook(t.dims),
    confidence,
    source, // user | inferred | fallback
  };
}

// ── The briefing Genie injects into every AI decision (the adaptation hook) ──
export function entityBriefing(entity) {
  if (!entity) return "";
  const p = entity.playbook;
  const top = p.channels.slice(0, 4).map((c) => c.label).join(", ");
  const aeo = p.aeoFocus >= 0.8 ? "critical" : p.aeoFocus >= 0.5 ? "important" : "minor";
  const local = p.localFocus >= 0.7 ? "critical" : p.localFocus >= 0.3 ? "relevant" : "not relevant";
  return [
    `You are growing a ${entity.label}. Adapt EVERY action to this — never generic.`,
    `Audience: ${entity.dims.audience}. Primary goal: ${p.primaryGoal}.`,
    `Prioritize these channels: ${top}.`,
    `Win trust through: ${entity.dims.trustDriver}. Content mode: ${entity.dims.contentMode}.`,
    `AI-search visibility is ${aeo}. Local SEO is ${local}.`,
    `Voice: ${entity.dims.voice}.`,
  ].join("\n");
}

// List types for UI pickers (grouped).
export function entityTypeOptions() {
  return Object.entries(ENTITY_TYPES)
    .filter(([id]) => id !== "business")
    .map(([id, t]) => ({ id, label: t.label, group: t.group }));
}
