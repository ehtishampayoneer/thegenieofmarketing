// lib/platform-policy.js
// ── PLATFORM POLICY AWARENESS ──
// Each platform has norms; violating them gets accounts banned and torches a
// user's brand. This is a small, provider-agnostic rulebook Genie checks content
// against before anything goes out. Heuristic + fast; the deeper brand/claim
// checks live in publish-guard. Add a platform = a config entry, not new code.

export const POLICIES = {
  reddit: { maxLinks: 1, maxHashtags: 0, banned: [/\bbuy now\b/i, /\bcheck out my\b/i, /\buse my (code|link|referral)\b/i, /\bdm me\b/i, /\bsign up (here|now)\b/i], note: "Value-first. Reddit bans overt self-promotion fast; mention the product only if it genuinely helps." },
  quora: { maxLinks: 1, maxHashtags: 0, banned: [/\bbuy now\b/i, /\bclick here\b/i], note: "Answer the question genuinely; disclose any affiliation." },
  x: { maxLinks: 2, maxHashtags: 3, banned: [], note: "Avoid hashtag spam and follow-bait." },
  linkedin: { maxLinks: 1, maxHashtags: 5, banned: [/\bcomment .* to (win|get)\b/i, /\btag \d+ (friends|people)\b/i, /\blike (and|&) share\b/i], note: "No engagement bait." },
  medium: { maxLinks: 10, maxHashtags: 5, banned: [], note: "Disclose promotional content." },
  blog: { maxLinks: 30, maxHashtags: 0, banned: [], note: "" },
  email: { maxLinks: 5, maxHashtags: 0, banned: [/\bact now\b/i, /\bfree money\b/i, /\bguaranteed income\b/i], note: "Must include unsubscribe + a physical postal address (CAN-SPAM)." },
};

export function checkPolicy(channel, content) {
  const p = POLICIES[channel] || {};
  const text = String(content || "");
  const flags = [];
  const links = (text.match(/https?:\/\//g) || []).length;
  if (p.maxLinks != null && links > p.maxLinks) flags.push(`too_many_links(${links})`);
  if (p.maxHashtags != null && p.maxHashtags >= 0) {
    const h = (text.match(/#\w+/g) || []).length;
    if (h > p.maxHashtags) flags.push(`hashtag_spam(${h})`);
  }
  for (const re of (p.banned || [])) if (re.test(text)) flags.push("banned_phrase");
  return { channel, flags, risk: Math.min(100, flags.length * 30), note: p.note || "" };
}
