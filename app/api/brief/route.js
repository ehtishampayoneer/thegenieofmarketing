// app/api/brief/route.js
// The Daily Brief — Genie's morning email: "here's my plan for today."
// GET  = Vercel cron (guarded by CRON_SECRET) → sends to ALL users with pending work.
// POST = signed-in user requests a test brief → sends only to them.
// Uses Resend's REST API directly (no SDK).

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

  // Everyone with proposed actions gets a brief.
  const { data: rows } = await admin
    .from("actions")
    .select("user_id, type, title, priority, status")
    .eq("status", "proposed")
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
    .eq("status", "proposed")
    .limit(50);

  const ok = await sendBrief(user.email, actions || []);
  return json(ok ? { ok: true } : { ok: false, error: "Send failed — check your Resend setup." }, ok ? 200 : 500);
}

async function sendBrief(email, actions) {
  const sorted = [...actions].sort(
    (a, b) => (PRIO_ORDER[a.priority] ?? 3) - (PRIO_ORDER[b.priority] ?? 3)
  );
  const top = sorted.slice(0, 3);
  const count = actions.length;
  const appUrl = process.env.APP_URL || "https://thegenieofmarketing.vercel.app";

  const items = top.map((a) => `
    <tr>
      <td style="padding:10px 14px;border:1px solid #ECECF4;border-radius:10px;display:block;margin-bottom:8px;background:#FBFBFE;">
        <div style="font-weight:600;color:#0F1222;font-size:14px;">${escapeHtml(a.title || a.type)}</div>
        <div style="color:#8A8FA3;font-size:12px;margin-top:2px;">${PRIO_LABEL[a.priority] || "Normal"} · ${escapeHtml(String(a.type).replace(/_/g, " "))}</div>
      </td>
    </tr>`).join("");

  const html = `
  <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
    <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#6D28D9,#4F46E5);"></div>
    <h1 style="font-size:20px;color:#0F1222;margin:16px 0 4px;">Genie's plan for today</h1>
    <p style="color:#4A4E63;font-size:14px;margin:0 0 16px;">
      ${count === 0
        ? "Nothing waiting — run a scan or generate content to give Genie work."
        : `${count} action${count > 1 ? "s" : ""} waiting for your approval. Here are the top ${top.length}:`}
    </p>
    <table style="width:100%;border-collapse:separate;">${items}</table>
    <a href="${appUrl}/dashboard" style="display:inline-block;margin-top:16px;background:linear-gradient(135deg,#6D28D9,#4F46E5);color:#fff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:12px;text-decoration:none;">
      Review &amp; approve →
    </a>
    <p style="color:#8A8FA3;font-size:11px;margin-top:20px;">
      You approve — Genie does the doing. Community &amp; outreach drafts are always posted by you.
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
        ? `Genie's plan for today — ${count} action${count > 1 ? "s" : ""} waiting`
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
