// app/api/distribute/route.js
// ── CLOSED. A RETIRED V1 ROUTE THAT COULD STILL FILL YOUR APPROVALS QUEUE. ──
//
// Nothing in the app calls this: no page, no component, no cron, no other route.
// test/one-brain.test.js already lists it as "retired V1 route, unreferenced" and
// exempts it from the rule that every engine must write from the stored plan.
//
// Being exempt from that rule is exactly why leaving it reachable was wrong. It
// was a live, authenticated endpoint that inserted rows straight into `actions` —
// the approvals queue — written by a model that had never been shown the business
// plan, and without passing lib/publish-guard.js. Work could appear in the owner's
// morning queue that no nightly engine produced and no guard had seen.
//
// Left in place rather than deleted so the 410 says what happened. The live path
// is the nightly run: /api/cron/genie -> lib/genie-jobs.js -> /api/content.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GONE = {
  ok: false,
  error: "This endpoint is retired. The live path is /api/content (the nightly run writes and distributes).",
};

export async function POST() {
  return new Response(JSON.stringify(GONE), { status: 410, headers: { "Content-Type": "application/json" } });
}
export async function GET() {
  return new Response(JSON.stringify(GONE), { status: 410, headers: { "Content-Type": "application/json" } });
}
