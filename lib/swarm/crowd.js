// lib/swarm/crowd.js
// ── WHO IS IN THE CROWD ──
// For each business, about 30 kinds of real buyer, written once from the business
// brief AND from real buyers' own words (the posts Buyer Hunt found), then kept
// for two weeks. lib/swarm/sim.js turns them into 1,000 individuals.
//
// Every kind of item also brings its own gatekeepers: the people who decide
// whether it is seen at all. A Reddit reply faces a moderator, a pitch faces an
// editor with fifty pitches a day, a cold email faces a spam filter and a busy
// inbox. They are few in the crowd but can block the whole thing, as in life.

export const CROWD_TTL_DAYS = 14;

// What each kind of item is, in the words the crowd is told, and who guards it.
export const KINDS = {
  article: {
    label: "blog article", context: "A blog article. People first see its title and description in Google results; the ones who click read the article.",
    gates: [
      { id: "g-searcher", name: "Google searcher", who: "Skims ten results in two seconds and clicks the one that answers the question most clearly", skeptic: 0.6, weight: 4 },
      { id: "g-ai", name: "AI assistant choosing sources", who: "An AI answer engine deciding whether this page is clear, specific and trustworthy enough to quote", skeptic: 0.7, weight: 1, gate: true },
    ],
  },
  reddit: {
    label: "Reddit post or reply", context: "A post or comment in a Reddit community.",
    gates: [
      { id: "g-mod", name: "Subreddit moderator", who: "Removes anything that reads like self-promotion or breaks the community rules", skeptic: 0.9, weight: 1, gate: true },
      { id: "g-regular", name: "Long-time community member", who: "Downvotes adverts, upvotes honest first-hand help", skeptic: 0.8, weight: 3 },
    ],
  },
  quora: {
    label: "Quora answer", context: "An answer to a question on Quora.",
    gates: [{ id: "g-quora", name: "Quora reader", who: "Downvotes answers that dodge the question to promote something", skeptic: 0.75, weight: 2, gate: true }],
  },
  social: {
    label: "social media post", context: "A post in a social feed (X, LinkedIn, Pinterest or Google Business).",
    gates: [{ id: "g-scroller", name: "Fast scroller", who: "Decides in one second whether to stop scrolling", skeptic: 0.6, weight: 4 }],
  },
  email: {
    label: "cold email", context: "An unsolicited email to a business decision-maker who has never heard of the sender.",
    gates: [
      { id: "g-spam", name: "Spam filter", who: "Flags sales language, too many links and anything that looks mass-sent", skeptic: 0.9, weight: 1, gate: true },
      { id: "g-busy", name: "Busy decision-maker", who: "Gets 120 emails a day and reads the first line only", skeptic: 0.8, weight: 4 },
    ],
  },
  pitch: {
    label: "pitch to a website", buyers: 0.3,
    context: "A pitch emailed to the editor or owner of a website, asking to be featured, listed or to write for them.",
    gates: [
      { id: "g-editor", name: "Editor", who: "Gets 50 pitches a day and replies only to ones that clearly help their readers", skeptic: 0.9, weight: 4, gate: true },
      { id: "g-journalist", name: "Journalist on deadline", who: "Wants a specific angle, real numbers and a quick yes", skeptic: 0.8, weight: 2 },
      { id: "g-blogger", name: "Roundup blogger", who: "Runs a best-of list and adds tools that make the list better for readers", skeptic: 0.7, weight: 3 },
    ],
  },
  listing: {
    label: "directory listing", context: "A listing submitted to a directory, review site or launch site.",
    gates: [{ id: "g-reviewer", name: "Directory reviewer", who: "Approves listings that are clear, honest and in the right category", skeptic: 0.7, weight: 1, gate: true }],
  },
  reply: {
    label: "reply to someone asking for help", context: "A reply to a real person who asked a question online, visible to everyone in the thread.",
    gates: [
      { id: "g-op", name: "The person who asked", who: "Wants a real answer to their exact problem, not a sales pitch", skeptic: 0.6, weight: 4 },
      { id: "g-mod", name: "Community moderator", who: "Removes replies that are adverts in disguise", skeptic: 0.9, weight: 1, gate: true },
    ],
  },
  winback: {
    label: "win-back email", context: "An email to a past customer or old lead who went quiet.",
    gates: [{ id: "g-spam", name: "Spam filter", who: "Flags sales language and anything that looks mass-sent", skeptic: 0.9, weight: 1, gate: true }],
  },
};

