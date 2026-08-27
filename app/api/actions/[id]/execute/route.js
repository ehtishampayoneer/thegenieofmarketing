// app/api/actions/[id]/execute/route.js
// F3a — THE EXECUTION LAYER, v1. The first place "Approve" becomes a real DO.
// Publishes an article action to the user's connected WordPress site.
//
// Safety gates checked IN ORDER before anything executes:
//   1. User owns the action (RLS)
//   2. Kill switch is OFF
//   3. Action type is executable (article) and not already done
//   4. WordPress is connected
// On success: action.result = { url, postId }, status → done, outcome logged.
// On failure: status → failed with the reason saved, outcome logged.

import { createClient } from "@/lib/supabase/server";
import { markdownToHtml } from "@/lib/markdown";
import { taggedLink } from "@/lib/attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);

  // Load the action (RLS guarantees ownership).
  const { data: action } = await supabase
    .from("actions")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!action) return json({ ok: false, error: "Action not found." }, 404);

  // GATE 1 — kill switch.
  const { data: safety } = await supabase
    .from("safety_settings")
    .select("kill_switch")
    .eq("user_id", user.id)
    .maybeSingle();
  if (safety?.kill_switch) {
    return json({ ok: false, error: "Kill switch is on — Genie won't execute anything until you turn it off in Settings." }, 403);
  }

  // GATE 2 — executable type & state.
  const p = action.payload || {};
  const platform = String(p.platform || action.target?.channel || "").toLowerCase();
  const isX = action.type === "social_post" && (platform.includes("twitter") || platform.includes("x"))
    || (action.type === "distribution" && String(p.channel || "").toLowerCase().includes("twitter"));
  const isArticle = action.type === "article";

  if (!isArticle && !isX) {
    return json({ ok: false, error: "That action type can't auto-publish yet. More channels are coming." }, 400);
  }
  if (action.status === "done") {
    return json({ ok: true, alreadyDone: true, result: action.result });
  }
  if (action.status === "dismissed" || action.status === "rolled_back") {
    return json({ ok: false, error: `This action was ${action.status.replace("_", " ")} — reopen it before publishing.` }, 400);
  }

  // GATE 2.5 — brand safety + fact-check. Never publish toxic content or high-risk
  // claims under the user's name, even when they approved it.
  const guardChannel = isX ? "x" : "blog";
  const guardText = isX
    ? (Array.isArray(p.draft) ? p.draft.join("\n\n") : (p.text || p.draft || p.body || ""))
    : (p.body || "");
  const { guardContent } = await import("@/lib/publish-guard");
  const guard = await guardContent(supabase, { userId: user.id, host: action.target?.host || null, channel: guardChannel, content: guardText, title: p.title || null, deep: true });
  if (guard.decision === "block") {
    await supabase.from("actions").update({ status: "needs_review", result: { blocked: true, reasons: guard.reasons, flags: guard.flags }, updated_at: new Date().toISOString() }).eq("id", action.id);
    try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "blocked", meta: { reasons: guard.reasons, flags: guard.flags, confidence: guard.confidence } }); } catch {}
    return json({ ok: false, blocked: true, error: "Genie held this back to protect your brand: " + (guard.reasons[0] || "risky content detected") + ". Edit and re-approve.", guard }, 422);
  }

  // ── REFRESH branch — re-optimized content republished IN PLACE (same URL) ──
  // Keeps the page's ranking equity instead of forking a duplicate. Targets the
  // hosted Genie Page it came from; re-pings indexing so the update is picked up.
  if (isArticle && p.refresh && p.refreshPageId) {
    const now = new Date().toISOString();
    await supabase.from("actions").update({ status: "executing", updated_at: now }).eq("id", action.id);
    try {
      const html = markdownToHtml(p.body || "");
      const { updateHostedPage } = await import("@/lib/pages");
      const page = await updateHostedPage(supabase, {
        pageId: p.refreshPageId, userId: user.id,
        title: p.title, bodyHtml: html, metaDescription: p.metaDescription || "",
        heroImage: p.heroImage, heroAlt: p.heroImageAlt || null,
        faq: Array.isArray(p.faq) ? p.faq : null,
      });
      const result = { url: page.url, pageId: page.id, publishedAt: now, channel: "genie_pages", refreshed: true };
      await supabase.from("actions").update({ status: "done", result, executed_at: now, updated_at: now }).eq("id", action.id);
      try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "executed", meta: result }); } catch {}
      try { const { pingIndexNow } = await import("@/lib/indexnow"); await pingIndexNow(page.url); } catch {}
      try { const { pingGoogleIndex } = await import("@/lib/google-index"); await pingGoogleIndex(supabase, user.id, page.url); } catch {}
      return json({ ok: true, result, refreshed: true });
    } catch (e) {
      const reason = String(e?.message || "Refresh failed").slice(0, 300);
      await supabase.from("actions").update({ status: "failed", result: { error: reason }, updated_at: now }).eq("id", action.id);
      return json({ ok: false, error: "Refresh failed: " + reason }, 502);
    }
  }

  // ── X / Twitter branch: real auto-post to the user's own account ──
  if (isX) {
    const { postToX } = await import("@/lib/x");
    // A tweet, or a thread (distribution draft may be an array).
    const content = Array.isArray(p.draft) ? p.draft : (p.text || p.draft || p.body || "");
    if (!content || (Array.isArray(content) && content.length === 0)) {
      return json({ ok: false, error: "Nothing to post." }, 400);
    }
    await supabase.from("actions").update({ status: "executing", updated_at: new Date().toISOString() }).eq("id", action.id);
    const r = await postToX(supabase, user.id, content);
    if (!r.ok) {
      await supabase.from("actions").update({ status: "failed", result: { error: r.error }, updated_at: new Date().toISOString() }).eq("id", action.id);
      try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "failed", meta: { error: r.error } }); } catch {}
      const needsConn = /not connected/i.test(r.error || "");
      return json({ ok: false, needsConnection: needsConn, error: r.error }, needsConn ? 400 : 502);
    }
    const result = { url: r.url, tweetId: r.id, publishedAt: new Date().toISOString(), channel: "x" };
    await supabase.from("actions").update({ status: "done", result, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", action.id);
    try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "executed", meta: result }); } catch {}
    return json({ ok: true, result });
  }

  // Build the post HTML once (whichever channel ends up publishing it).
  const html = markdownToHtml(p.body || "");

  // Ensure a hero image (best-effort, generated once so whichever channel publishes
  // uses it). If no image provider is configured, this stays null and the article
  // publishes text-only — exactly as before, nothing breaks.
  let heroImage = p.heroImage || null;
  if (!heroImage && p.imagePrompt) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { generateHeroImage } = await import("@/lib/images");
      heroImage = await generateHeroImage(createAdminClient(), user.id, p.imagePrompt);
    } catch {}
  }

  // Which channel? The owner's own WordPress if connected (best — publishes to
  // THEIR domain); otherwise Genie Pages (hosted) so the article goes LIVE for
  // everyone, not just the WordPress minority. This is what makes "Approve"
  // reliably become a real, public URL.
  const { data: wp } = await supabase
    .from("connections")
    .select("access_token, meta")
    .eq("user_id", user.id)
    .eq("provider", "wordpress")
    .maybeSingle();
  const hasWP = !!(wp?.meta?.siteUrl && wp?.access_token);

  // Mark executing (both paths).
  await supabase.from("actions").update({ status: "executing", updated_at: new Date().toISOString() }).eq("id", action.id);

  // ── HOSTED FALLBACK — Genie Pages (no WordPress needed) ──
  if (!hasWP) {
    try {
      const host = action.target?.host || null;
      const { publishHostedPage } = await import("@/lib/pages");
      const page = await publishHostedPage(supabase, {
        userId: user.id, host, actionId: action.id,
        title: p.title || action.title || "Untitled",
        bodyHtml: html,
        metaDescription: p.metaDescription || "",
        heroImage, heroAlt: p.heroImageAlt || null,
        targetKeyword: p.targetKeyword || null,
        businessName: await businessNameFor(supabase, user.id, host),
        // Tag the CTA back to this action so a resulting sale traces to the keyword
        // (utm_content = action id → keyword_usage → the Learning Loop's money signal).
        businessUrl: host ? taggedLink(`https://${host}`, { channel: "genie_pages", campaign: "genie", ref: action.id }) : null,
        slug: p.slug || null,
        faq: Array.isArray(p.faq) ? p.faq : null,
      });
      const result = { url: page.url, pageId: page.id, publishedAt: new Date().toISOString(), channel: "genie_pages", hosted: true };
      await supabase.from("actions").update({ status: "done", result, executed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", action.id);
      try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "executed", meta: result }); } catch {}
      // Instant-index it (free) so Bing/Yandex — and the engines AI search reads —
      // pick it up in hours, not weeks. No-op if INDEXNOW_KEY isn't set.
      try { const { pingIndexNow } = await import("@/lib/indexnow"); await pingIndexNow(page.url); } catch {}
      // Nudge Google to crawl it now (via the owner's Google connection + indexing scope).
      try { const { pingGoogleIndex } = await import("@/lib/google-index"); await pingGoogleIndex(supabase, user.id, page.url); } catch {}
      // Internal-link acceleration: point 2-3 older related Genie pages at this new one,
      // then re-index THOSE so Google follows the fresh links and finds this page fast.
      try {
        const { accelerateInternalLinks } = await import("@/lib/interlink");
        const accel = await accelerateInternalLinks(supabase, {
          userId: user.id, host,
          newPage: { id: page.id, handle: page.handle, slug: page.slug, title: p.title || action.title, keyword: p.targetKeyword || null },
        });
        for (const l of accel.linked) {
          try { const { pingIndexNow } = await import("@/lib/indexnow"); await pingIndexNow(l.url); } catch {}
          try { const { pingGoogleIndex } = await import("@/lib/google-index"); await pingGoogleIndex(supabase, user.id, l.url); } catch {}
        }
        if (accel.linked.length) {
          result.accelerated = accel.linked.length;
          const n = accel.linked.length;
          try {
            const { logActivity } = await import("@/lib/activity");
            await logActivity(supabase, user.id, {
              host, verb: "published", icon: "🔗",
              message: `Linked ${n} older ${n === 1 ? "page" : "pages"} to “${p.title || action.title}” to speed up its indexing`,
              detail: "Internal-link acceleration — Google recrawls trusted pages fast, so the new page gets found in days, not weeks.",
              meta: { accelerated: n, newUrl: result.url },
            });
          } catch {}
        }
      } catch {}
      return json({ ok: true, result, hosted: true });
    } catch (e) {
      const reason = String(e?.message || "Hosted publish failed").slice(0, 300);
      await supabase.from("actions").update({ status: "failed", result: { error: reason }, updated_at: new Date().toISOString() }).eq("id", action.id);
      try { await supabase.from("action_outcomes").insert({ action_id: action.id, user_id: user.id, event: "failed", meta: { reason } }); } catch {}
      return json({ ok: false, error: "Publishing failed: " + reason }, 502);
    }
  }

  // ── WORDPRESS — the owner's own domain ──
  const auth = "Basic " + Buffer.from(`${wp.meta.username}:${wp.access_token}`).toString("base64");

  // Auto-append the Google Preferred Sources button (domain-level q=) so every article
  // Genie publishes to the owner's OWN site helps readers make them a preferred Google
  // source — more Top Stories + AI-Overview visibility, with zero manual setup. Plain
  // <a> so WordPress won't strip it.
  const wpHost = (() => { try { return new URL(wp.meta.siteUrl).hostname.replace(/^www\./, ""); } catch { return null; } })();
  const bodyHtml = heroImage ? `<figure><img src="${heroImage}" alt="${escapeAttr(p.heroImageAlt || p.title || "")}" /></figure>\n${html}` : html;
  const content = wpHost ? `${bodyHtml}\n${preferredSourceBadge(wpHost)}` : bodyHtml;

  let published;
  try {
    const res = await fetch(`${wp.meta.siteUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: p.title || action.title || "Untitled",
        content,
        status: "publish",
        excerpt: p.metaDescription || "",
        slug: p.slug || undefined,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`WordPress returned ${res.status}: ${detail}`);
    }
    published = await res.json();
  } catch (e) {
    const reason = String(e?.message || "Publish failed").slice(0, 300);
    await supabase.from("actions").update({
      status: "failed",
      result: { error: reason },
      updated_at: new Date().toISOString(),
    }).eq("id", action.id);
    try {
      await supabase.from("action_outcomes").insert({
        action_id: action.id, user_id: user.id, event: "failed", meta: { reason },
      });
    } catch {}
    return json({ ok: false, error: "Publishing failed: " + reason }, 502);
  }

  // Success — save the real result.
  const result = {
    url: published.link || null,
    postId: published.id || null,
    publishedAt: new Date().toISOString(),
    channel: "wordpress",
  };
  await supabase.from("actions").update({
    status: "done",
    result,
    executed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", action.id);
  try {
    await supabase.from("action_outcomes").insert({
      action_id: action.id, user_id: user.id, event: "executed", meta: result,
    });
  } catch {}

  // Nudge fast (re)crawl of the published post on the owner's own domain.
  if (result.url) {
    try { const { pingIndexNow } = await import("@/lib/indexnow"); await pingIndexNow(result.url); } catch {}
    try { const { pingGoogleIndex } = await import("@/lib/google-index"); await pingGoogleIndex(supabase, user.id, result.url); } catch {}
  }

  return json({ ok: true, result });
}

// Best-effort friendly business name for the hosted page's byline (falls back to
// the host inside publishHostedPage when null).
async function businessNameFor(supabase, userId, host) {
  if (!host) return null;
  try {
    const { data } = await supabase.from("scans").select("ai, final_url, url")
      .eq("user_id", userId).ilike("final_url", `%${host}%`)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data?.ai?.businessName || null;
  } catch { return null; }
}

function escapeAttr(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Google Preferred Sources button as plain HTML (survives WordPress sanitization).
function preferredSourceBadge(host) {
  const q = encodeURIComponent(host);
  return `<p style="text-align:center;margin:30px 0"><a href="https://www.google.com/preferences/source?q=${q}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 18px;border:1px solid #dadce0;border-radius:999px;background:#fff;color:#3c4043;font-weight:600;font-size:14px;text-decoration:none">★ Add us to your Google preferred sources</a></p>`;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
