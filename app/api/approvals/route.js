// app/api/approvals/route.js
// ── THE UNIFIED APPROVAL QUEUE (aggregation) ──
// One queue for everything that needs the user: proposed actions (articles,
// social, outreach, SEO fixes) + ready placements (community replies, buyer-intent
// moves). Cadence-ordered: your OWNED accounts first (auto-publishable), then
// community taps, ranked by impact/intent. The single contract the Approval
// surface reads. Best-effort; unauth → ok:false so the UI falls back to demo.

import { createClient } from "@/lib/supabase/server";
import { recoverStuckActions } from "@/lib/stuck";
import { toOutcome } from "@/lib/outcomes";
import { MEDIA_TYPE, isPendingPitch, pitchToApproval } from "@/lib/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
      .eq("user_id", user.id).in("status", ["proposed", "needs_review", "failed"]).neq("type", "media_outreach").neq("type", "foundation").neq("type", "recovery").neq("type", "local_services").neq("type", "sprint").limit(50);
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

  // Owned (auto-publishable) first, then by impact/intent.
  items.sort((a, b) => Number(b.owned) - Number(a.owned) || b.impact - a.impact);

  const ownedCount = items.filter((i) => i.owned).length;
  return json({ ok: true, live: true, count: items.length, ownedCount, items });
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
    draft, why: p.rationale || null, target_url,
    keyword: p.targetKeyword || null,
    relatedKeywords: Array.isArray(p.relatedKeywords) ? p.relatedKeywords : [],
    market: p.market || a.target?.market || null,
    marketName: p.marketName || null,
    marketFlag: p.marketFlag || null,
    impact: clampNum(p.impact, priorityScore(a.priority)),
    tags: tagsFor(a.priority),
    crowd: p.crowd || null,
  };
}

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
    brand: p.platform,
    title: p.target_title || p.platform,
    outcome: meta.buyer_intent ? `Reach a ${stage || "buyer"} who’s deciding now` : "Show up where your customers are",
    draft: p.draft || "", why: meta.reason || null, target_url: p.target_url || null,
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
