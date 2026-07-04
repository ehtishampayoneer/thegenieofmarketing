// app/api/distribute/route.js
// G2 — Distribution Intelligence. Takes one article and produces channel-
// specific distribution actions. Honest framing is enforced in code:
//  - republish channels (Medium/LinkedIn/Dev.to) = amplify REACH (canonical
//    points back to the site); never described as authority backlinks.
//  - community channels (Reddit/Quora/forums) = Genie DRAFTS, human posts.
//    Never auto-posted (protects the user's accounts).

import { callAI, AllProvidersFailedError } from "@/lib/ai-router";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_PRIO = new Set(["high", "quick_win", "strategic", "low", "medium"]);
const COMMUNITY = new Set(["Reddit", "Quora", "Forum", "Community"]);

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid request." }, 400); }
  const { article, ai, host, scanId } = body || {};
  if (!article?.title) return json({ ok: false, error: "Missing article." }, 400);

  let plan = null;
  try {
    const result = await callAI({
      system:
        "You are Genie's Distribution Intelligence. You take one article and plan how to distribute it across channels to maximise REACH. Be scrupulously honest: republishing to Medium/LinkedIn/Dev.to with a canonical tag amplifies reach — it is NOT an authority backlink. Community channels (Reddit/Quora/forums) must be genuine, value-first, and are DRAFTED for the human to post themselves — never auto-posted. Only include channels that genuinely fit this business. Return ONLY valid JSON.",
      json: true,
      maxTokens: 3000,
      temperature: 0.7,
      prompt: buildPrompt(article, ai),
    });
    plan = result.json;
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      return json({ ok: false, retryable: true, message: "Genie is busy — try again in a moment." }, 503);
    }
    return json({ ok: false, error: "Couldn't plan distribution." }, 500);
  }

  const channels = Array.isArray(plan?.channels) ? plan.channels : [];
  if (channels.length === 0) return json({ ok: false, error: "No channels produced." }, 500);

  // Enforce honest framing + shape in code (don't trust the model alone).
  const normalized = channels.map((c) => {
    const isCommunity = COMMUNITY.has(c.channel) || c.kind === "community";
    return {
      channel: c.channel,
      kind: c.kind || (isCommunity ? "community" : "republish"),
      humanPost: isCommunity, // community is always human-posted
      framing: isCommunity
        ? "Genie drafts this for you to review and post yourself — never auto-posted (protects your account)."
        : (c.framing || "Republished with a canonical tag pointing to your site — amplifies reach, not an authority backlink."),
      suggestedTarget: c.suggestedTarget || null,
      adaptation: c.adaptation || null,
      draft: c.draft || null,
      priority: VALID_PRIO.has(c.priority) ? c.priority : "strategic",
    };
  });

  // Persist each channel as its own spine action (if signed in).
  let actionIds = [];
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const rows = normalized.map((c) => ({
        user_id: user.id,
        scan_id: scanId || null,
        type: "distribution",
        title: `${c.channel}: ${article.title}`,
        payload: { ...c, articleTitle: article.title },
        target: { channel: c.channel, host: host || null, humanPost: c.humanPost },
        priority: c.priority,
        status: "proposed",
      }));
      if (rows.length) {
        const { data: inserted } = await supabase.from("actions").insert(rows).select("id");
        actionIds = (inserted || []).map((r) => r.id);
      }
    }
  } catch {
    // best-effort persistence
  }

  return json({ ok: true, channels: normalized, actionIds });
}

function buildPrompt(article, ai) {
  return `Article to distribute:
Title: ${article.title}
Target keyword: ${article.targetKeyword || "(none)"}
Summary of body: ${String(article.body || "").slice(0, 800)}

Business: ${ai?.businessName || "(unknown)"} — ${ai?.industry || ""} ${ai?.subCategory ? "/ " + ai.subCategory : ""}
Target customer: ${ai?.targetCustomer || ""}

Plan the distribution. Return ONLY this JSON:
{
  "channels": [
    {
      "channel": "Medium",
      "kind": "republish",
      "priority": "quick_win",
      "framing": "one honest sentence — reach via canonical republish, not a backlink",
      "adaptation": "how to adapt it for this channel (1 sentence)"
    },
    {
      "channel": "LinkedIn Article",
      "kind": "republish",
      "priority": "quick_win",
      "framing": "...",
      "adaptation": "..."
    },
    {
      "channel": "Dev.to",
      "kind": "republish",
      "priority": "strategic",
      "framing": "...",
      "adaptation": "include ONLY if this is a technical/developer-relevant business, else omit"
    },
    {
      "channel": "Twitter/X thread",
      "kind": "thread",
      "priority": "quick_win",
      "framing": "a thread version for reach",
      "draft": ["tweet 1", "tweet 2", "tweet 3", "tweet 4"]
    },
    {
      "channel": "LinkedIn post",
      "kind": "crosspost",
      "priority": "quick_win",
      "framing": "a native summary post",
      "draft": "the LinkedIn post text"
    },
    {
      "channel": "Reddit",
      "kind": "community",
      "priority": "strategic",
      "suggestedTarget": "an actual relevant subreddit, e.g. r/...",
      "framing": "value-first, drafted for you to post",
      "draft": "a genuine, non-spammy post appropriate to that subreddit"
    },
    {
      "channel": "Quora",
      "kind": "community",
      "priority": "strategic",
      "suggestedTarget": "a relevant question to answer",
      "framing": "a helpful answer, drafted for you to post",
      "draft": "the answer text, linking back only where it genuinely helps"
    }
  ]
}
Only include channels that genuinely fit this business. For community channels, drafts must be authentic and value-first, not promotional.`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
