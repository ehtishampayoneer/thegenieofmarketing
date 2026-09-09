// lib/platform-craft.js
// ── HOW TO WRITE FOR EACH PLACE, NOT JUST WHAT TO SAY ──
// The article prompt already teaches craft: open on the reader's problem, ban AI
// clichés, vary sentence length, add real information gain. The social side had
// none of that. Its entire instruction set was a format description, and two of
// them were working against the platform:
//
//   • X was told to write posts "promoting the article" with hashtags. A post
//     carrying an outbound link gets suppressed, and hashtags on X now read as
//     spam. The post has to stand on its own and earn the click separately.
//   • LinkedIn was told to write "1 professional LinkedIn post version". The
//     entire mechanic of LinkedIn is the ~210 characters visible before "see
//     more", and nothing mentioned it.
//
// No character limits were given anywhere either, so the model guessed at length
// on every platform, and nothing said how to CLOSE a post, which is what
// actually earns a comment or a save.
//
// This is deliberately craft, not "virality". Nobody engineers virality
// reliably, and chasing it produces clickbait, which repels B2B buyers and gets
// posts removed on Reddit. What is written here is the boring mechanical truth
// of each platform: how long, what the first line must do, what suppresses
// reach, and how to end.
//
// Injected into the content prompt that already runs, so this costs no extra AI
// call, no extra latency and nothing against the daily free-tier budgets.

// One entry per platform. `limit` is the hard character ceiling, `fold` is how
// much is visible before the reader has to tap "see more" — the number that
// actually decides whether a post is read.
export const PLATFORMS = {
  twitter: {
    label: "X (Twitter)",
    limit: 280,
    fold: 280,
    rules: [
      "The post must stand completely on its own. Never write it as a trailer for the article.",
      "No link in the post. A post carrying an outbound link gets shown to far fewer people, so the link goes in a reply instead.",
      "Hashtags are dead here. Use zero, or one at most if it is a genuine community tag.",
      "First six words decide everything. Open on the claim, the number, or the surprise. No throat-clearing, no 'Ever wondered'.",
      "One idea per post. If it needs two, it is two posts.",
      "For a thread, the first post has to work alone as a complete thought, or nobody reads post two.",
    ],
  },
  linkedin: {
    label: "LinkedIn",
    limit: 3000,
    fold: 210,
    rules: [
      "Everything rests on the first two lines. Only about 210 characters show before 'see more', so the hook must land there or the post is invisible.",
      "Never open with 'I'm excited to share' or 'In today's world'. Open with a specific moment, a number, or a claim someone might disagree with.",
      "One or two sentences per paragraph, with a blank line between. A wall of text is not read here.",
      "No outbound link in the post body, it suppresses reach. Say the link is in the comments.",
      "First person. A real thing that happened, with a real detail in it.",
      "End on a genuine question you actually want answered, not 'thoughts?'.",
      "Three to five hashtags at the very end are still fine on LinkedIn.",
    ],
  },
  instagram: {
    label: "Instagram",
    limit: 2200,
    fold: 125,
    rules: [
      "Only about 125 characters show before 'more', so the first line is the whole hook.",
      "Write for someone who is scrolling fast and has already seen the image. Add what the image cannot say.",
      "Links are not clickable in captions. Point to the bio instead of pasting a URL.",
      "Aim to be saved, not just liked. Something useful enough to come back to beats something clever.",
      "Three to five specific hashtags at the end. Thirty generic ones read as spam.",
      "Short lines with breaks. Dense paragraphs get skipped.",
    ],
  },
  facebook: {
    label: "Facebook",
    limit: 2000,
    fold: 477,
    rules: [
      "About 477 characters show before 'See more'. Land the point before that.",
      "Warmer and more conversational than LinkedIn. Write like a person talking to their community, not a brand talking to a market.",
      "Questions genuinely drive comments here, and comments drive reach.",
      "Links are fine on Facebook, unlike X and LinkedIn.",
    ],
  },
  reddit: {
    label: "Reddit",
    limit: 4000,
    fold: 300,
    rules: [
      "The title does most of the work. Make it a plain, specific statement of the situation, never a headline and never clickbait.",
      "Write as a knowledgeable person helping, with no marketing voice anywhere.",
      "Give the useful answer in full whether or not anyone buys. Mention the product only if leaving it out would make the answer worse.",
      "No 'check out', no 'we built', no link unless it genuinely answers the question.",
      "Most subreddits ban self-promotion outright. If the post would break the rules of the subreddit suggested, write something that does not.",
    ],
  },
  quora: {
    label: "Quora",
    limit: 4000,
    fold: 300,
    rules: [
      "Answer the actual question in the first two sentences. Do not build up to it.",
      "Establish why you would know this early, in one short clause, without boasting.",
      "Short paragraphs. Long blocks do not get read here either.",
      "Value first the whole way through. A product mention only where it genuinely helps, and never as the point.",
    ],
  },
  pinterest: {
    label: "Pinterest",
    limit: 500,
    fold: 500,
    rules: [
      "Pinterest is a search engine, so write the description for search: plain words a person would actually type.",
      "Front-load the useful keywords in the first sentence.",
      "Describe what the reader gets, not what the brand is.",
    ],
  },
  tiktok: {
    label: "TikTok",
    limit: 2200,
    fold: 100,
    rules: [
      "The caption is a hook, not a summary. Under about 100 characters is where it lands.",
      "First three words carry it.",
      "Two or three specific hashtags, never a wall.",
    ],
  },
};

// Rules that hold everywhere, and that the social side never had.
const UNIVERSAL = [
  "Every post opens on something concrete. A number, a moment, a claim. Never a definition and never a greeting.",
  "Specific beats clever. A real detail from this business will always outperform a polished generality.",
  "Vary sentence length. Short sentences carry weight.",
  "Close deliberately. The last line is what earns a reply, a save or a click, so never trail off and never end on a hashtag.",
  "No em-dashes, no emoji spam, no exclamation marks, and none of the AI tells (unlock, elevate, seamless, delve, leverage, game-changer, in today's world).",
  "Never claim anything the business has not actually said or done.",
];

/**
 * Build the craft block for the prompt.
 * @param {string[]} keys  which platforms this generation covers
 * @returns {string} a prompt section, or "" when no known platform is requested
 */
export function craftBlock(keys = []) {
  const picked = keys.map((k) => PLATFORMS[k]).filter(Boolean);
  if (!picked.length) return "";

  const perPlatform = keys
    .map((k) => {
      const p = PLATFORMS[k];
      if (!p) return null;
      const fold = p.fold < p.limit ? `, and only ~${p.fold} visible before the reader has to expand it` : "";
      return `${p.label} (max ${p.limit} characters${fold}):\n${p.rules.map((r) => `  - ${r}`).join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");

  return `
HOW TO WRITE FOR EACH PLACE. A post that ranks is not the same as a post that gets read.
These are the mechanics of each platform, not style preferences. Follow them exactly.

Everywhere:
${UNIVERSAL.map((r) => `  - ${r}`).join("\n")}

${perPlatform}
`;
}

export default craftBlock;
