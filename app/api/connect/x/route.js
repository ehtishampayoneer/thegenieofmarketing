// app/api/connect/x/route.js
// ── CLOSED. THERE IS NO WAY TO CONNECT X, AND NOTHING THAT WOULD POST TO IT. ──
//
// Nothing in the app links here: zero references in the whole repo. Even if a
// connection existed it would do nothing, because app/api/approvals/route.js
// marks only articles and emails sendable, and app/approvals/page.js copies a
// social post to the clipboard and returns before any send could happen.
//
// The product decided not to auto-post to social — automated posting is what gets
// accounts flagged — and lib/selftest.js already says so out loud: "X posts are
// copy and paste now, so there is nothing to connect." Three screens went on
// implying otherwise. They no longer do, and neither does this.
//
// The copy-and-paste flow is untouched: Genie still writes the post every night
// and Approvals still opens X with it ready.
//
// Optional tidy-up: X_CLIENT_ID, X_CLIENT_SECRET and X_REDIRECT_URI can come out
// of Vercel.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const GONE = { ok: false, error: "X is not connectable. Genie writes each post and you paste it from Approvals." };

export async function GET() {
  return new Response(JSON.stringify(GONE), { status: 410, headers: { "Content-Type": "application/json" } });
}
export async function POST() {
  return new Response(JSON.stringify(GONE), { status: 410, headers: { "Content-Type": "application/json" } });
}
export async function DELETE() {
  return new Response(JSON.stringify(GONE), { status: 410, headers: { "Content-Type": "application/json" } });
}
