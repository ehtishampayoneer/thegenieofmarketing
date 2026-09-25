// app/api/worklog/route.js
// ── EVERYTHING GENIE DID, WITH A LINK TO EACH OF IT ──
//
// Results take weeks. Nobody waits weeks for something they cannot see working.
// Proof of WORK, though, is available on day two: three emails went to these
// three named companies, here is your article, live, at this address.
//
// The bug this exists to fix: a published article's real URL appeared in exactly
// one place — a temporary list on the Approvals screen that held six items and
// emptied on refresh. After that the owner had an article on the internet and no
// way to find it. Everything below was already being recorded and none of it was
// being shown.
//
// THREE RULES THIS ROUTE KEEPS.
//
//  1. Every line links to the real thing. Their article on their domain, the
//     Reddit thread, the Gmail thread. The point is not that Genie says it
//     happened — it is that they can go and check somewhere Genie does not own.
//     That is worth more than any dashboard, and it is already true of every
//     action Genie takes: email leaves from their own Gmail, articles publish to
//     their own site, community posts are ones they pressed post on themselves.
//
//  2. Every number carries one line of plain English. "12 visits" frightens a
//     beginner who does not know that a new article takes months. "12 visits —
//     normal for a new article, these grow over three to six months" does not.
//
//  3. What is coming names only what GENIE will do, never what a stranger will
//     do. "Genie sends 15 more emails and follows up with everyone silent" is a
//     promise it keeps entirely on its own. "You'll start getting replies" is a
//     promise about other people's behaviour, and this product already decided,
//     deliberately, to stop making those.

import { createClient } from "@/lib/supabase/server";
import { pageUrl } from "@/lib/pages";
import { getEvents } from "@/lib/events";
import { hostOf } from "@/lib/business";
import { effectiveDailyCap } from "@/lib/sending-ramp";
import { repliedProfile, lookalikeNote } from "@/lib/lookalike";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY = 86400000;
const daysAgo = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / DAY) : null);

