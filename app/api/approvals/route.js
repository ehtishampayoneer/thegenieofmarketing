// app/api/approvals/route.js
// ── THE UNIFIED APPROVAL QUEUE (aggregation) ──
// One queue for everything that needs the user: proposed actions (articles,
// social, outreach, SEO fixes) + ready placements (community replies, buyer-intent
// moves). Cadence-ordered: your OWNED accounts first (auto-publishable), then
// community taps, ranked by impact/intent. The single contract the Approval
// surface reads. Best-effort; unauth → ok:false so the UI falls back to demo.
//
// ── IT SERVES THREE ──
// The nightly engine can stage forty items in a night: fifteen cold emails, a
// handful of community replies, an article, a hub page, a refresh, listings, a
// pitch. Every one of them is worth doing and the pile is unusable — a beginner
// opens it, cannot tell which of the forty matters, and closes the app. Genie's
// promise is three minutes a morning, and forty cards is not three minutes.
//
// So the queue serves the best three and says how many are behind them. Nothing
// is hidden or thrown away: ?all=1 returns the lot for an owner who wants to keep
// going. What is capped is what you are ASKED to do, not what you are allowed to.
//
// The ranking is not new and not arbitrary. Every item already carries an impact
// score out of 100 — a hot buyer-intent thread scores in the nineties, a
// low-traffic directory listing in the twenties — and this queue already sorted
// by it. The cap simply stops showing the tail.

import { pinpoint } from "@/lib/pinpoint";
import { createClient } from "@/lib/supabase/server";
import { recoverStuckActions } from "@/lib/stuck";
import { toOutcome } from "@/lib/outcomes";
import { MEDIA_TYPE, isPendingPitch, pitchToApproval } from "@/lib/media-store";
import { ownerSignal, penaltyFor } from "@/lib/owner-signal";
import { countWaiting, DAILY_CARDS } from "@/lib/queue-count";
import { TIERS } from "@/lib/market-plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export { DAILY_CARDS };