/** Which kind a queued item is. */
export function kindOf(item) {
  const t = item.type || "";
  const plat = String(item.payload?.platform || item.target?.platform || item.platform || "").toLowerCase();
  if (item.source === "placement") return /reddit/.test(plat) ? "reddit" : /quora/.test(plat) ? "quora" : "reply";
  if (t === "article") return "article";
  if (t === "media_outreach") return "pitch";
  if (t === "directory_submission") return "listing";
  if (t === "outreach_email") return "email";
  if (t === "recovery") return "winback";
  if (/reddit/.test(plat)) return "reddit";
  if (/quora/.test(plat)) return "quora";
  return "social";
}

/** The crowd for this item: the business's buyers plus the kind's gatekeepers. */
export function crowdFor(buyers, kind) {
  const k = KINDS[kind] || KINDS.social;
  const scale = k.buyers ?? 1;
  return [
    ...buyers.map((b) => ({ ...b, weight: (Number(b.weight) || 1) * scale })),
    ...k.gates.map((g) => ({ ...g })),
  ];
}

/** Prompt that writes the business's buyers. One call per business per fortnight. */
export function crowdPrompt(ai = {}, host = "", voices = []) {
  return `BUSINESS
Name: ${ai.businessName || host}
Website: ${host}
Sells: ${ai.whatTheySell || ""}
Customers: ${ai.targetCustomer || ""}
${ai.brief ? `Brief: ${JSON.stringify(ai.brief).slice(0, 2500)}` : ""}
${voices.length ? `\nREAL BUYERS' OWN WORDS (posts found online):\n${voices.map((v) => `- ${String(v).slice(0, 180)}`).join("\n")}` : ""}

Describe 30 distinct kinds of people who could be this business's customers or who judge it on the way (users, buyers, influencers on the purchase, sceptics, people loyal to a competitor, first-timers, experts, bargain hunters, people who already tried and gave up). Make them as different from each other as real people are. Most real people are indifferent or sceptical; reflect that.

Return ONLY:
{"people":[{"name":"short label","who":"one sentence: who they are and their situation","wants":"what they need","fears":"what would put them off","skeptic":0.0-1.0,"weight":1-10}]}
weight = how common this kind of person is among the people who would see this business's marketing.`;
}

export function normalizeCrowd(json = {}) {
  const list = Array.isArray(json?.people) ? json.people : [];
  return list.slice(0, 40).map((p, i) => ({
    id: `a${i + 1}`,
    name: String(p?.name || `Buyer ${i + 1}`).slice(0, 60),
    who: String(p?.who || "").slice(0, 220),
    wants: String(p?.wants || "").slice(0, 160),
    fears: String(p?.fears || "").slice(0, 160),
    skeptic: clamp01(p?.skeptic, 0.5),
    weight: Math.max(1, Math.min(10, Number(p?.weight) || 3)),
  })).filter((p) => p.who);
}

/**
 * A crowd without any AI, from the brief alone. Used when every free AI is busy
 * so the crowd still exists and testing never stops.
 */
export function fallbackCrowd(ai = {}) {
  const c = ai.targetCustomer || "the customer";
  const s = ai.whatTheySell || "this product";
  const base = [
    ["Early adopter", `Likes trying new things like ${s}`, 0.2, 3],
    ["Busy buyer", `${c}, short on time, wants the point fast`, 0.5, 8],
    ["Sceptic", `${c} who has been burned by similar promises`, 0.9, 6],
    ["Price-sensitive buyer", `${c} comparing on price first`, 0.6, 7],
    ["Quality seeker", `${c} who pays more for something proven`, 0.5, 4],
    ["Competitor's customer", `Already uses an alternative to ${s} and sees no reason to switch`, 0.8, 6],
    ["First-timer", `Has never bought anything like ${s} and needs it explained`, 0.4, 5],
    ["Expert", `Knows the field deeply and spots vague claims instantly`, 0.8, 3],
    ["Researcher", `Reads reviews and comparisons before deciding`, 0.6, 5],
    ["Indifferent scroller", `Not in the market right now`, 0.7, 10],
    ["Recommender", `Colleague or friend asked for advice on ${s}`, 0.5, 3],
    ["Ready buyer", `${c} actively looking to buy this month`, 0.3, 2],
  ];
  return base.map(([name, who, skeptic, weight], i) => ({ id: `a${i + 1}`, name, who, wants: "", fears: "", skeptic, weight }));
}

function clamp01(v, d) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; }