export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, reason: "not_authenticated" }, 401);
  const uid = user.id;
  const url = new URL(request.url);
  const limit = Math.min(120, Math.max(10, parseInt(url.searchParams.get("limit") || "40", 10)));

  let host = url.searchParams.get("host") || null;
  let plan = "free";
  try {
    const { data: scan } = await supabase.from("scans").select("url, final_url")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!host && scan) host = hostOf(scan);
  } catch {}
  try {
    const { data: p } = await supabase.from("profiles").select("plan").eq("id", uid).maybeSingle();
    plan = p?.plan === "pro" ? "pro" : "free";
  } catch {}

  const [pages, emails, posts, ranks, evs, stuckWork] = await Promise.all([
    safe(() => supabase.from("published_pages")
      .select("id, title, handle, slug, published_at, target_keyword")
      .eq("user_id", uid).order("published_at", { ascending: false }).limit(40)),
    safe(() => supabase.from("outreach_log")
      .select("contact_email, contact_name, subject, body, status, sent_at, replied_at, is_followup, followup_step")
      .eq("user_id", uid).not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(60)),
    safe(() => supabase.from("placements")
      .select("platform, target_title, target_url, posted_at, reply_count, performance")
      .eq("user_id", uid).eq("status", "posted").order("posted_at", { ascending: false }).limit(40)),
    safe(() => supabase.from("keyword_history")
      .select("keyword, position, recorded_on").eq("user_id", uid)
      .order("recorded_on", { ascending: false }).limit(300)),
    safe(() => getEvents(supabase, { userId: uid, types: ["publish.own_url", "lead.captured", "conversion.recorded", "link.earned", "content.discarded"], limit: 120 })),
    // ── WHAT DID NOT GO OUT ──
    // "I pressed publish and cannot find it anywhere" had no answer. A publish that
    // failed, or that was held for review, said so in a toast and then the toast
    // went away — so the only record of the most alarming thing that can happen was
    // a sentence the owner had four seconds to read. This page is meant to be the
    // place work cannot vanish from, and that has to include work that never left.
    safe(() => supabase.from("actions")
      .select("id, type, title, status, result, updated_at, payload")
      .eq("user_id", uid).in("status", ["failed", "needs_review"])
      .order("updated_at", { ascending: false }).limit(20)),
  ]);

  const events = Array.isArray(evs) ? evs : [];
  // A page served from the owner's own domain reports THAT address, not ours.
  const ownUrlByPage = {};
  for (const e of events) if (e?.type === "publish.own_url" && e?.data?.pageId) ownUrlByPage[e.data.pageId] = e.data.url;

  // Visits per published page, counted first-party by the owner's own snippet.
  const visits = {};
  try {
    const views = await getEvents(supabase, { userId: uid, types: ["traffic.pageview"], limit: 1000 });
    for (const v of views || []) {
      const p = String(v?.data?.path || v?.subject || "");
      if (p) visits[p] = (visits[p] || 0) + 1;
    }
  } catch {}

  const items = [];

  // ── ARTICLES. The thing that used to vanish on refresh.
  for (const p of pages || []) {
    const live = ownUrlByPage[p.id] || pageUrl(p.handle, p.slug);
    const slugKey = `/${p.slug}`;
    const seen = visits[slugKey] || visits[`/p/${p.handle}/${p.slug}`] || 0;
    const age = daysAgo(p.published_at);
    items.push({
      at: p.published_at, kind: "published",
      title: p.title || p.slug,
      url: live, linkLabel: live.replace(/^https?:\/\//, ""),
      // WHY Genie did it. The approval card explained the choice and then the
      // explanation died with the card, so a week later the owner has a list of
      // things that happened and no idea what any of them was for.
      why: p.target_keyword
        ? `Written to win the Google search "${p.target_keyword}" — a question your buyers actually type, that your site had no answer for.`
        : "Written to answer a question your buyers search for, that your site had no page for.",
      meta: seen > 0 ? `${seen} visit${seen === 1 ? "" : "s"}` : null,
      note: age !== null && age < 60
        ? "Normal for a new article. These take three to six months to build up in Google."
        : "Older article. Genie refreshes these when they start to slip.",
      where: "This is live on your site. Open it.",
    });
  }

  // ── EMAILS. Who, what, and whether they opened it.
  for (const e of emails || []) {
    const who = e.contact_name || e.contact_email;
    const age = daysAgo(e.sent_at);
    const replied = !!e.replied_at;
    const opened = e.status === "opened";
    items.push({
      at: e.sent_at,
      kind: replied ? "reply" : e.is_followup ? "followup" : "email",
      title: e.is_followup ? `Follow-up ${e.followup_step || 1} to ${who}` : `Emailed ${who}`,
      sub: e.subject || null,
      // ── THE WORDS THAT WENT OUT UNDER THEIR NAME ──
      // "How can I see what Genie sent? What if it sent something wrong?" had no
      // answer: the body was stored on every send and shown on no screen. An owner
      // could see that forty emails went out and could not read one of them, which
      // is not something you can ask a person to be comfortable with.
      body: e.body || null,
      to: e.contact_email || null,
      why: e.is_followup
        ? "They did not answer the first one. Two follow-ups roughly double the replies a cold campaign gets, so Genie writes them on a schedule instead of hoping."
        : "This company matches who your plan says you sell to, and published this address on their own website — Genie never buys or guesses an address.",
      meta: replied ? "replied" : opened ? "opened" : null,
      note: replied
        ? "They wrote back. There is a draft answer waiting in Leads."
        : opened
          ? "They opened it. That is a good sign, and Genie will follow up if they stay quiet."
          : age !== null && age < 4
            ? "No reply yet is normal. Most people answer the second or third message."
            : e.is_followup
              ? "Genie has now written twice. One more, then it leaves them alone."
              : "Genie will follow up in a few days with a different angle.",
      where: "This is in your own Gmail Sent folder.",
    });
  }

  // ── COMMUNITY POSTS. Ones the owner pressed post on themselves.
  for (const p of posts || []) {
    items.push({
      at: p.posted_at, kind: "post",
      title: `Posted on ${p.platform || "a community"}`,
      sub: p.target_title || null,
      url: p.target_url && p.target_url !== "#" ? p.target_url : null,
      meta: p.reply_count ? `${p.reply_count} repl${p.reply_count === 1 ? "y" : "ies"}` : null,
      note: p.reply_count
        ? "People are replying. Genie drafts your answers in Leads."
        : "Genie checks these for replies every night.",
      where: "You posted this yourself, so it is on your own account.",
    });
  }

  // ── RANKINGS. Real Google positions, only where they actually moved.
  const byKw = {};
  for (const r of ranks || []) {
    if (!r.keyword || r.position == null) continue;
    (byKw[r.keyword] ||= []).push(r);
  }
  for (const [keyword, rows] of Object.entries(byKw)) {
    if (rows.length < 2) continue;
    const now = rows[0], before = rows[rows.length - 1];
    const moved = Math.round(before.position - now.position);
    if (Math.abs(moved) < 3) continue;
    items.push({
      at: `${now.recorded_on}T12:00:00.000Z`, kind: "rank",
      title: `"${keyword}" moved ${moved > 0 ? "up" : "down"} to position ${Math.round(now.position)}`,
      meta: `was ${Math.round(before.position)}`,
      note: now.position <= 10
        ? "That is page one of Google."
        : `That is page ${Math.ceil(now.position / 10)} of Google. Page one is the target.`,
      where: "These are real numbers from your own Google Search Console.",
    });
  }

  // ── THINGS THAT DID NOT PUBLISH, AND WHY.
  for (const a of Array.isArray(stuckWork) ? stuckWork : []) {
    const name = a?.payload?.title || a?.title || "An article";
    if (a.status === "failed") {
      items.push({
        at: a.updated_at, kind: "failed",
        title: `Did not publish: "${name}"`,
        why: "Genie had written it and was putting it live when something stopped it.",
        note: a?.result?.error
          ? `It stopped with: ${String(a.result.error).slice(0, 220)}`
          : "It stopped part-way through and Genie did not record why.",
        where: "Nothing was sent or posted. Open Approvals and approve it again to retry.",
      });
    } else {
      const reasons = Array.isArray(a?.result?.reasons) ? a.result.reasons.filter(Boolean) : [];
      items.push({
        at: a.updated_at, kind: "held",
        title: `Waiting on you: "${name}"`,
        why: "Genie checks everything it writes for claims it cannot back up, because the article goes out under your name, not Genie's.",
        note: reasons.length
          ? `Genie rewrote what it could and this is what is left: ${reasons.slice(0, 2).join(" ")}`
          : "Genie held this back rather than publish it under your name.",
        where: "It is in Approvals. Edit it there, then approve again.",
      });
    }
  }

  // ── LEADS, SALES AND EARNED LINKS.
  for (const e of events) {
    // ── WORK GENIE THREW AWAY ──
    // An article too close to one already published is dropped rather than handed
    // to the owner to rewrite. That is a decision made on their behalf about their
    // own site, so it is shown, not swallowed. Nothing here gets to delete work and
    // stay quiet about it.
    if (e.type === "content.discarded") {
      items.push({
        at: e.created_at, kind: "discarded",
        title: `Not published: "${e.subject || "an article"}"`,
        why: "Genie wrote two articles too close to each other. Publishing near-copies is what gets a site pushed down by Google, so it threw its own work away rather than risk your site.",
        note: `Genie had already written something too close to "${e.data?.duplicateOf || "an earlier article"}", so it threw this one away rather than publish a near-copy — that is what gets a site penalised by Google. It writes a different one tonight.`,
        where: "Nothing for you to do. Shown so you know why the article you saw yesterday is gone.",
      });
    } else if (e.type === "lead.captured") {
      items.push({ at: e.created_at, kind: "lead", title: `A lead on your site${e.data?.email ? `: ${e.data.email}` : ""}`,
        note: "Caught by the snippet on your own website.", where: "Reply to them in Leads." });
    } else if (e.type === "conversion.recorded") {
      items.push({ at: e.created_at, kind: "sale", title: `A sale${e.data?.value ? ` worth ${e.data.value}` : ""}`,
        note: "Traced back to the page and search that earned it.", where: "The full trail is on Results." });
    } else if (e.type === "link.earned") {
      items.push({ at: e.created_at, kind: "link", title: `${e.subject || "A site"} linked to you`,
        url: e.data?.url || null, note: "Links from other people's sites are what compound.", where: "Open it and see." });
    }
  }

  items.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));

  // ── FIRSTS. Marked once, on the earliest of each kind, because the first of
  //    anything is the moment a beginner decides this is real.
  const firstOf = {};
  for (let i = items.length - 1; i >= 0; i--) {
    const k = items[i].kind;
    if (!firstOf[k]) { firstOf[k] = true; items[i].first = true; }
  }

  const totals = {
    articles: (pages || []).length,
    emails: (emails || []).length,
    replies: (emails || []).filter((e) => e.replied_at).length,
    conversations: (posts || []).length,
    visits: Object.values(visits).reduce((a, b) => a + b, 0),
    leads: events.filter((e) => e.type === "lead.captured").length,
    sales: events.filter((e) => e.type === "conversion.recorded").length,
  };

  // ── WHAT GENIE WILL DO NEXT. Actions only. Nothing here depends on a stranger.
  const next = [];
  try {
    const { cap, ramping, reason } = await effectiveDailyCap(supabase, uid, plan);
    next.push(`Emails: up to ${cap} a day.${ramping ? ` ${reason}` : ""}`);
  } catch {}
  const silent = (emails || []).filter((e) => !e.replied_at && daysAgo(e.sent_at) >= 3).length;
  if (silent > 0) next.push(`Follow-ups: ${silent} ${silent === 1 ? "person has" : "people have"} gone quiet, so Genie writes to them again with a different angle.`);
  // Whether the list is getting better, in one line. Without this the loop is
  // invisible and the owner has no way to see it working.
  try {
    const note = lookalikeNote(await repliedProfile(supabase, { userId: uid, host }));
    if (note) next.push(`Who to look for: ${note}`);
  } catch {}
  next.push("Writing: one article a night, on the search your keyword strategy picked.");
  next.push("Checking: your Google positions every night, and what the AI assistants answer every week.");

  return json({
    ok: true, host,
    items: items.slice(0, limit),
    totals, next,
    // Said once, plainly. It is the strongest thing Genie can say and it costs
    // nothing, because it was already true.
    trust: "Everything here happened in your own accounts. The emails are in your Gmail, the articles are on your site. Go and look.",
  });
}

async function safe(fn) { try { const r = await fn(); return r?.data ?? r ?? []; } catch { return []; } }
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } }); }