export async function GET(request) {
  const showAll = new URL(request.url).searchParams.get("all") === "1";
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  const items = [];

  // Work that stopped halfway is put back before the list is built, so a
  // publish that died mid-flight reappears here instead of vanishing.
  try { await recoverStuckActions(supabase, { userId: user.id }); } catch {}

  try {
    const { data: actions } = await supabase
      .from("actions").select("id, type, title, priority, payload, target, status, result")
      // needs_review as well as proposed. The publish guard sets needs_review
      // when it blocks something at approval time, and nothing anywhere listed
      // those — so Genie wrote an article, held it to protect the brand, and
      // then hid it from the only person who could fix it. The owner saw a
      // toast once, navigated away, and the article was gone for good while
      // Today still told them to approve their first one.
      .eq("user_id", user.id).in("status", ["proposed", "needs_review", "failed"]).neq("type", "media_outreach").neq("type", "foundation").neq("type", "recovery").neq("type", "local_services").neq("type", "sprint")
      // ── FIFTY OF THEM, CHOSEN BY NOBODY ──
      // This was `.limit(50)` with no `.order()`, so Postgres returned whichever
      // fifty it felt like. countWaiting counts the queue exactly, so the screen
      // could honestly say "62 waiting" while `?all=1` was structurally incapable
      // of ever showing twelve of them — and expireStaleDrafts retires unreachable
      // drafts at fourteen days. Newest first, and asking for everything now
      // actually means everything.
      .order("created_at", { ascending: false })
      .limit(showAll ? 250 : 50);
    for (const a of actions || []) items.push(normalizeAction(a));
  } catch {}

  // Get featured pitches waiting to be sent, newest first, so the day's list is
  // one list. They live on as the same rows the Get featured page shows.
  try {
    const { data: pitches } = await supabase
      .from("actions").select("id, payload, created_at")
      .eq("user_id", user.id).eq("type", MEDIA_TYPE).order("created_at", { ascending: false }).limit(60);
    for (const a of (pitches || []).filter(isPendingPitch).slice(0, 20)) items.push(pitchToApproval(a));
  } catch {}

  try {
    const { data: placements } = await supabase
      .from("placements").select("*").eq("user_id", user.id).eq("status", "ready").limit(50);
    for (const p of placements || []) items.push(normalizePlacement(p));
  } catch {}

  // ── WHAT THE OWNER KEEPS SKIPPING GOES LAST ──
  // Three cards a day means the ranking decides what the owner ever sees. A kind
  // of work they have skipped three times should not keep winning one of those
  // three slots. It is a multiplier, not a filter: the item is still in the
  // backlog and ?all=1 still shows it, because refusing to show an owner their
  // own work is how things disappear.
  // -- EVERY CARD SAYS WHICH COUNTRY IT IS FOR, AND HOW HARD THAT COUNTRY IS --
  // This screen already had a row of country tabs and almost nothing to put in
  // them: the fields were read off the payload and nothing ever wrote them. Drafts
  // now carry the market they were made for, so the day can be grouped the way the
  // plan actually works: three colours, the countries inside them, the tasks
  // inside those. A colour is Market Testing's own verdict on how hard a country
  // is, never a new opinion invented on this screen.
  const { iso2Of, resolveMarket } = await import("@/lib/geo-targets");
  const { flagEmoji } = await import("@/lib/markets");
  let planMarkets = [];
  try {
    const { storedStrategy } = await import("@/lib/strategy-store");
    const { normalizeStrategy } = await import("@/lib/strategy");
    const { tierFor } = await import("@/lib/market-plan");
    const raw = await storedStrategy(supabase, user.id);
    const plan = raw ? normalizeStrategy(raw) : null;
    const rows = plan ? (plan.marketData?.length ? plan.marketData : plan.markets || []) : [];
    planMarkets = rows.map((r) => {
      const m = typeof r === "string" ? { name: r } : r || {};
      const t = tierFor(m);
      const g = resolveMarket(m.name);
      return {
        // The filter key is the country, not the spelling. A market test tags its
        // tasks with the three-letter code ("are"); the plan names the country
        // ("United Arab Emirates"). Keyed on either, they are two countries.
        name: m.name, code: (g.iso2 || String(m.name || "")).toLowerCase(), iso2: g.iso2,
        flag: g.iso2 ? flagEmoji(g.iso2) : "🌍",
        tier: t.id, tierLabel: t.label, why: t.why,
        score: Number.isFinite(Number(m.score)) ? Number(m.score) : null,
        verified: !!m.verified,
      };
    }).filter((m) => m.name);
  } catch {}

  // ── ONE COUNTRY, HOWEVER IT WAS SPELLED ──
  // A market test writes `market: "are"` onto its tasks (app/api/markets/route.js)
  // and the plan writes "United Arab Emirates". Matching on the string turned every
  // market-test card into an unknown country and threw away the flag and name the
  // test had already put on it. Both resolve to AE, so that is what they are keyed on.
  const byIso = new Map(planMarkets.filter((m) => m.iso2).map((m) => [m.iso2, m]));
  for (const i of items) {
    const raw = i.market || i.marketName || null;
    const iso = raw ? iso2Of(raw) : null;
    const mk = iso ? byIso.get(iso) : null;
    if (mk) {
      i.market = mk.code; i.marketName = mk.name; i.marketFlag = mk.flag;
      i.marketTier = mk.tier; i.marketTierLabel = mk.tierLabel;
    } else if (raw) {
      // A country the owner is testing by hand, or one the plan has since dropped.
      // Shown with its own name and flag, and not dressed up as one of the three
      // colours Market Testing never ranked it into.
      const g = iso ? resolveMarket(iso) : null;
      i.marketName = i.marketName || g?.name || String(raw);
      i.marketFlag = i.marketFlag || (iso ? flagEmoji(iso) : "🌍");
      i.market = String(iso || raw).toLowerCase();
      i.marketTier = "other"; i.marketTierLabel = "A country you are testing";
    } else {
      i.marketTier = "other"; i.marketTierLabel = "Every country";
    }
  }

  // ── THE LAST PLACE A BLANK CAN BE CAUGHT ──
  // Drafts are cleaned when they are written, and email is cleaned again when it
  // is sent. Neither reaches a draft written BEFORE those fixes existed, and
  // neither reaches "Copy & open", which puts the raw text on the owner's
  // clipboard for a contact form or a composer. A media pitch two days old still
  // signed off "Best regards, [Your Name]" on this screen, and pasting it would
  // have sent the brackets to a stranger. Every draft passes through here on its
  // way to the screen AND the clipboard, whatever engine wrote it and whenever.
  try {
    const { fillBlanks } = await import("@/lib/fill-blanks");
    let prof = {};
    try {
      const { data } = await supabase.from("profiles").select("sender_name, company_name").eq("id", user.id).maybeSingle();
      prof = data || {};
    } catch {}
    const sender = prof.sender_name || prof.company_name || null;
    const company = prof.company_name || prof.sender_name || null;
    const clean = (text, i) => (typeof text === "string" && text
      ? fillBlanks(text, {
          recipientName: i.pitch?.name || i.toName || null,
          recipientCompany: i.pitch?.company || i.company || null,
          senderName: sender, companyName: company,
        }).text
      : text);
    for (const i of items) {
      i.draft = clean(i.draft, i);
      if (i.subject) i.subject = clean(i.subject, i);
      if (i.pitch?.subject) i.pitch.subject = clean(i.pitch.subject, i);
    }
  } catch {}

  const signal = await ownerSignal(supabase, user.id);
  for (const i of items) {
    const mult = penaltyFor(signal, i.kind, i.platform);
    if (mult < 1) { i.impact = Math.round(i.impact * mult); i.deprioritized = true; }
  }

  // ── THE CHANNEL THAT PRODUCES REPLIES GOES FIRST ──
  // Sorting by impact alone buried the whole business. A social post is filed as
  // "high" and scores 92; a cold email is filed "medium" and scores 66. So every
  // post Genie wrote outranked every email it wrote, and on a real account the
  // emails sat seventy places down a queue that shows three — a copy-and-paste
  // LinkedIn draft beating the one channel that can produce a reply this week.
  //
  // Priority describes how good a piece is. It says nothing about which KIND of
  // work is worth the owner's three minutes, and that is a decision the plan
  // already made: cold email is the primary channel. So the kind is ranked first
  // and the score decides within it.
  const KIND_RANK = { article: 0, outreach_email: 1, media_pitch: 2 };
  const kindRank = (i) => KIND_RANK[i.kind] ?? (i.source === "placement" ? 3 : 4);
  const order = (a, b) =>
    Number(b.owned) - Number(a.owned) ||
    kindRank(a) - kindRank(b) ||
    b.impact - a.impact;
  items.sort(order);

  // ── THE DAY'S EMAILS ARE ONE DECISION, NOT FIVE CARDS ──
  // Three cards a day is the right number of DECISIONS. It was the wrong number of
  // EMAILS, and nobody noticed the difference. An article sorts above everything,
  // so a normal morning showed one article and two of whatever came next — about
  // two emails a day, against a sending allowance deliberately built for five
  // rising to thirty-five. Eight times fewer than the product was designed to send,
  // and the arithmetic of cold email is unforgiving about that: sixty emails a
  // month is under three replies, where five hundred is five to twenty-five.
  //
  // So the emails travel together. One card, every email readable and editable
  // inside it, approved one by one or all at once. The owner still makes three
  // decisions; one of them is now worth five emails instead of one.
  //
  // ONE CARD PER COUNTRY, NOT ONE CARD FOR THE WORLD. A single batch was right
  // while there was one market and wrong the moment the plan had three: Malaysia's
  // five, India's three and America's four are three decisions about three
  // different places, and merging them into "twelve emails to twelve companies"
  // throws away the one fact that tells an owner which of the three is working.
  const emails = items.filter((i) => i.kind === "outreach_email");
  let batched = items;
  if (!showAll && emails.length > 1) {
    const rest = items.filter((i) => i.kind !== "outreach_email");
    const groups = new Map();
    for (const e of emails) {
      const key = e.market || "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const cards = [];
    for (const group of groups.values()) {
      if (group.length === 1) { cards.push(group[0]); continue; }
      const lead = group[0];
      const where = lead.marketName ? ` in ${lead.marketName}` : "";
      cards.push({
        ...lead,
        id: `batch:${lead.id}`,
        batch: group.map((e) => ({ id: e.id, source: e.source, title: e.title, draft: e.draft, outcome: e.outcome, why: e.why })),
        title: `${group.length} emails to ${group.length} companies${where}`,
        outcome: `Reach ${group.length} businesses that match your plan${where}`,
        // The batch inherits the best impact in it, so a strong lead is not buried
        // by averaging it with the rest.
        impact: Math.max(...group.map((e) => e.impact || 0)),
      });
    }
    batched = [...rest, ...cards].sort(order);
  }

  const ownedCount = batched.filter((i) => i.owned).length;
  // THREE DECISIONS, BUT NEVER THREE COUNTRIES OUT OF FOUR. The cap keeps a
  // morning to three minutes, and counting a country's whole day of emails as one
  // card is what makes that possible. Slicing the list at three then quietly
  // dropped two of the three countries the plan had chosen to work: the emails
  // were written, allowed to send, and never shown to anyone. So each country's
  // email card survives the cap, and the cap applies to everything else.
  const emailCards = batched.filter((i) => i.kind === "outreach_email");
  const focusCards = [...batched.filter((i) => i.kind !== "outreach_email").slice(0, DAILY_CARDS), ...emailCards];

  // -- EVERY SECTION'S WORK, IN THE ONE PLACE THE OWNER LOOKS --
  // This used to return only the best three and hold everything else back.
  // Buyer Hunt, Reddit, Quora and forum finds all reached the queue — and all
  // ranked behind articles, emails and pitches, so they sat in "72 lined up
  // behind them" and were never seen. The owner concluded those sections were
  // not producing anything, and went looking on each section's own page, which
  // is the opposite of what this page is for.
  //
  // Now everything waiting comes back, each item says which section made it,
  // and the best few are MARKED as today's focus rather than being the only
  // things sent. The morning can still take three minutes; nothing is out of
  // reach behind it.
  const focusIds = new Set(focusCards.map((i) => i.id));
  for (const i of batched) {
    i.section = sectionOf(i);
    i.focus = focusIds.has(i.id);
  }
  const shown = [...batched].sort((a, b) => Number(b.focus) - Number(a.focus) || order(a, b));
  const sections = {};
  for (const i of shown) sections[i.section] = (sections[i.section] || 0) + (i.batch?.length || 1);
  // The true size of the queue, counted rather than measured off a list three
  // `.limit()` calls have already trimmed — and counted by the SAME function the
  // menu badge uses, so the two can never again show different numbers for the
  // same thing on the same screen.
  const waiting = await countWaiting(supabase, user.id);
  const total = Math.max(waiting, items.length);
  // Waiting beyond today's focus, counted in items rather than cards.
  const backlog = Math.max(0, total - focusCards.reduce((n, i) => n + (i.batch?.length || 1), 0));
  return json({
    ok: true, live: true,
    // `count` stays the size of the whole queue: the screen says "3 for you today,
    // 12 waiting", and a number that quietly meant something else is the bug this
    // codebase keeps having.
    count: total, ownedCount, backlog, showingAll: showAll, perDay: DAILY_CARDS,
    focusCount: focusCards.length, sections,
    // The plan's countries and how hard each is, so the screen can show a colour
    // with nothing under it yet rather than pretending that country is not live.
    markets: planMarkets, tiers: TIERS.map((t) => ({ id: t.id, label: t.label, why: t.why })),
    items: shown,
  });
}

// Which of the app's sections made this — named as the owner knows them from the
// menu, so a tab here means the same thing as the page it came from.
function sectionOf(i) {
  const kind = String(i.kind || "");
  const platform = String(i.platform || "").toLowerCase();
  if (kind === "outreach_email") return "emails";
  if (kind === "article") return i.fromAiSearch ? "ai_search" : "articles";
  if (kind === "media_pitch") return "featured";
  if (kind === "directory_submission") return "listings";
  if (i.source === "placement") return i.buyerIntent ? "buyers" : "communities";
  if (/reddit|quora|forum/.test(platform) || kind === "community_engagement") return "communities";
  if (kind === "social_post" || kind === "distribution" || /x|twitter|linkedin|pinterest|insta|gbp|review_request|medium/.test(platform)) return "social";
  return "other";
}

function normalizeAction(a) {
  const p = a.payload || {};
  const platform = String(p.platform || a.target?.channel || p.channel || "").toLowerCase();
  const isX = /\b(x|twitter)\b/.test(platform);
  const isPin = platform === "pinterest";
  const isGbp = platform === "gbp";
  const isReview = platform === "review_request";
  const isReddit = platform === "reddit";
  const isQuora = platform === "quora";
  const o = toOutcome(a);
  // Genie tested this against its own simulated crowd and the gatekeeper — the
  // spam filter for an email, the moderator for a community post — said it would
  // not get through.
  const crowdBlocked = !!p.crowd?.gate?.blocked;
  const draft = p.body || p.text || (Array.isArray(p.draft) ? p.draft.join("\n\n") : p.draft) || "";
  // ── REPUTATION SAFETY ──
  // Only content on YOUR OWN site (article → WordPress) auto-publishes via API.
  // Social platforms (X, etc.) are draft-and-you-post: we open the platform's own
  // composer with your text ready and YOU tap post. Automated API posting to
  // social is what gets accounts flagged/suspended — we never do it by default.
  const owned = a.type === "article";
  // Executable = approving it makes something happen in the real world, so the
  // queue calls /api/actions/[id]/execute rather than only marking it approved.
  // An outreach_email is one: it was written and held, and approving IS the send.
  const executable = a.type === "article"
    || (a.type === "outreach_email" && !!a.payload?.to && !!a.payload?.subject);
  // Pinterest's pin-create URL prefills the image (media), destination link and
  // description — the owner just picks a board and saves. No auto-post, no OAuth.
  const target_url = isX
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(String(draft).slice(0, 270))}`
    : isPin
      ? `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(p.dest || "")}&media=${encodeURIComponent(p.image || "")}&description=${encodeURIComponent(String(p.text || "").slice(0, 480))}`
      : isGbp
        ? "https://business.google.com/posts"
        : isReview
          ? "https://business.google.com/reviews"
          : isReddit
            ? `https://www.reddit.com/submit?title=${encodeURIComponent(String(p.targetKeyword || String(draft).replace(/^\[r\/[^\]]+\]\s*/i, "").split("\n")[0] || "").slice(0, 290))}&text=${encodeURIComponent(String(draft).replace(/^\[r\/[^\]]+\]\s*/i, "").slice(0, 1200))}`
            : isQuora
              ? "https://www.quora.com/"
              : (p.url || null);
  return {
    id: a.id, source: "action", kind: a.type, platform, owned, executable,
    // Held back by the publish guard, and why. Without the reasons the owner
    // can only guess at what to change.
    held: a.status === "needs_review",
    // A publish that errored. The owner saw a toast at the time and then the
    // row left the queue, so a failed article was as gone as a blocked one.
    failed: a.status === "failed",
    failedReason: a.status === "failed" ? (a.result?.error || null) : null,
    heldReasons: a.status === "needs_review" ? (a.result?.reasons || []).slice(0, 4) : null,
    heldClaims: a.status === "needs_review" ? (a.result?.claims || []).slice(0, 4) : null,
    brand: brandFor(a.type, p, platform),
    title: o.title || a.title || labelFor(a.type),
    outcome: o.value || "",
    image: p.heroImage || p.image || null,
    images: Array.isArray(p.images) ? p.images : null,
    isCarousel: !!p.carousel,
    imageRaw: p.imageRaw || null,
    imageAlt: p.heroImageAlt || p.imageAlt || null,
    imageSource: p.imageSource || null,
    imageCredit: p.imageCredit || null,
    imageBranded: !!p.branded,
    imageFocus: Number.isFinite(Number(p.imageFocus)) ? Number(p.imageFocus) : 50,
    cardHeadline: p.cardHeadline || null,
    isRefresh: !!p.refresh,
    draft,
    why: crowdBlocked
      ? `Genie's own test says ${p.crowd?.gate?.name || "the gatekeeper"} would block this${Number.isFinite(Number(p.crowd?.score)) ? ` (it scored ${Math.round(Number(p.crowd.score))}/100)` : ""} — edit it before you approve.`
      : (p.rationale || null),
    target_url,
    keyword: p.targetKeyword || null,
    fromAiSearch: !!p.fromAiSearch,
    relatedKeywords: Array.isArray(p.relatedKeywords) ? p.relatedKeywords : [],
    market: p.market || a.target?.market || null,
    marketName: p.marketName || null,
    marketFlag: p.marketFlag || null,
    // ── GENIE'S OWN TEST SAID THIS WOULD BE BLOCKED ──
    // The swarm runs a spam-filter gate over every draft and the card already
    // prints "would likely block this". Nothing acted on it: the same card was
    // offered as Ready, at a Medium impact score of 66, ahead of clean work — for
    // a draft its own test had scored 21 out of 100. Sending a cold email a spam
    // filter blocks costs the owner's sending reputation, which is the single
    // thing the whole daily ramp exists to protect.
    //
    // It is not hidden and not auto-discarded: the owner may know better than a
    // simulation. It stops claiming to be ready, and it stops outranking work
    // that is.
    needsEdit: crowdBlocked,
    impact: crowdBlocked ? Math.min(35, clampNum(p.impact, priorityScore(a.priority))) : clampNum(p.impact, priorityScore(a.priority)),
    tags: crowdBlocked ? [{ label: "Needs an edit", tone: "danger" }, ...tagsFor(a.priority)] : tagsFor(a.priority),
    crowd: p.crowd || null,
  };
}

