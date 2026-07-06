// lib/outcomes.js
// ── GENIE CONSTITUTION (non-negotiable — applies to every UI file) ──
// 1. Show ONE recommendation before showing lists
// 2. Outcome over action (users buy results, not tasks)
// 3. Every card answers: "What do I get if I approve this?"
// 4. Progressive disclosure — never overwhelm
// 5. One clear primary CTA per screen
// 6. Every click should feel like progress
// 7. Feels closer to ChatGPT / Duolingo / Linear than HubSpot / Semrush
// 8. If a page feels like a spreadsheet or CMS, redesign it
// 9. User should never need marketing knowledge to use Genie
// 10. Genie is an AI employee, not a reporting dashboard
//
// This file is the single source that turns a backend action into its
// user-facing OUTCOME. Titles = results, descriptions = value. Every number
// is a labeled ESTIMATE — we never print fabricated precision as fact.

const PRIO_TO_IMPACT = {
  high: { label: "High Impact", tone: "high" },
  quick_win: { label: "Quick Win", tone: "quick" },
  strategic: { label: "Strategic", tone: "strategic" },
  medium: { label: "Medium Impact", tone: "medium" },
  low: { label: "Low Impact", tone: "low" },
};

// Map each action type → outcome presentation.
export function toOutcome(action) {
  const p = action.payload || {};
  const type = action.type;
  const impact = PRIO_TO_IMPACT[action.priority] || PRIO_TO_IMPACT.medium;

  const base = { icon: "⚡", title: action.title || type, value: "", categories: [], impact, secs: 20 };

  switch (type) {
    case "article":
      return {
        ...base,
        icon: "📝",
        title: "Publish a blog article",
        value: "Attract more organic search visitors over time (estimated).",
        categories: ["SEO", "Traffic", "Content"],
      };
    case "social_post": {
      const plat = (p.platform || "Social").replace("/X", "");
      return {
        ...base,
        icon: platformIcon(p.platform),
        title: `Post to ${p.platform || "social"}`,
        value: "Reach your audience where they already scroll (estimated reach).",
        categories: [plat, "Reach", "Brand"],
        secs: 10,
      };
    }
    case "distribution":
      return {
        ...base,
        icon: "🌐",
        title: `Amplify reach on ${p.channel || "another channel"}`,
        value: p.humanPost
          ? "A ready-to-post draft to reach a new audience (you post it)."
          : "Republish for extra reach — canonical points back to your site (estimated).",
        categories: [p.channel || "Distribution", "Reach"],
      };
    case "seo_fix":
      return {
        ...base,
        icon: "🔧",
        title: "Fix an SEO issue on your site",
        value: "Help Google understand and rank your page better (estimated lift).",
        categories: ["SEO", "Technical"],
      };
    case "outreach_email":
      return {
        ...base,
        icon: "✉️",
        title: "Send outreach to earn a backlink",
        value: "A drafted email that could earn a real backlink (you send it).",
        categories: ["Backlinks", "Authority"],
        secs: 30,
      };
    case "directory_submission":
      return {
        ...base,
        icon: "📇",
        title: `Get listed on ${p.name || "a directory"}`,
        value: "More places customers can find you (you submit it).",
        categories: ["Visibility", "PR"],
      };
    case "community_engagement":
      return {
        ...base,
        icon: "💬",
        title: `Show up in ${p.name || "a community"}`,
        value: "A genuinely helpful post where your customers gather (you post it).",
        categories: [p.platform || "Community", "Brand"],
        secs: 30,
      };
    case "ad_campaign":
      return {
        ...base,
        icon: "📢",
        title: "Launch an ad campaign",
        value: "Reach new customers with paid ads (within your spend cap).",
        categories: ["Ads", "Traffic"],
      };
    default:
      return base;
  }
}

export function platformIcon(platform) {
  const p = String(platform || "").toLowerCase();
  if (p.includes("twitter") || p.includes("x")) return "⚫";
  if (p.includes("linkedin")) return "🔷";
  if (p.includes("instagram")) return "🟣";
  if (p.includes("facebook")) return "🔵";
  if (p.includes("reddit")) return "🟠";
  if (p.includes("quora")) return "🟥";
  if (p.includes("medium")) return "🟢";
  return "📣";
}

export const IMPACT_STYLES = {
  high: "bg-red-50 text-red-600 border-red-200",
  quick: "bg-emerald-50 text-emerald-700 border-emerald-200",
  strategic: "bg-indigo-50 text-indigo-700 border-indigo-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-ink-900/[0.04] text-ink-400 border-ink-900/[0.08]",
};

const PRIO_ORDER = { high: 0, quick_win: 1, strategic: 2, medium: 3, low: 4 };
export function sortByPriority(arr) {
  return [...arr].sort((a, b) => (PRIO_ORDER[a.priority] ?? 3) - (PRIO_ORDER[b.priority] ?? 3));
}
