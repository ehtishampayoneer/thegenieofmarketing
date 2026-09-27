// app/api/brief/route.js
// The Daily Brief — Genie's morning email: "here's my plan for today."
// GET  = Vercel cron (guarded by CRON_SECRET) → sends to ALL users with pending work.
// POST = signed-in user requests a test brief → sends only to them.
// Uses Resend's REST API directly (no SDK).

import { DAILY_CARDS } from "@/lib/queue-count";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const PRIO_ORDER = { high: 0, quick_win: 1, strategic: 2, medium: 3, low: 4 };
const PRIO_LABEL = {
  high: "🔥 High-impact", quick_win: "⚡ Quick win",
  strategic: "🧠 Strategic", medium: "Normal", low: "💤 Low",
};

// ----- Cron entry: all users -----
export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  if (!process.env.RESEND_API_KEY) {
    return json({ ok: false, error: "RESEND_API_KEY not set" }, 500);
  }

  const admin = createAdminClient();

  // Everyone with anything waiting gets a brief.
  const { data: rows } = await admin
    .from("actions")
    .select("user_id, type, title, priority, status")
    // The same three states the approvals queue and its badge count
    // (lib/queue-count.js). This read only "proposed", so an article the safety
    // check held and a publish that failed — the two things most worth hearing
    // about over breakfast — were the two things the morning email never said.
    .in("status", ["proposed", "needs_review", "failed"])
    .limit(2000);

  const byUser = new Map();
  for (const r of rows || []) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push(r);
  }

  let sent = 0, failed = 0;
  for (const [userId, actions] of byUser) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (!email) continue;
      const ok = await sendBrief(email, actions);
      ok ? sent++ : failed++;
    } catch {
      failed++;
    }
  }

  return json({ ok: true, sent, failed, users: byUser.size });
}

// ----- Test entry: just me -----
export async function POST() {
  if (!process.env.RESEND_API_KEY) {
    return json({ ok: false, error: "Email isn't configured yet (RESEND_API_KEY missing)." }, 500);
  }
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return json({ ok: false, reason: "not_authenticated" }, 401);

  const { data: actions } = await supabase
    .from("actions")
    .select("type, title, priority, status")
    .in("status", ["proposed", "needs_review", "failed"])
    .limit(50);

  const ok = await sendBrief(user.email, actions || []);
  return json(ok ? { ok: true } : { ok: false, error: "Send failed — check your Resend setup." }, ok ? 200 : 500);
}

async function sendBrief(email, actions) {
  // ── THE EMAIL SAYS WHAT THE APP SAYS ──
  // This was written for the first version of Genie and never updated: it counted
  // every waiting draft ("76 actions waiting") while the app says "3 for you
  // today"; it ranked by priority while the queue ranks articles, then emails,
  // then pitches; its button went to /dashboard, which only redirects; it said
  // outreach is "always posted by you", which stopped being true when approving
  // an email started sending it; and it wore the old purple. Two surfaces giving
  // two answers about the same morning is the bug this codebase keeps having.
  const KIND_RANK = { article: 0, outreach_email: 1, media_pitch: 2 };
  const rank = (a) => (KIND_RANK[a.type] ?? 3) * 10 + (PRIO_ORDER[a.priority] ?? 3);
  const needsYou = actions.filter((a) => a.status === "needs_review" || a.status === "failed");
  const ready = actions.filter((a) => a.status === "proposed").sort((a, b) => rank(a) - rank(b));
  const today = ready.slice(0, DAILY_CARDS);
  const behind = Math.max(0, ready.length - today.length);
  const count = actions.length;
  const appUrl = (process.env.APP_URL || "https://thegenieofmarketing.vercel.app").replace(/\/+$/, "");

  const row = (a, note) => `
    <tr>
      <td style="padding:12px 14px;border:1px solid #E5E5EA;border-radius:12px;display:block;margin-bottom:8px;background:#FFFFFF;">
        <div style="font-weight:600;color:#1D1D1F;font-size:14px;">${escapeHtml(a.title || a.type)}</div>
        <div style="color:${note ? "#C93400" : "#6E6E73"};font-size:12px;margin-top:3px;">${note || `${PRIO_LABEL[a.priority] || "Normal"} · ${escapeHtml(String(a.type).replace(/_/g, " "))}`}</div>
      </td>
    </tr>`;

  const held = needsYou.map((a) => row(a, a.status === "failed"
    ? "Did not go out — open it to see why"
    : "Held by the safety check — open it to see the reason")).join("");
  const items = today.map((a) => row(a)).join("");

  const lede = count === 0
    ? "Nothing is waiting. Genie will have more for you after tonight's run."
    : `${today.length} for you today${behind ? `, ${behind} lined up behind them` : ""}.${needsYou.length ? ` ${needsYou.length} ${needsYou.length === 1 ? "needs" : "need"} you first.` : ""}`;

  const html = `
  <div style="font-family:Inter,-apple-system,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#F5F5F7;">
    <h1 style="font-size:21px;color:#1D1D1F;margin:0 0 6px;letter-spacing:-.01em;">Genie did the work. <span style="color:#0071E3;">You just approve.</span></h1>
    <p style="color:#424245;font-size:14px;margin:0 0 16px;">${lede}</p>
    ${needsYou.length ? `<p style="color:#C93400;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:0 0 8px;">Needs you</p><table style="width:100%;border-collapse:separate;">${held}</table>` : ""}
    ${items ? `<p style="color:#6E6E73;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin:14px 0 8px;">Today</p><table style="width:100%;border-collapse:separate;">${items}</table>` : ""}
    <a href="${appUrl}/approvals" style="display:inline-block;margin-top:14px;background:#0071E3;color:#fff;font-weight:600;font-size:14px;padding:11px 20px;border-radius:100px;text-decoration:none;">
      Open Approvals →
    </a>
    <p style="color:#6E6E73;font-size:11px;margin-top:20px;line-height:1.5;">
      Nothing publishes or sends until you approve it. Emails send from your own Gmail when you approve them; social posts are copied for you to post yourself.
    </p>
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.BRIEF_FROM || "Genie <onboarding@resend.dev>",
      to: [email],
      subject: count > 0
        ? (needsYou.length
            ? `${needsYou.length} ${needsYou.length === 1 ? "thing needs" : "things need"} you — and ${today.length} ready to approve`
            : `${today.length} for you today`)
        : "Genie's plan for today",
      html,
    }),
  });
  return res.ok;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