// Reddit hides posts from new accounts, automatically and silently: the owner
// sees their comment, nobody else does. Said on every Reddit card because it is
// the difference between a reply that works and one that quietly never existed.
// This is how to become an account the filters trust, never how to get around
// them: extra accounts and bought "aged" accounts get the business banned.
const REDDIT_NOTE = "Reddit hides replies from new accounts automatically. Post from one account, answer helpfully in this community for a week or two before mentioning the business, and never add a link until you have standing there. To check a reply is visible, open it in a private window.";

function normalizePlacement(p) {
  const meta = p.meta || {};
  const owned = !!p.owned;
  const stage = meta.journey_stage ? String(meta.journey_stage).replace(/_/g, " ") : null;
  const tags = [
    meta.buyer_intent ? { label: "Buyer intent", tone: "dawn" } : { label: "Community", tone: "info" },
    stage ? { label: stage, tone: "neutral" } : null,
  ].filter(Boolean);
  return {
    id: p.id, source: "placement", kind: p.kind || "reply", platform: p.platform, owned, executable: false,
    buyerIntent: !!meta.buyer_intent,
    brand: p.platform,
    title: p.target_title || p.platform,
    outcome: meta.buyer_intent ? `Reach a ${stage || "buyer"} who’s deciding now` : "Show up where your customers are",
    // Opens on the buyer's own words, not the top of a long thread (lib/pinpoint.js).
    draft: p.draft || "",
    why: String(p.platform || "").toLowerCase() === "reddit"
      ? [meta.reason, REDDIT_NOTE].filter(Boolean).join(" ")
      : (meta.reason || null),
    target_url: pinpoint(p.target_url, meta.evidence, meta.snippet),
    keyword: p.keyword || null,
    relatedKeywords: [],
    impact: clampNum(meta.intent_score, 70),
    tags,
    crowd: meta.crowd || null,
  };
}

