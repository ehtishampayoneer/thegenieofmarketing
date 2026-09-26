// app/api/outreach/send/route.js
// ── CLOSED. THIS WAS A SEND PATH WITH NO UNSUBSCRIBE LINK. ──
//
// A V1 route, superseded by /api/actions/[id]/execute, and called by nothing:
// no page, no component, no cron, no other route. It was still deployed, still
// authenticated, and still able to send.
//
// What made it worth closing rather than leaving alone: it was the only send path
// in this codebase with neither an unsubscribe link nor an opt-out check.
//
//   route                            unsubscribe   suppression check
//   /api/actions/[id]/execute             yes            yes
//   /api/outreach/campaign                yes            yes
//   /api/prospects/send                   yes            yes
//   /api/announce                         yes            yes
//   this one                              NO             NO
//
// lib/email-engine.js gates both the unsubscribe block and the List-Unsubscribe
// header on being handed an unsubscribeUrl. This route never passed one, so every
// email it sent was a cold approach a recipient could not opt out of — and it
// never asked whether they already had. It also wrote no outreach_log row, so its
// sends were invisible to the worklog, uncounted by the daily cap, and invisible
// to the exclusion list that stops Genie writing to the same stranger twice.
//
// Left in place rather than deleted so the 410 says what happened. Anything that
// still points here should point at /api/actions/[id]/execute, which does all
// four things this one did not.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GONE = {
  ok: false,
  error: "This endpoint is closed. Approve the email in Approvals, which sends it through /api/actions/[id]/execute with an unsubscribe link and an opt-out check.",
};

export async function POST() {
  return new Response(JSON.stringify(GONE), { status: 410, headers: { "Content-Type": "application/json" } });
}
export async function GET() {
  return new Response(JSON.stringify(GONE), { status: 410, headers: { "Content-Type": "application/json" } });
}