function brandFor(type, p, platform) {
  if (type === "article" || type === "seo_fix" || type === "distribution") return "blog";
  if (type === "outreach_email") return "mail";
  if (type === "ad_campaign") return "ads";
  if (platform === "gbp" || platform === "review_request" || platform.includes("business")) return "google";
  if (platform.includes("pinterest")) return "pinterest";
  if (platform.includes("linkedin")) return "linkedin";
  if (platform.includes("quora")) return "quora";
  if (platform.includes("reddit")) return "reddit";
  if (platform.includes("insta")) return "instagram";
  if (platform.includes("medium")) return "medium";
  if (platform.includes("x") || platform.includes("twitter")) return "x";
  if (type === "community_engagement") return "reddit";
  if (type === "social_post") return "x";
  return "default";
}
function labelFor(type) { return String(type || "action").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function priorityScore(p) { return { high: 92, quick_win: 80, strategic: 74, medium: 66, low: 50 }[p] ?? 66; }
function tagsFor(p) {
  if (p === "high") return [{ label: "High impact", tone: "dawn" }];
  if (p === "quick_win") return [{ label: "Quick win", tone: "live" }];
  if (p === "strategic") return [{ label: "Strategic", tone: "info" }];
  return [{ label: "Ready", tone: "neutral" }];
}
function clampNum(n, dflt) { const v = Number(n); return Number.isFinite(v) ? Math.round(v) : dflt; }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
